import { and, asc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import type { BancoDados, Executor } from "@/db";
import { fornecedor, obra, obraEtapa, obraSemana, obraServico, obraServicoSemana, orcamento } from "@/db/schema";
import { chaveEtapa, exibirNoRelatorioPadrao } from "@/dominio/eap";
import { calcularAvanco, semanaDaData, validarSerie, type Serie, type ServicoFisico } from "@/dominio/fisico";
import { curvaABC } from "@/dominio/orcamento";
import { hojeIso } from "@/dominio/calendario";
import { lerFisicoPlanilha } from "@/lib/importar-fisico";
import { auditarEdicao, registrarAuditoria } from "./auditoria";
import { type Contexto, ErroNegocio } from "./contexto";
import { carregarOrcamento } from "./orcamentos";

const ORDEM_TIPO = { CONTRATO: 0, ADITIVO: 1, FATURAMENTO_DIRETO: 2 } as const;
const EPS = 1e-9;

async function exigirObra(db: Executor, empresaId: string, obraId: string) {
  const [o] = await db.select().from(obra).where(and(eq(obra.id, obraId), eq(obra.empresaId, empresaId), isNull(obra.excluidoEm)));
  if (!o) throw new ErroNegocio("Obra não encontrada");
  return o;
}

async function etapasDaObra(db: Executor, obraId: string) {
  const etapas = await db.select().from(obraEtapa).where(eq(obraEtapa.obraId, obraId));
  // Contrato → Aditivos → Faturamento direto; categorias novas entram no fim do grupo de contrato.
  return etapas.sort((a, b) => ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo] || a.ordem - b.ordem);
}

// ───────────── Leitura ─────────────

export async function carregarFisico(db: Executor, empresaId: string, obraId: string, hoje = hojeIso()) {
  const o = await exigirObra(db, empresaId, obraId);
  const etapas = await etapasDaObra(db, obraId);
  const linhas = await db.select({ s: obraServico, fornecedorNome: fornecedor.nome }).from(obraServico)
    .leftJoin(fornecedor, eq(fornecedor.id, obraServico.fornecedorId))
    .where(eq(obraServico.obraId, obraId)).orderBy(asc(obraServico.ordem));
  const ids = linhas.map((l) => l.s.id);
  const semanas = ids.length ? await db.select().from(obraServicoSemana).where(inArray(obraServicoSemana.servicoId, ids)) : [];
  const [{ n: semanasCalendario }] = (await db.select({ n: max(obraSemana.numero) }).from(obraSemana).where(eq(obraSemana.obraId, obraId))) as [{ n: number | null }];

  const ordemEtapa = new Map(etapas.map((e, i) => [e.id, i]));
  const servicos = linhas
    .sort((a, b) => (ordemEtapa.get(a.s.etapaId) ?? 0) - (ordemEtapa.get(b.s.etapaId) ?? 0) || a.s.ordem - b.s.ordem)
    .map(({ s, fornecedorNome }) => {
      const previsto: Record<number, number> = {};
      const realizado: Record<number, number> = {};
      for (const x of semanas) if (x.servicoId === s.id) {
        if (x.previsto) previsto[x.semana] = x.previsto;
        if (x.realizado) realizado[x.semana] = x.realizado;
      }
      return { ...s, fornecedorNome, previsto, realizado };
    });

  const paraMotor: ServicoFisico[] = servicos.map((s) => ({ id: s.id, etapaId: s.etapaId, duracao: s.duracaoDias, valorCliente: s.valorCliente, previsto: s.previsto, realizado: s.realizado }));
  const semanaAtual = semanaDaData(o.dataInicio, hoje);
  const nSemanas = Math.max(semanasCalendario ?? 0, semanaAtual, 1);
  const avanco = calcularAvanco(etapas, paraMotor, nSemanas);
  // Curva ABC calculada pela verba (quando não informada na planilha).
  const abc = new Map(curvaABC(servicos, (s) => s.maoDeObraVerba).map((x) => [x.item.id, x.classe]));
  const totais = {
    acertada: servicos.reduce((t, s) => t + (s.maoDeObraAcertada ?? 0), 0),
    verba: servicos.reduce((t, s) => t + s.maoDeObraVerba, 0),
    cliente: servicos.reduce((t, s) => t + s.valorCliente, 0),
    clienteContrato: servicos.filter((s) => etapas.find((e) => e.id === s.etapaId)?.tipo === "CONTRATO").reduce((t, s) => t + s.valorCliente, 0),
  };
  return { obra: o, etapas, servicos, avanco, abc, totais, semanaAtual, nSemanas: avanco.semanas };
}

export type FisicoCarregado = Awaited<ReturnType<typeof carregarFisico>>;

// ───────────── Planilha da obra (serviços) ─────────────

export interface DadosServico {
  etapaId: string;
  descricao: string;
  fornecedorId: string | null;
  maoDeObraAcertada: number | null;
  maoDeObraVerba: number;
  valorCliente: number;
  duracaoDias: number;
  curvaAbc: "A" | "B" | "C" | null;
  observacao: string | null;
}

function validarServico(d: DadosServico) {
  if (!d.descricao.trim()) throw new ErroNegocio("Informe o nome do serviço", "descricao");
  for (const [campo, v] of [["maoDeObraVerba", d.maoDeObraVerba], ["valorCliente", d.valorCliente], ["duracaoDias", d.duracaoDias], ["maoDeObraAcertada", d.maoDeObraAcertada ?? 0]] as const) {
    if (!Number.isFinite(v)) throw new ErroNegocio("Valor inválido", campo);
    if (v < 0) throw new ErroNegocio("O valor não pode ser negativo", campo);
  }
  if (d.duracaoDias > 3650) throw new ErroNegocio("Duração acima de 10 anos", "duracaoDias");
}

async function validarReferencias(db: Executor, empresaId: string, obraId: string, d: DadosServico) {
  const [e] = await db.select({ id: obraEtapa.id }).from(obraEtapa).where(and(eq(obraEtapa.id, d.etapaId), eq(obraEtapa.obraId, obraId)));
  if (!e) throw new ErroNegocio("Etapa inválida para esta obra", "etapaId");
  if (d.fornecedorId) {
    const [f] = await db.select({ id: fornecedor.id }).from(fornecedor).where(and(eq(fornecedor.id, d.fornecedorId), eq(fornecedor.empresaId, empresaId)));
    if (!f) throw new ErroNegocio("Fornecedor inválido", "fornecedorId");
  }
}

async function proximaOrdem(db: Executor, obraId: string, etapaId: string) {
  const [{ m }] = (await db.select({ m: max(obraServico.ordem) }).from(obraServico)
    .where(and(eq(obraServico.obraId, obraId), eq(obraServico.etapaId, etapaId)))) as [{ m: number | null }];
  return (m ?? 0) + 1;
}

export async function salvarServico(banco: BancoDados, ctx: Contexto, obraId: string, d: DadosServico, servicoId?: string) {
  validarServico(d);
  return banco.transaction(async (tx) => {
    await exigirObra(tx, ctx.empresaId, obraId);
    await validarReferencias(tx, ctx.empresaId, obraId, d);
    const base = { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "obra_servico", obraId, ip: ctx.ip };
    if (!servicoId) {
      const [novo] = await tx.insert(obraServico).values({ ...d, obraId, ordem: await proximaOrdem(tx, obraId, d.etapaId) }).returning();
      await registrarAuditoria(tx, { ...base, acao: "CRIAR", entidadeId: novo!.id, descricao: `Serviço "${d.descricao}" incluído na planilha da obra` });
      return novo!;
    }
    const [antes] = await tx.select().from(obraServico).where(and(eq(obraServico.id, servicoId), eq(obraServico.obraId, obraId)));
    if (!antes) throw new ErroNegocio("Serviço não encontrado");
    const ordem = antes.etapaId === d.etapaId ? antes.ordem : await proximaOrdem(tx, obraId, d.etapaId);
    const [depois] = await tx.update(obraServico).set({ ...d, ordem }).where(eq(obraServico.id, servicoId)).returning();
    await auditarEdicao(tx, { ...base, entidadeId: servicoId, descricao: `Serviço "${d.descricao}"` }, antes, depois!);
    return depois!;
  });
}

export async function excluirServico(banco: BancoDados, ctx: Contexto, obraId: string, servicoId: string) {
  return banco.transaction(async (tx) => {
    await exigirObra(tx, ctx.empresaId, obraId);
    const [{ r }] = (await tx.select({ r: sql<number>`coalesce(sum(abs(${obraServicoSemana.realizado})), 0)` }).from(obraServicoSemana)
      .where(eq(obraServicoSemana.servicoId, servicoId))) as [{ r: number }];
    if (Number(r) > EPS) throw new ErroNegocio("Este serviço já tem avanço realizado lançado. Zere o realizado antes de excluir, para não alterar medições e relatórios.");
    const [s] = await tx.delete(obraServico).where(and(eq(obraServico.id, servicoId), eq(obraServico.obraId, obraId))).returning();
    if (!s) throw new ErroNegocio("Serviço não encontrado");
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EXCLUIR", entidade: "obra_servico", entidadeId: servicoId, obraId, descricao: `Serviço "${s.descricao}" removido da planilha da obra`, antes: s, ip: ctx.ip });
  });
}

/** Categoria nova (etapa) criada durante a obra — aparece no relatório por padrão. */
export async function criarEtapaObra(banco: BancoDados, ctx: Contexto, obraId: string, nome: string) {
  const n = nome.trim();
  if (n.length < 2) throw new ErroNegocio("Informe o nome da categoria", "nome");
  return banco.transaction(async (tx) => {
    await exigirObra(tx, ctx.empresaId, obraId);
    const etapas = await tx.select().from(obraEtapa).where(eq(obraEtapa.obraId, obraId));
    if (etapas.some((e) => chaveEtapa(e.nome) === chaveEtapa(n))) throw new ErroNegocio("Já existe uma categoria com este nome", "nome");
    const ordem = etapas.reduce((m, e) => Math.max(m, e.ordem), 0) + 1;
    const [e] = await tx.insert(obraEtapa).values({ obraId, ordem, nome: n, tipo: "CONTRATO", exibirNoRelatorio: true }).returning();
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "obra_etapa", entidadeId: e!.id, obraId, descricao: `Categoria "${n}" criada na obra`, ip: ctx.ip });
    return e!;
  });
}

export async function alterarEtapaRelatorio(banco: BancoDados, ctx: Contexto, obraId: string, etapaId: string, exibir: boolean) {
  return banco.transaction(async (tx) => {
    await exigirObra(tx, ctx.empresaId, obraId);
    const [antes] = await tx.select().from(obraEtapa).where(and(eq(obraEtapa.id, etapaId), eq(obraEtapa.obraId, obraId)));
    if (!antes) throw new ErroNegocio("Categoria não encontrada");
    const [depois] = await tx.update(obraEtapa).set({ exibirNoRelatorio: exibir }).where(eq(obraEtapa.id, etapaId)).returning();
    await auditarEdicao(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "obra_etapa", entidadeId: etapaId, obraId, descricao: `Categoria "${antes.nome}" no relatório`, ip: ctx.ip }, antes, depois!);
  });
}

export async function salvarPeriodoMedicao(banco: BancoDados, ctx: Contexto, obraId: string, semanas: number) {
  if (!Number.isInteger(semanas) || semanas < 1 || semanas > 4) throw new ErroNegocio("O período de medição deve ser de 1 a 4 semanas", "semanasPorMedicao");
  return banco.transaction(async (tx) => {
    const antes = await exigirObra(tx, ctx.empresaId, obraId);
    const [depois] = await tx.update(obra).set({ semanasPorMedicao: semanas }).where(eq(obra.id, obraId)).returning();
    await auditarEdicao(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "obra", entidadeId: obraId, obraId, descricao: "Período de medição", ip: ctx.ip }, antes, depois!);
  });
}

// ───────────── Previsto e realizado semanais ─────────────

export interface AlteracaoSemana { servicoId: string; semana: number; valor: number | null }

/**
 * Grava células de previsto ou realizado. Tudo ou nada: se algum serviço passar de 100% (ou ficar negativo)
 * nada é gravado e a mensagem lista os serviços.
 */
export async function salvarSemanas(banco: BancoDados, ctx: Contexto, obraId: string, serie: Serie, alteracoes: AlteracaoSemana[]) {
  if (alteracoes.length === 0) return { alteradas: 0 };
  if (alteracoes.length > 20000) throw new ErroNegocio("Alterações demais de uma vez");
  for (const a of alteracoes) {
    if (!Number.isInteger(a.semana) || a.semana < 1 || a.semana > 520) throw new ErroNegocio(`Semana inválida: ${a.semana}`);
    if (a.valor != null && (!Number.isFinite(a.valor) || a.valor < -1 - EPS || a.valor > 1 + EPS)) throw new ErroNegocio("Cada semana deve ficar entre −100% e 100%");
  }
  return banco.transaction(async (tx) => {
    await exigirObra(tx, ctx.empresaId, obraId);
    const ids = [...new Set(alteracoes.map((a) => a.servicoId))];
    const servicos = await tx.select({ id: obraServico.id, descricao: obraServico.descricao }).from(obraServico)
      .where(and(eq(obraServico.obraId, obraId), inArray(obraServico.id, ids)));
    if (servicos.length !== ids.length) throw new ErroNegocio("Há serviços que não pertencem a esta obra");

    const atuais = await tx.select().from(obraServicoSemana).where(inArray(obraServicoSemana.servicoId, ids));
    const chave = (s: string, n: number) => `${s}|${n}`;
    const mapa = new Map(atuais.map((x) => [chave(x.servicoId, x.semana), x]));
    let alteradas = 0;
    const resumo: { servico: string; semana: number; antes: number | null; depois: number | null }[] = [];
    for (const a of alteracoes) {
      const atual = mapa.get(chave(a.servicoId, a.semana));
      const antes = atual?.[serie] ?? null;
      const valor = a.valor == null || Math.abs(a.valor) < EPS ? null : a.valor;
      if ((antes ?? 0) === (valor ?? 0)) continue;
      alteradas++;
      if (resumo.length < 200) resumo.push({ servico: servicos.find((s) => s.id === a.servicoId)!.descricao, semana: a.semana, antes, depois: valor });
      await tx.insert(obraServicoSemana).values({ servicoId: a.servicoId, semana: a.semana, [serie]: valor, atualizadoPor: ctx.usuarioId })
        .onConflictDoUpdate({ target: [obraServicoSemana.servicoId, obraServicoSemana.semana], set: { [serie]: valor, atualizadoPor: ctx.usuarioId, atualizadoEm: new Date() } });
      mapa.set(chave(a.servicoId, a.semana), { ...(atual ?? { servicoId: a.servicoId, semana: a.semana, previsto: null, realizado: null, atualizadoPor: null, atualizadoEm: new Date() }), [serie]: valor });
    }
    // Remove linhas que ficaram vazias nas duas séries.
    await tx.delete(obraServicoSemana).where(and(inArray(obraServicoSemana.servicoId, ids), isNull(obraServicoSemana.previsto), isNull(obraServicoSemana.realizado)));

    const porServico = ids.map((id) => {
      const r: Record<number, number> = {};
      for (const x of mapa.values()) if (x.servicoId === id && x[serie]) r[x.semana] = x[serie]!;
      return { id, previsto: serie === "previsto" ? r : {}, realizado: serie === "realizado" ? r : {} };
    });
    const { erros } = validarSerie(porServico, serie);
    if (erros.length) {
      const nomes = erros.slice(0, 5).map((e) => `"${servicos.find((s) => s.id === e.servicoId)!.descricao}" (${(e.total * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)`).join(", ");
      throw new ErroNegocio(`O total ${serie === "realizado" ? "realizado" : "previsto"} deve ficar entre 0% e 100% por serviço. Verifique: ${nomes}${erros.length > 5 ? ` e mais ${erros.length - 5}` : ""}. Nada foi salvo.`);
    }
    if (alteradas) {
      const semanasAlteradas = [...new Set(resumo.map((r) => r.semana))].sort((a, b) => a - b);
      await registrarAuditoria(tx, {
        empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EDITAR", entidade: serie === "realizado" ? "realizado_fisico" : "previsto_fisico", obraId,
        descricao: `${serie === "realizado" ? "Realizado" : "Previsto"} físico: ${alteradas} célula(s) alterada(s) — semana(s) ${semanasAlteradas.slice(0, 12).join(", ")}${semanasAlteradas.length > 12 ? "…" : ""}`,
        depois: { alteracoes: resumo } as never, ip: ctx.ip,
      });
    }
    return { alteradas };
  });
}

// ───────────── Geração e importação ─────────────

async function exigirPlanilhaVazia(db: Executor, obraId: string) {
  const [{ n }] = (await db.select({ n: sql<number>`count(*)` }).from(obraServico).where(eq(obraServico.obraId, obraId))) as [{ n: number }];
  return Number(n) === 0;
}

async function limparPlanilha(tx: Executor, obraId: string) {
  const ids = (await tx.select({ id: obraServico.id }).from(obraServico).where(eq(obraServico.obraId, obraId))).map((x) => x.id);
  if (ids.length) {
    await tx.delete(obraServicoSemana).where(inArray(obraServicoSemana.servicoId, ids));
    await tx.delete(obraServico).where(eq(obraServico.obraId, obraId));
  }
  return ids.length;
}

/**
 * Monta a planilha da obra a partir do orçamento-base: um serviço por item (mão de obra) e uma linha
 * "Material de <etapa>" por etapa, como no modelo da planilha. Valor cliente inclui o imposto (rateado),
 * para que a soma bata com o total da proposta.
 */
export async function gerarDoOrcamentoBase(banco: BancoDados, ctx: Contexto, obraId: string) {
  return banco.transaction(async (tx) => {
    await exigirObra(tx, ctx.empresaId, obraId);
    if (!(await exigirPlanilhaVazia(tx, obraId))) throw new ErroNegocio("A planilha da obra já tem serviços. Para gerar de novo, use a importação com a opção de substituir.");
    const [base] = await tx.select({ id: orcamento.id, numero: orcamento.numero, revisao: orcamento.revisao }).from(orcamento)
      .where(and(eq(orcamento.obraId, obraId), eq(orcamento.status, "BASE")));
    if (!base) throw new ErroNegocio("Esta obra ainda não tem orçamento-base. Aprove um orçamento e defina-o como base na aba Orçamento.");
    const c = await carregarOrcamento(tx, ctx.empresaId, base.id);
    const fator = c.totais.venda > 0 ? c.totais.total / c.totais.venda : 1;
    const linhas: (typeof obraServico.$inferInsert)[] = [];
    for (const { etapa, itens } of c.porEtapa) {
      let ordem = 0;
      let matCusto = 0, matVenda = 0;
      for (const i of itens) {
        matCusto += i.calculo.custoMaterial;
        matVenda += i.calculo.vendaMaterial;
        if (i.calculo.custoMaoDeObra <= 0 && i.calculo.vendaMaoDeObra <= 0) continue;
        linhas.push({ obraId, etapaId: etapa.id, ordem: ++ordem, descricao: i.descricao, maoDeObraVerba: i.calculo.custoMaoDeObra, valorCliente: i.calculo.vendaMaoDeObra * fator, duracaoDias: 1, orcamentoItemId: i.id });
      }
      if (matCusto > 0 || matVenda > 0) {
        linhas.push({ obraId, etapaId: etapa.id, ordem: ++ordem, descricao: `Material de ${etapa.nome.toLowerCase()}`, maoDeObraVerba: matCusto, valorCliente: matVenda * fator, duracaoDias: 1 });
      }
    }
    if (!linhas.length) throw new ErroNegocio("O orçamento-base não tem itens com valor.");
    await tx.insert(obraServico).values(linhas);
    await registrarAuditoria(tx, {
      empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "GERAR_ESTRUTURA", entidade: "obra_servico", obraId,
      descricao: `Planilha da obra gerada do orçamento-base nº ${base.numero} rev. ${base.revisao}: ${linhas.length} serviços`, ip: ctx.ip,
    });
    return { servicos: linhas.length, totalCliente: linhas.reduce((t, l) => t + (l.valorCliente ?? 0), 0) };
  });
}

export interface RelatorioImportacaoFisico {
  servicos: number;
  etapasCriadas: string[];
  semanas: number;
  primeiraSemana: number;
  previsto: boolean;
  fornecedoresNaoEncontrados: string[];
  avisos: string[];
  totalCliente: number;
}

/** Importa a planilha de controle da obra (abas Realizado-Físico e Previsto físico). */
export async function importarFisico(banco: BancoDados, ctx: Contexto, obraId: string, arquivo: Buffer, nomeArquivo: string, opcoes: { substituir: boolean }): Promise<RelatorioImportacaoFisico> {
  let lido;
  try { lido = await lerFisicoPlanilha(arquivo); } catch (e) { throw new ErroNegocio(e instanceof Error ? e.message : "Planilha inválida", "arquivo"); }
  const servicosLidos = lido.etapas.flatMap((e) => e.servicos);
  if (!servicosLidos.length) throw new ErroNegocio("Nenhum serviço encontrado na aba Realizado-Físico.", "arquivo");

  return banco.transaction(async (tx) => {
    const o = await exigirObra(tx, ctx.empresaId, obraId);
    if (!(await exigirPlanilhaVazia(tx, obraId))) {
      if (!opcoes.substituir) throw new ErroNegocio("A planilha da obra já tem serviços. Marque \"Substituir a planilha atual\" para importar mesmo assim.", "substituir");
      await limparPlanilha(tx, obraId);
    }
    const primeira = semanaDaData(o.dataInicio, lido.datas[0]!);
    if (primeira < 1) throw new ErroNegocio(`A planilha começa na semana de ${lido.datas[0]!.split("-").reverse().join("/")}, antes do início da obra. Ajuste a data de início da obra e importe de novo.`, "arquivo");

    const etapas = await tx.select().from(obraEtapa).where(eq(obraEtapa.obraId, obraId));
    const porChave = new Map(etapas.map((e) => [chaveEtapa(e.nome), e.id]));
    let maior = etapas.reduce((m, e) => Math.max(m, e.ordem), 0);
    const criadas: string[] = [];
    const fornecedores = await tx.select({ id: fornecedor.id, nome: fornecedor.nome }).from(fornecedor).where(and(eq(fornecedor.empresaId, ctx.empresaId), isNull(fornecedor.excluidoEm)));
    const fornPorNome = new Map(fornecedores.map((f) => [f.nome.trim().toLowerCase(), f.id]));
    const naoEncontrados = new Set<string>();
    let total = 0, nSemanas = 0;

    for (const e of lido.etapas) {
      if (!e.servicos.length && porChave.has(chaveEtapa(e.nome))) continue;
      let etapaId = porChave.get(chaveEtapa(e.nome));
      if (!etapaId) {
        const nome = e.nome.charAt(0) + e.nome.slice(1).toLowerCase();
        const [nova] = await tx.insert(obraEtapa).values({ obraId, ordem: ++maior, nome, tipo: "CONTRATO", exibirNoRelatorio: exibirNoRelatorioPadrao(nome, "CONTRATO") }).returning();
        etapaId = nova!.id; porChave.set(chaveEtapa(e.nome), etapaId); criadas.push(nome);
      }
      let ordem = 0;
      for (const s of e.servicos) {
        const fornecedorId = s.fornecedor ? fornPorNome.get(s.fornecedor.trim().toLowerCase()) ?? null : null;
        if (s.fornecedor && !fornecedorId) naoEncontrados.add(s.fornecedor);
        const [novo] = await tx.insert(obraServico).values({
          obraId, etapaId, ordem: ++ordem, descricao: s.nome, fornecedorId, maoDeObraAcertada: s.acertada, maoDeObraVerba: s.verba,
          valorCliente: s.cliente, duracaoDias: s.duracao, curvaAbc: s.abc,
          observacao: s.fornecedor && !fornecedorId ? `Fornecedor na planilha: ${s.fornecedor}` : null,
        }).returning({ id: obraServico.id });
        total += s.cliente;
        const celulas = new Map<number, { previsto: number | null; realizado: number | null }>();
        for (const [serie, mapa] of [["previsto", s.previsto], ["realizado", s.realizado]] as const) {
          for (const [data, v] of mapa) {
            const n = semanaDaData(o.dataInicio, data);
            nSemanas = Math.max(nSemanas, n);
            const c = celulas.get(n) ?? { previsto: null, realizado: null };
            c[serie] = (c[serie] ?? 0) + v;
            celulas.set(n, c);
          }
        }
        if (celulas.size) await tx.insert(obraServicoSemana).values([...celulas].map(([semana, c]) => ({ servicoId: novo!.id, semana, ...c, atualizadoPor: ctx.usuarioId })));
      }
    }
    const n = servicosLidos.length;
    await registrarAuditoria(tx, {
      empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "obra_servico", obraId,
      descricao: `Planilha da obra importada de ${nomeArquivo}: ${n} serviços, ${lido.datas.length} semanas${lido.temPrevisto ? " (com previsto)" : ""}${opcoes.substituir ? " — substituiu a planilha anterior" : ""}`, ip: ctx.ip,
    });
    return { servicos: n, etapasCriadas: criadas, semanas: nSemanas, primeiraSemana: primeira, previsto: lido.temPrevisto, fornecedoresNaoEncontrados: [...naoEncontrados], avisos: lido.avisos, totalCliente: total };
  });
}

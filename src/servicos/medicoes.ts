import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import type { BancoDados, Executor } from "@/db";
import { ajusteContrato, centroCusto, fornecedor, medicao, notaFiscal, obra, pagamentoFornecedorObra } from "@/db/schema";
import { hojeIso } from "@/dominio/calendario";
import {
  dataDaMedicao, medidoPorSemana, montarMedicoes, periodosMedicao, reprojetarDesembolso, resumoContrato, resumoFornecedores, sinalAjuste,
  somarPeriodos, type MedicaoFechada, type TipoAjuste,
} from "@/dominio/medicao";
import { auditarEdicao, registrarAuditoria } from "./auditoria";
import { type Contexto, ErroNegocio } from "./contexto";
import { carregarFisico } from "./fisico";

const EPS = 0.005;

// ───────────── Leitura ─────────────

export async function carregarMedicoes(db: Executor, empresaId: string, obraId: string, hoje = hojeIso()) {
  const f = await carregarFisico(db, empresaId, obraId, hoje);
  const o = f.obra;
  const pe = Number(o.percentualEntrada);
  const tipoEtapa = new Map(f.etapas.map((e) => [e.id, e.tipo]));
  const sv = f.servicos.map((s) => ({ tipo: tipoEtapa.get(s.etapaId) ?? "CONTRATO", valorCliente: s.valorCliente, previsto: s.previsto, realizado: s.realizado }));

  const fechadasDb = await db.select().from(medicao).where(eq(medicao.obraId, obraId)).orderBy(asc(medicao.numero));
  // As medições fechadas fixam o período usado; as seguintes seguem o período atual da obra.
  const n = Math.max(f.nSemanas, ...fechadasDb.map((m) => m.semanaFim));
  const periodos = periodosMedicao(n, o.semanasPorMedicao);
  const realizado = somarPeriodos(medidoPorSemana(sv, "realizado", n), periodos);
  const previsto = somarPeriodos(medidoPorSemana(sv, "previsto", n), periodos);

  const ajustes = await db.select().from(ajusteContrato).where(eq(ajusteContrato.obraId, obraId)).orderBy(asc(ajusteContrato.data), asc(ajusteContrato.criadoEm));
  const porMedicao = new Map<number, number>();
  for (const a of ajustes) if (a.medicaoNumero != null && a.tipo !== "ADITIVO") porMedicao.set(a.medicaoNumero, (porMedicao.get(a.medicaoNumero) ?? 0) + sinalAjuste(a.tipo) * a.valor);

  const fechadas = new Map<number, MedicaoFechada>(fechadasDb.map((m) => [m.numero, { ...m }]));
  const { linhas, coeficiente } = montarMedicoes({ periodos, previsto, realizado, percentualEntrada: pe, semanaAtual: f.semanaAtual, fechadas, ajustes: porMedicao });
  const linhasComData = linhas.map((l) => ({ ...l, data: fechadasDb.find((m) => m.numero === l.numero)?.data ?? dataDaMedicao(o.dataInicio, l) }));

  // Material faturado direto em nome do cliente = NFs da obra marcadas como "faturado ao cliente".
  const [cc] = await db.select({ id: centroCusto.id }).from(centroCusto).where(eq(centroCusto.obraId, obraId));
  const [{ fd }] = cc ? ((await db.select({ fd: sql<string>`coalesce(sum(case when ${notaFiscal.tipo} = 'DEVOLUCAO' then -${notaFiscal.valorTotal} else ${notaFiscal.valorTotal} end), 0)` })
    .from(notaFiscal).where(and(eq(notaFiscal.centroCustoId, cc.id), eq(notaFiscal.faturadoAoCliente, true), eq(notaFiscal.status, "LANCADA")))) as [{ fd: string }]) : [{ fd: "0" }];

  const somaAjustes = ajustes.reduce((t, a) => t + sinalAjuste(a.tipo) * a.valor, 0);
  const resumo = resumoContrato({ contrato: Number(o.valorContratoOriginal), percentualEntrada: pe, ajustes: somaAjustes, faturamentoDireto: Number(fd), medicoes: linhas });
  const aditivosLancados = ajustes.filter((a) => a.tipo === "ADITIVO").reduce((t, a) => t + a.valor, 0);
  const aditivosPlanilha = sv.filter((s) => s.tipo === "ADITIVO").reduce((t, s) => t + s.valorCliente, 0);

  // Fornecedores
  const pagamentos = await db.select().from(pagamentoFornecedorObra).where(eq(pagamentoFornecedorObra.obraId, obraId));
  const fornecedoresLinhas = resumoFornecedores(
    f.servicos.map((s) => ({ fornecedorId: s.fornecedorId, acertada: s.maoDeObraAcertada, previsto: s.previsto, realizado: s.realizado })),
    pagamentos, n,
  );
  const ids = [...new Set([...fornecedoresLinhas.map((l) => l.fornecedorId), ...f.servicos.map((s) => s.fornecedorId)].filter((x): x is string => !!x))];
  const nomes = new Map(ids.length ? (await db.select({ id: fornecedor.id, nome: fornecedor.nome }).from(fornecedor).where(inArray(fornecedor.id, ids))).map((x) => [x.id, x.nome]) : []);
  const fornecedores = fornecedoresLinhas.map((l) => ({ ...l, nome: l.fornecedorId ? nomes.get(l.fornecedorId) ?? "?" : "Sem fornecedor" }))
    .sort((a, b) => (a.fornecedorId == null ? 1 : 0) - (b.fornecedorId == null ? 1 : 0) || a.nome.localeCompare(b.nome, "pt-BR"));
  const somaSemanas = (sel: (l: (typeof fornecedores)[number]) => number[]) => Array.from({ length: n }, (_, i) => fornecedores.reduce((t, l) => t + (sel(l)[i] ?? 0), 0));
  const desembolso = reprojetarDesembolso(somaSemanas((l) => l.previstoSemana), somaSemanas((l) => l.apropriadoSemana), periodos, f.semanaAtual);
  const pagoPorPeriodo = periodos.map((p) => { let t = 0; for (let s = p.semanaInicio; s <= p.semanaFim; s++) t += somaSemanas((l) => l.pagoSemana)[s - 1] ?? 0; return t; });

  return {
    fisico: f, obra: o, periodos, linhas: linhasComData, coeficiente, resumo, ajustes, aditivosLancados, aditivosPlanilha,
    fornecedores, fornecedoresDaObra: ids.map((id) => ({ id, nome: nomes.get(id) ?? "?" })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    pagamentos, desembolso: desembolso.map((d, i) => ({ ...d, pago: pagoPorPeriodo[i]! })), nSemanas: n,
  };
}

export type MedicoesCarregadas = Awaited<ReturnType<typeof carregarMedicoes>>;

async function exigirObra(db: Executor, empresaId: string, obraId: string) {
  const [o] = await db.select().from(obra).where(and(eq(obra.id, obraId), eq(obra.empresaId, empresaId)));
  if (!o) throw new ErroNegocio("Obra não encontrada");
  // Serializa operações de medição da obra (fechar/reabrir/ajustes simultâneos).
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${"medicao:" + obraId}))`);
  return o;
}

// ───────────── Fechamento e situação ─────────────

export async function fecharMedicao(banco: BancoDados, ctx: Contexto, obraId: string, numero: number, hoje = hojeIso()) {
  return banco.transaction(async (tx) => {
    await exigirObra(tx, ctx.empresaId, obraId);
    const m = await carregarMedicoes(tx, ctx.empresaId, obraId, hoje);
    const l = m.linhas.find((x) => x.numero === numero);
    if (!l) throw new ErroNegocio("Medição não encontrada");
    if (l.estado === "FECHADA") throw new ErroNegocio(`A medição ${numero} já está fechada`);
    const anterior = m.linhas.find((x) => x.numero === numero - 1);
    if (anterior && anterior.estado !== "FECHADA") throw new ErroNegocio(`Feche antes a medição ${numero - 1}`);
    if (l.semanaFim > m.fisico.semanaAtual) throw new ErroNegocio(`A medição ${numero} só pode ser fechada a partir da semana ${l.semanaFim} (última do período)`);
    const [nova] = await tx.insert(medicao).values({
      obraId, numero, semanaInicio: l.semanaInicio, semanaFim: l.semanaFim, data: l.data, valorContrato: l.contrato, valorAditivos: l.aditivo,
      valorAjustes: l.ajustes + l.ajusteAnteriores, entradaAbatida: l.entrada, valorCobranca: l.cobranca, fechadaPor: ctx.usuarioId,
    }).returning();
    await registrarAuditoria(tx, {
      empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "medicao", entidadeId: nova!.id, obraId,
      descricao: `Medição ${numero} fechada (semanas ${l.semanaInicio}–${l.semanaFim}): cobrança ${l.cobranca.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      depois: nova, ip: ctx.ip,
    });
    return nova!;
  });
}

/** Reabre a ÚLTIMA medição fechada, desde que não esteja paga. */
export async function reabrirMedicao(banco: BancoDados, ctx: Contexto, obraId: string, numero: number) {
  return banco.transaction(async (tx) => {
    await exigirObra(tx, ctx.empresaId, obraId);
    const todas = await tx.select().from(medicao).where(eq(medicao.obraId, obraId)).orderBy(asc(medicao.numero));
    const m = todas.find((x) => x.numero === numero);
    if (!m) throw new ErroNegocio("Medição não está fechada");
    if (todas.at(-1)!.numero !== numero) throw new ErroNegocio("Só a última medição fechada pode ser reaberta");
    if (m.situacao === "PAGA") throw new ErroNegocio("Medição paga não pode ser reaberta. Marque como não paga antes, se foi um engano.");
    await tx.delete(medicao).where(eq(medicao.id, m.id));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EXCLUIR", entidade: "medicao", entidadeId: m.id, obraId, descricao: `Medição ${numero} reaberta`, antes: m, ip: ctx.ip });
  });
}

export async function alterarSituacaoMedicao(banco: BancoDados, ctx: Contexto, obraId: string, numero: number, situacao: "PAGA" | "NAO_PAGA", pagaEm: string | null) {
  if (situacao === "PAGA" && !pagaEm) throw new ErroNegocio("Informe a data do pagamento", "pagaEm");
  return banco.transaction(async (tx) => {
    await exigirObra(tx, ctx.empresaId, obraId);
    const [antes] = await tx.select().from(medicao).where(and(eq(medicao.obraId, obraId), eq(medicao.numero, numero)));
    if (!antes) throw new ErroNegocio("Feche a medição antes de registrar o pagamento");
    const [depois] = await tx.update(medicao).set({ situacao, pagaEm: situacao === "PAGA" ? pagaEm : null }).where(eq(medicao.id, antes.id)).returning();
    await auditarEdicao(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "medicao", entidadeId: antes.id, obraId, descricao: `Medição ${numero}`, ip: ctx.ip }, antes, depois!);
  });
}

// ───────────── Aditivos, descontos e reembolsos ─────────────

export interface DadosAjuste { tipo: TipoAjuste; data: string; valor: number; descricao: string; medicaoNumero: number | null }

export async function salvarAjuste(banco: BancoDados, ctx: Contexto, obraId: string, d: DadosAjuste) {
  if (!(d.valor > 0)) throw new ErroNegocio("Informe um valor positivo (o tipo define se soma ou abate)", "valor");
  if (d.tipo !== "ADITIVO" && d.medicaoNumero == null) throw new ErroNegocio("Escolha em qual medição o desconto/reembolso entra", "medicaoNumero");
  return banco.transaction(async (tx) => {
    await exigirObra(tx, ctx.empresaId, obraId);
    if (d.tipo !== "ADITIVO") {
      const [f] = await tx.select({ id: medicao.id }).from(medicao).where(and(eq(medicao.obraId, obraId), gte(medicao.numero, d.medicaoNumero!)));
      if (f) throw new ErroNegocio(`A medição ${d.medicaoNumero} (ou posterior) já está fechada. Lance em uma medição aberta.`, "medicaoNumero");
    }
    const [a] = await tx.insert(ajusteContrato).values({ ...d, medicaoNumero: d.tipo === "ADITIVO" ? null : d.medicaoNumero, obraId, criadoPor: ctx.usuarioId }).returning();
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "ajuste_contrato", entidadeId: a!.id, obraId, descricao: `${d.tipo === "ADITIVO" ? "Aditivo" : d.tipo === "DESCONTO" ? "Desconto" : "Reembolso"}: ${d.descricao}`, depois: a, ip: ctx.ip });
    return a!;
  });
}

export async function excluirAjuste(banco: BancoDados, ctx: Contexto, obraId: string, id: string) {
  return banco.transaction(async (tx) => {
    await exigirObra(tx, ctx.empresaId, obraId);
    const [a] = await tx.select().from(ajusteContrato).where(and(eq(ajusteContrato.id, id), eq(ajusteContrato.obraId, obraId)));
    if (!a) throw new ErroNegocio("Lançamento não encontrado");
    if (a.medicaoNumero != null) {
      const [f] = await tx.select({ id: medicao.id }).from(medicao).where(and(eq(medicao.obraId, obraId), eq(medicao.numero, a.medicaoNumero)));
      if (f) throw new ErroNegocio(`Já faz parte da medição ${a.medicaoNumero}, que está fechada. Reabra a medição ou lance um ajuste contrário.`);
    }
    await tx.delete(ajusteContrato).where(eq(ajusteContrato.id, id));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EXCLUIR", entidade: "ajuste_contrato", entidadeId: id, obraId, descricao: `Removido: ${a.descricao}`, antes: a, ip: ctx.ip });
  });
}

// ───────────── Pagamentos a fornecedores (manual) ─────────────

export interface AlteracaoPagamento { fornecedorId: string; semana: number; valor: number | null }

export async function salvarPagamentos(banco: BancoDados, ctx: Contexto, obraId: string, alteracoes: AlteracaoPagamento[]) {
  for (const a of alteracoes) {
    if (!Number.isInteger(a.semana) || a.semana < 1 || a.semana > 520) throw new ErroNegocio(`Semana inválida: ${a.semana}`);
    if (a.valor != null && (!Number.isFinite(a.valor) || a.valor < 0)) throw new ErroNegocio("Pagamento deve ser um valor positivo");
  }
  return banco.transaction(async (tx) => {
    await exigirObra(tx, ctx.empresaId, obraId);
    const ids = [...new Set(alteracoes.map((a) => a.fornecedorId))];
    if (ids.length) {
      const ok = await tx.select({ id: fornecedor.id }).from(fornecedor).where(and(inArray(fornecedor.id, ids), eq(fornecedor.empresaId, ctx.empresaId)));
      if (ok.length !== ids.length) throw new ErroNegocio("Fornecedor inválido");
    }
    let n = 0;
    for (const a of alteracoes) {
      const chave = and(eq(pagamentoFornecedorObra.obraId, obraId), eq(pagamentoFornecedorObra.fornecedorId, a.fornecedorId), eq(pagamentoFornecedorObra.semana, a.semana));
      const [atual] = await tx.select().from(pagamentoFornecedorObra).where(chave);
      const valor = a.valor == null || Math.abs(a.valor) < EPS ? null : Math.round(a.valor * 100) / 100;
      if ((atual?.valor ?? null) === valor) continue;
      n++;
      if (valor == null) await tx.delete(pagamentoFornecedorObra).where(chave);
      else await tx.insert(pagamentoFornecedorObra).values({ obraId, fornecedorId: a.fornecedorId, semana: a.semana, valor, atualizadoPor: ctx.usuarioId })
        .onConflictDoUpdate({ target: [pagamentoFornecedorObra.obraId, pagamentoFornecedorObra.fornecedorId, pagamentoFornecedorObra.semana], set: { valor, atualizadoPor: ctx.usuarioId, atualizadoEm: new Date() } });
    }
    if (n) await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EDITAR", entidade: "pagamento_fornecedor_obra", obraId, descricao: `Pagamentos a fornecedores: ${n} alteração(ões)`, depois: { alteracoes } as never, ip: ctx.ip });
    return { alteradas: n };
  });
}

/** O período de medição só pode mudar enquanto nenhuma medição estiver fechada. */
export async function existeMedicaoFechada(db: Executor, obraId: string) {
  const [x] = await db.select({ id: medicao.id }).from(medicao).where(eq(medicao.obraId, obraId)).limit(1);
  return !!x;
}

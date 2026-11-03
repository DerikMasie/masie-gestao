import { and, asc, desc, eq, isNull, max, ne, sql } from "drizzle-orm";
import type { BancoDados, Executor } from "@/db";
import { empresa, obra, obraEtapa, orcamento, orcamentoItem } from "@/db/schema";
import {
  calcularItem, codigosItens, normalizarParametros, totalizar, validarParametros, type ParametrosOrcamento, type ResultadoItem,
} from "@/dominio/orcamento";
import { chaveEtapa, lerOrcamentoPadrao } from "@/lib/importar-orcamento";
import { auditarEdicao, registrarAuditoria } from "./auditoria";
import { type Contexto, ErroNegocio } from "./contexto";

type Status = (typeof orcamento.$inferSelect)["status"];
export const STATUS_ORCAMENTO: Record<Status, string> = {
  RASCUNHO: "Rascunho", ENVIADO: "Enviado ao cliente", APROVADO: "Aprovado", REJEITADO: "Rejeitado", BASE: "Orçamento-base",
};

async function exigirOrcamento(db: Executor, empresaId: string, id: string) {
  const [o] = await db.select().from(orcamento).where(and(eq(orcamento.id, id), eq(orcamento.empresaId, empresaId)));
  if (!o) throw new ErroNegocio("Orçamento não encontrado");
  return o;
}

function exigirRascunho(o: { status: Status }) {
  if (o.status !== "RASCUNHO") throw new ErroNegocio("Somente orçamentos em rascunho podem ser alterados. Crie uma nova revisão.");
}

// ───────────── Leitura e cálculo ─────────────

export async function carregarOrcamento(db: Executor, empresaId: string, id: string) {
  const o = await exigirOrcamento(db, empresaId, id);
  const parametros = normalizarParametros(o.parametros);
  const [ob] = await db.select({ id: obra.id, codigo: obra.codigo, nome: obra.nome }).from(obra).where(eq(obra.id, o.obraId));
  const etapas = await db.select().from(obraEtapa).where(eq(obraEtapa.obraId, o.obraId)).orderBy(asc(obraEtapa.ordem));
  const brutos = await db.select().from(orcamentoItem).where(eq(orcamentoItem.orcamentoId, id));
  const ordemEtapa = new Map(etapas.map((e) => [e.id, e.ordem]));
  brutos.sort((a, b) => (ordemEtapa.get(a.etapaId)! - ordemEtapa.get(b.etapaId)!) || a.ordem - b.ordem);
  const comCodigo = codigosItens(brutos.map((i) => ({ ...i, etapaOrdem: ordemEtapa.get(i.etapaId) ?? 0 })));
  const itens = comCodigo.map((i) => ({ ...i, calculo: calcularItem(i, parametros) }));
  const totais = totalizar(itens.map((i) => i.calculo), parametros);
  const porEtapa = etapas.map((e) => {
    const doEtapa = itens.filter((i) => i.etapaId === e.id);
    return { etapa: e, itens: doEtapa, totais: totalizar(doEtapa.map((i) => i.calculo), { ...parametros, impostos: 0 }) };
  });
  return { orcamento: o, parametros, obra: ob!, etapas, itens, totais, porEtapa };
}

export type OrcamentoCarregado = Awaited<ReturnType<typeof carregarOrcamento>>;

export async function listarOrcamentosObra(db: Executor, empresaId: string, obraId: string) {
  const lista = await db.select().from(orcamento)
    .where(and(eq(orcamento.empresaId, empresaId), eq(orcamento.obraId, obraId)))
    .orderBy(desc(orcamento.numero), desc(orcamento.revisao));
  // Rascunhos: totais ao vivo; demais: totais congelados.
  return Promise.all(lista.map(async (o) => {
    if (o.status !== "RASCUNHO" && o.totalProposta != null) {
      return { ...o, total: Number(o.totalProposta), custo: Number(o.totalCusto), itens: null as number | null };
    }
    const c = await carregarOrcamento(db, empresaId, o.id);
    return { ...o, total: c.totais.total, custo: c.totais.custo, itens: c.itens.length };
  }));
}

// ───────────── Parâmetros ─────────────

export async function salvarParametros(banco: BancoDados, ctx: Contexto, id: string, d: { titulo: string; observacoes: string | null; parametros: ParametrosOrcamento }) {
  const erro = validarParametros(d.parametros);
  if (erro) throw new ErroNegocio(erro);
  return banco.transaction(async (tx) => {
    const antes = await exigirOrcamento(tx, ctx.empresaId, id);
    exigirRascunho(antes);
    const [depois] = await tx.update(orcamento).set(d).where(eq(orcamento.id, id)).returning();
    await auditarEdicao(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "orcamento", entidadeId: id, obraId: antes.obraId, ip: ctx.ip }, antes, depois!);
    return depois!;
  });
}

// ───────────── Itens ─────────────

export interface DadosItem {
  etapaId: string;
  grupo: string | null;
  descricao: string;
  unidade: string | null;
  quantidade: number;
  memoriaCalculo: string | null;
  quebra: number;
  custoUnitarioMaoDeObra: number;
  custoUnitarioMaterial: number;
  bdiMaoDeObra: number | null;
  bdiMaterial: number | null;
  observacao: string | null;
}

function validarItem(d: DadosItem) {
  if (!d.descricao.trim()) throw new ErroNegocio("Informe a descrição", "descricao");
  if (d.quantidade < 0) throw new ErroNegocio("Quantidade não pode ser negativa", "quantidade");
  if (d.quebra <= 0 || d.quebra > 5) throw new ErroNegocio("Quebra deve estar entre 0 e 5 (1 = sem perda)", "quebra");
  if (d.custoUnitarioMaoDeObra < 0 || d.custoUnitarioMaterial < 0) throw new ErroNegocio("Valores unitários não podem ser negativos");
  for (const b of [d.bdiMaoDeObra, d.bdiMaterial]) if (b != null && (b < 0 || b > 10)) throw new ErroNegocio("BDI do item deve estar entre 0% e 1000%");
}

async function exigirEtapaDaObra(db: Executor, obraId: string, etapaId: string) {
  const [e] = await db.select({ id: obraEtapa.id }).from(obraEtapa).where(and(eq(obraEtapa.id, etapaId), eq(obraEtapa.obraId, obraId)));
  if (!e) throw new ErroNegocio("Etapa inválida para esta obra", "etapaId");
}

export async function salvarItem(banco: BancoDados, ctx: Contexto, orcamentoId: string, d: DadosItem, itemId?: string) {
  validarItem(d);
  return banco.transaction(async (tx) => {
    const o = await exigirOrcamento(tx, ctx.empresaId, orcamentoId);
    exigirRascunho(o);
    await exigirEtapaDaObra(tx, o.obraId, d.etapaId);
    const base = { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "orcamento_item", obraId: o.obraId, ip: ctx.ip };
    if (!itemId) {
      const [{ m }] = (await tx.select({ m: max(orcamentoItem.ordem) }).from(orcamentoItem)
        .where(and(eq(orcamentoItem.orcamentoId, orcamentoId), eq(orcamentoItem.etapaId, d.etapaId)))) as [{ m: number | null }];
      const [novo] = await tx.insert(orcamentoItem).values({ ...d, orcamentoId, ordem: (m ?? 0) + 1 }).returning();
      await registrarAuditoria(tx, { ...base, acao: "CRIAR", entidadeId: novo!.id, descricao: `Item "${d.descricao}" incluído no orçamento` });
      return novo!;
    }
    const [antes] = await tx.select().from(orcamentoItem).where(and(eq(orcamentoItem.id, itemId), eq(orcamentoItem.orcamentoId, orcamentoId)));
    if (!antes) throw new ErroNegocio("Item não encontrado");
    const mudouEtapa = antes.etapaId !== d.etapaId;
    let ordem = antes.ordem;
    if (mudouEtapa) {
      const [{ m }] = (await tx.select({ m: max(orcamentoItem.ordem) }).from(orcamentoItem)
        .where(and(eq(orcamentoItem.orcamentoId, orcamentoId), eq(orcamentoItem.etapaId, d.etapaId)))) as [{ m: number | null }];
      ordem = (m ?? 0) + 1;
    }
    const [depois] = await tx.update(orcamentoItem).set({ ...d, ordem }).where(eq(orcamentoItem.id, itemId)).returning();
    await auditarEdicao(tx, { ...base, entidadeId: itemId, descricao: `Item "${d.descricao}"` }, antes, depois!);
    return depois!;
  });
}

export async function excluirItem(banco: BancoDados, ctx: Contexto, orcamentoId: string, itemId: string) {
  return banco.transaction(async (tx) => {
    const o = await exigirOrcamento(tx, ctx.empresaId, orcamentoId);
    exigirRascunho(o);
    const [i] = await tx.delete(orcamentoItem).where(and(eq(orcamentoItem.id, itemId), eq(orcamentoItem.orcamentoId, orcamentoId))).returning();
    if (!i) throw new ErroNegocio("Item não encontrado");
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EXCLUIR", entidade: "orcamento_item", entidadeId: itemId, obraId: o.obraId, descricao: `Item "${i.descricao}" removido do orçamento`, antes: i, ip: ctx.ip });
  });
}

export async function moverItem(banco: BancoDados, ctx: Contexto, orcamentoId: string, itemId: string, direcao: -1 | 1) {
  return banco.transaction(async (tx) => {
    const o = await exigirOrcamento(tx, ctx.empresaId, orcamentoId);
    exigirRascunho(o);
    const [i] = await tx.select().from(orcamentoItem).where(and(eq(orcamentoItem.id, itemId), eq(orcamentoItem.orcamentoId, orcamentoId)));
    if (!i) throw new ErroNegocio("Item não encontrado");
    const irmaos = await tx.select().from(orcamentoItem).where(and(eq(orcamentoItem.orcamentoId, orcamentoId), eq(orcamentoItem.etapaId, i.etapaId))).orderBy(asc(orcamentoItem.ordem));
    const k = irmaos.findIndex((x) => x.id === itemId);
    const j = k + direcao;
    if (j < 0 || j >= irmaos.length) return;
    [irmaos[k], irmaos[j]] = [irmaos[j]!, irmaos[k]!];
    for (const [n, x] of irmaos.entries()) await tx.update(orcamentoItem).set({ ordem: n + 1 }).where(eq(orcamentoItem.id, x.id));
  });
}

// ───────────── Revisões e cópias ─────────────

async function copiarItens(tx: Executor, origemId: string, destinoId: string, mapaEtapa: (etapaId: string) => Promise<string>) {
  const itens = await tx.select().from(orcamentoItem).where(eq(orcamentoItem.orcamentoId, origemId)).orderBy(asc(orcamentoItem.ordem));
  const ordens = new Map<string, number>();
  const existentes = await tx.select({ etapaId: orcamentoItem.etapaId, m: max(orcamentoItem.ordem) }).from(orcamentoItem)
    .where(eq(orcamentoItem.orcamentoId, destinoId)).groupBy(orcamentoItem.etapaId);
  for (const e of existentes) ordens.set(e.etapaId, e.m ?? 0);
  const novos = [];
  for (const { id: _id, orcamentoId: _o, criadoEm: _c, atualizadoEm: _a, ordem: _ord, etapaId, ...resto } of itens) {
    const destinoEtapa = await mapaEtapa(etapaId);
    const n = (ordens.get(destinoEtapa) ?? 0) + 1;
    ordens.set(destinoEtapa, n);
    novos.push({ ...resto, etapaId: destinoEtapa, orcamentoId: destinoId, ordem: n });
  }
  for (let k = 0; k < novos.length; k += 500) await tx.insert(orcamentoItem).values(novos.slice(k, k + 500));
  return novos.length;
}

async function proximaRevisao(tx: Executor, obraId: string, numero: number) {
  const [{ m }] = (await tx.select({ m: max(orcamento.revisao) }).from(orcamento).where(and(eq(orcamento.obraId, obraId), eq(orcamento.numero, numero)))) as [{ m: number | null }];
  return (m ?? -1) + 1;
}

/** Nova revisão (rascunho) a partir de qualquer revisão, preservando a original intacta. */
export async function novaRevisao(banco: BancoDados, ctx: Contexto, origemId: string) {
  return banco.transaction(async (tx) => {
    const o = await exigirOrcamento(tx, ctx.empresaId, origemId);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"orc:" + o.obraId}))`);
    const revisao = await proximaRevisao(tx, o.obraId, o.numero);
    const [novo] = await tx.insert(orcamento).values({
      empresaId: ctx.empresaId, obraId: o.obraId, numero: o.numero, revisao, titulo: o.titulo, status: "RASCUNHO",
      parametros: normalizarParametros(o.parametros), observacoes: o.observacoes, origem: `Cópia da rev. ${o.revisao}`, criadoPor: ctx.usuarioId,
    }).returning();
    const n = await copiarItens(tx, origemId, novo!.id, async (e) => e);
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "orcamento", entidadeId: novo!.id, obraId: o.obraId, descricao: `Revisão ${revisao} criada a partir da rev. ${o.revisao} (${n} itens)`, ip: ctx.ip });
    return novo!;
  });
}

/** Garante etapa equivalente na obra de destino (pelo nome, com de-para); cria se não existir. */
async function resolvedorEtapas(tx: Executor, obraDestino: string) {
  const etapas = await tx.select().from(obraEtapa).where(eq(obraEtapa.obraId, obraDestino)).orderBy(asc(obraEtapa.ordem));
  const porChave = new Map(etapas.map((e) => [chaveEtapa(e.nome), e.id]));
  let maiorOrdem = etapas.reduce((m, e) => Math.max(m, e.ordem), 0);
  const criadas: string[] = [];
  const resolver = async (nome: string) => {
    const k = chaveEtapa(nome);
    const existente = porChave.get(k);
    if (existente) return existente;
    const [e] = await tx.insert(obraEtapa).values({ obraId: obraDestino, ordem: ++maiorOrdem, nome: nome.charAt(0) + nome.slice(1).toLowerCase(), tipo: "CONTRATO" }).returning();
    porChave.set(k, e!.id);
    criadas.push(e!.nome);
    return e!.id;
  };
  return { resolver, criadas };
}

/** Copia os itens de outro orçamento (de qualquer obra da empresa) para este rascunho. */
export async function copiarDeOutroOrcamento(banco: BancoDados, ctx: Contexto, destinoId: string, origemId: string) {
  return banco.transaction(async (tx) => {
    const destino = await exigirOrcamento(tx, ctx.empresaId, destinoId);
    exigirRascunho(destino);
    const origem = await exigirOrcamento(tx, ctx.empresaId, origemId);
    if (origem.id === destino.id) throw new ErroNegocio("Escolha outro orçamento");
    const nomes = new Map((await tx.select().from(obraEtapa).where(eq(obraEtapa.obraId, origem.obraId))).map((e) => [e.id, e.nome]));
    const { resolver, criadas } = await resolvedorEtapas(tx, destino.obraId);
    const n = await copiarItens(tx, origemId, destinoId, async (etapaId) => (origem.obraId === destino.obraId ? etapaId : resolver(nomes.get(etapaId) ?? "Outros")));
    const [ob] = await tx.select({ codigo: obra.codigo }).from(obra).where(eq(obra.id, origem.obraId));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "orcamento", entidadeId: destinoId, obraId: destino.obraId, descricao: `${n} itens copiados de ${ob?.codigo} nº ${origem.numero} rev. ${origem.revisao}`, ip: ctx.ip });
    return { itens: n, etapasCriadas: criadas };
  });
}

/** Lista orçamentos de outras obras para servirem de modelo. */
export async function orcamentosParaCopiar(db: Executor, empresaId: string) {
  return db.select({ id: orcamento.id, numero: orcamento.numero, revisao: orcamento.revisao, status: orcamento.status, titulo: orcamento.titulo, obraCodigo: obra.codigo, obraNome: obra.nome })
    .from(orcamento).innerJoin(obra, eq(obra.id, orcamento.obraId))
    .where(and(eq(orcamento.empresaId, empresaId), isNull(obra.excluidoEm)))
    .orderBy(desc(obra.codigo), desc(orcamento.revisao));
}

export interface RelatorioImportacao {
  orcamentoId: string;
  revisao: number;
  itens: number;
  etapasCriadas: string[];
  totalPropostaSistema: number;
  totalPropostaPlanilha: number | null;
  confere: boolean | null;
  avisos: string[];
}

/** Importa o "Orçamento Padrão Masie.xlsx" como NOVA revisão em rascunho do orçamento nº `numero` da obra. */
export async function importarPlanilha(banco: BancoDados, ctx: Contexto, obraId: string, numero: number, arquivo: Buffer, nomeArquivo: string, opcoes: { ignorarSemQuantidade: boolean }): Promise<RelatorioImportacao> {
  const lido = await lerOrcamentoPadrao(arquivo).catch((e: Error) => { throw new ErroNegocio(e.message); });
  return banco.transaction(async (tx) => {
    const [ob] = await tx.select().from(obra).where(and(eq(obra.id, obraId), eq(obra.empresaId, ctx.empresaId), isNull(obra.excluidoEm)));
    if (!ob) throw new ErroNegocio("Obra não encontrada");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"orc:" + obraId}))`);
    const revisao = await proximaRevisao(tx, obraId, numero);
    const [novo] = await tx.insert(orcamento).values({
      empresaId: ctx.empresaId, obraId, numero, revisao, titulo: `Orçamento ${ob.codigo}`, status: "RASCUNHO",
      parametros: lido.parametros, origem: `Importado de ${nomeArquivo.slice(0, 120)}`, criadoPor: ctx.usuarioId,
    }).returning();
    const { resolver, criadas } = await resolvedorEtapas(tx, obraId);
    const linhas = [];
    let ignorados = 0;
    for (const etapa of lido.etapas) {
      const etapaId = await resolver(etapa.nome);
      let ordem = 0;
      for (const i of etapa.itens) {
        if (opcoes.ignorarSemQuantidade && i.quantidade === 0) { ignorados++; continue; }
        const { linha: _l, ...campos } = i;
        linhas.push({ ...campos, orcamentoId: novo!.id, etapaId, ordem: ++ordem, bdiMaoDeObra: null, bdiMaterial: null, observacao: null });
      }
    }
    for (let k = 0; k < linhas.length; k += 500) await tx.insert(orcamentoItem).values(linhas.slice(k, k + 500));
    const c = await carregarOrcamento(tx, ctx.empresaId, novo!.id);
    const avisos = [...lido.avisos];
    if (ignorados) avisos.push(`${ignorados} item(ns) sem quantidade não foram importados.`);
    const confere = lido.totalPropostaPlanilha == null || opcoes.ignorarSemQuantidade ? null : Math.abs(c.totais.total - lido.totalPropostaPlanilha) < 0.01;
    if (confere === false) avisos.push(`O total calculado (${c.totais.total}) difere do total da planilha (${lido.totalPropostaPlanilha}). Confira os itens.`);
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "orcamento", entidadeId: novo!.id, obraId, descricao: `Revisão ${revisao} importada de ${nomeArquivo} (${linhas.length} itens)`, ip: ctx.ip });
    return { orcamentoId: novo!.id, revisao, itens: linhas.length, etapasCriadas: criadas, totalPropostaSistema: c.totais.total, totalPropostaPlanilha: lido.totalPropostaPlanilha, confere, avisos };
  });
}

// ───────────── Fluxo de aprovação ─────────────

async function congelarTotais(tx: Executor, ctx: Contexto, id: string) {
  const c = await carregarOrcamento(tx, ctx.empresaId, id);
  if (!c.itens.length) throw new ErroNegocio("O orçamento não tem itens.");
  return { totalCusto: c.totais.custo.toFixed(2), totalVenda: c.totais.venda.toFixed(2), totalImposto: c.totais.imposto.toFixed(2), totalProposta: c.totais.total.toFixed(2), c };
}

export type AcaoFluxo = "ENVIAR" | "VOLTAR_RASCUNHO" | "APROVAR" | "REJEITAR" | "DEFINIR_BASE";

/**
 * Rascunho → Enviado → Aprovado/Rejeitado → Base.
 * Ao sair do rascunho os totais são congelados; a base atualiza o orçamento de custos da obra
 * (e o valor do contrato, se ainda não informado), sem apagar a proposta original.
 */
export async function avancarFluxo(banco: BancoDados, ctx: Contexto, id: string, acao: AcaoFluxo) {
  return banco.transaction(async (tx) => {
    const o = await exigirOrcamento(tx, ctx.empresaId, id);
    const permitido: Record<AcaoFluxo, Status[]> = {
      ENVIAR: ["RASCUNHO"], VOLTAR_RASCUNHO: ["ENVIADO", "REJEITADO"], APROVAR: ["ENVIADO", "RASCUNHO"], REJEITAR: ["ENVIADO"], DEFINIR_BASE: ["APROVADO"],
    };
    if (!permitido[acao].includes(o.status)) throw new ErroNegocio(`Ação não permitida para orçamento "${STATUS_ORCAMENTO[o.status]}".`);
    let set: Partial<typeof orcamento.$inferInsert> = {};
    let descricao = "";
    if (acao === "ENVIAR" || (acao === "APROVAR" && o.status === "RASCUNHO")) {
      const { c: _c, ...totais } = await congelarTotais(tx, ctx, id);
      set = { ...totais, enviadoEm: new Date() };
    }
    if (acao === "ENVIAR") { set.status = "ENVIADO"; descricao = "enviado ao cliente"; }
    if (acao === "VOLTAR_RASCUNHO") { set = { status: "RASCUNHO", totalCusto: null, totalVenda: null, totalImposto: null, totalProposta: null, enviadoEm: null, decididoEm: null, decididoPor: null }; descricao = "voltou para rascunho"; }
    if (acao === "APROVAR") { set = { ...set, status: "APROVADO", decididoEm: new Date(), decididoPor: ctx.usuarioId }; descricao = "aprovado"; }
    if (acao === "REJEITAR") { set = { status: "REJEITADO", decididoEm: new Date(), decididoPor: ctx.usuarioId }; descricao = "rejeitado"; }
    if (acao === "DEFINIR_BASE") {
      await tx.update(orcamento).set({ status: "APROVADO" }).where(and(eq(orcamento.obraId, o.obraId), eq(orcamento.status, "BASE"), ne(orcamento.id, id)));
      set = { status: "BASE" };
      const [ob] = await tx.select().from(obra).where(eq(obra.id, o.obraId));
      const novoObra: Partial<typeof obra.$inferInsert> = { orcamentoCustoAprovado: o.totalCusto! };
      if (Number(ob!.valorContratoOriginal) === 0) novoObra.valorContratoOriginal = o.totalProposta!;
      const [obDepois] = await tx.update(obra).set(novoObra).where(eq(obra.id, o.obraId)).returning();
      await auditarEdicao(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "obra", entidadeId: o.obraId, obraId: o.obraId, descricao: `Orçamento-base: nº ${o.numero} rev. ${o.revisao}`, ip: ctx.ip }, ob!, obDepois!);
      descricao = "definido como orçamento-base da obra";
    }
    const [depois] = await tx.update(orcamento).set(set).where(eq(orcamento.id, id)).returning();
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EDITAR", entidade: "orcamento", entidadeId: id, obraId: o.obraId, descricao: `Orçamento nº ${o.numero} rev. ${o.revisao} ${descricao}`, antes: { status: o.status }, depois: { status: depois!.status }, ip: ctx.ip });
    return depois!;
  });
}

export async function excluirRascunho(banco: BancoDados, ctx: Contexto, id: string) {
  return banco.transaction(async (tx) => {
    const o = await exigirOrcamento(tx, ctx.empresaId, id);
    exigirRascunho(o);
    const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(orcamento).where(eq(orcamento.obraId, o.obraId))) as [{ n: number }];
    if (n <= 1) throw new ErroNegocio("A obra precisa ter ao menos um orçamento.");
    await tx.delete(orcamento).where(eq(orcamento.id, id));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EXCLUIR", entidade: "orcamento", entidadeId: id, obraId: o.obraId, descricao: `Rascunho nº ${o.numero} rev. ${o.revisao} excluído`, ip: ctx.ip });
    return o;
  });
}

/** Parâmetros padrão da empresa para novos orçamentos. */
export async function parametrosDaEmpresa(db: Executor, empresaId: string) {
  const [e] = await db.select({ p: empresa.parametrosOrcamento }).from(empresa).where(eq(empresa.id, empresaId));
  return normalizarParametros(e?.p);
}

export type { ResultadoItem };

import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import type { BancoDados, Executor } from "@/db";
import {
  centroCusto, cliente, contaFinanceira, etapaPadrao, fornecedor, lancamento, notaFiscal, obra, obraEtapa, orcamento, orcamentoItem,
  planoConta, titulo, tituloParcela,
} from "@/db/schema";
import { hojeIso, somarDias } from "@/dominio/calendario";
import { etapaDoSubitem, chaveEtapa } from "@/dominio/eap";
import { avaliarVerba, gerarParcelas, NATUREZAS, RECLASSIFICACOES, resultado, situacaoParcela, type Natureza } from "@/dominio/financeiro";
import { calcularItem, normalizarParametros } from "@/dominio/orcamento";
import { PLANO_CONTAS_PADRAO } from "@/dominio/plano-contas-padrao";
import { auditarEdicao, registrarAuditoria } from "./auditoria";
import { type Contexto, ErroNegocio, violacaoUnica } from "./contexto";

const din = (n: number) => n.toFixed(2);
const num = (v: string | number | null | undefined) => (v == null ? 0 : Number(v));

// ───────────── Plano de contas ─────────────

/** Cria o plano de contas padrão (com reclassificações D12 e de-para com a EAP) se a empresa ainda não tiver. */
export async function garantirPlanoPadrao(tx: Executor, empresaId: string) {
  const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(planoConta).where(eq(planoConta.empresaId, empresaId))) as [{ n: number }];
  if (n > 0) return false;
  const etapas = await tx.select().from(etapaPadrao).where(eq(etapaPadrao.empresaId, empresaId));
  const linhas: (typeof planoConta.$inferInsert)[] = [];
  for (const g of PLANO_CONTAS_PADRAO) {
    for (const s of g.subitens) {
      const r = RECLASSIFICACOES.find((x) => x.grupoOrigem === g.grupo && x.subitem === s);
      const nomeEtapa = g.natureza === "CUSTO" ? etapaDoSubitem(s) : null;
      linhas.push({
        empresaId, grupo: r?.grupo ?? g.grupo, natureza: r?.natureza ?? g.natureza, subitem: s,
        etapaPadraoId: nomeEtapa ? etapas.find((e) => chaveEtapa(e.nome) === chaveEtapa(nomeEtapa))?.id ?? null : null,
      });
    }
  }
  // remove duplicatas (mesmo grupo+subitem após reclassificação)
  const vistos = new Set<string>();
  const unicos = linhas.filter((l) => { const k = `${l.grupo}|${l.subitem}`.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; });
  await tx.insert(planoConta).values(unicos);
  return true;
}

export async function listarPlano(db: Executor, empresaId: string, apenasAtivos = false) {
  return db.select({ p: planoConta, etapa: etapaPadrao.nome }).from(planoConta).leftJoin(etapaPadrao, eq(etapaPadrao.id, planoConta.etapaPadraoId))
    .where(and(eq(planoConta.empresaId, empresaId), apenasAtivos ? eq(planoConta.ativo, true) : undefined))
    .orderBy(asc(planoConta.natureza), asc(planoConta.grupo), asc(planoConta.subitem))
    .then((r) => r.map((x) => ({ ...x.p, etapaNome: x.etapa })));
}

export async function salvarPlano(banco: BancoDados, ctx: Contexto, d: { grupo: string; subitem: string; natureza: Natureza; etapaPadraoId: string | null; ativo: boolean }, id?: string) {
  try {
    return await banco.transaction(async (tx) => {
      const base = { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "plano_conta", ip: ctx.ip };
      if (!id) {
        const [n] = await tx.insert(planoConta).values({ ...d, empresaId: ctx.empresaId }).returning();
        await registrarAuditoria(tx, { ...base, acao: "CRIAR", entidadeId: n!.id, descricao: `Conta ${d.grupo} › ${d.subitem} criada` });
        return n!;
      }
      const [antes] = await tx.select().from(planoConta).where(and(eq(planoConta.id, id), eq(planoConta.empresaId, ctx.empresaId)));
      if (!antes) throw new ErroNegocio("Conta não encontrada");
      const [depois] = await tx.update(planoConta).set(d).where(eq(planoConta.id, id)).returning();
      await auditarEdicao(tx, { ...base, entidadeId: id }, antes, depois!);
      return depois!;
    });
  } catch (e) {
    if (violacaoUnica(e, "plano_conta_uq")) throw new ErroNegocio("Já existe este subitem neste grupo", "subitem");
    throw e;
  }
}

/** Busca (ou cria) a conta grupo › subitem. Usado pela importação. */
export async function resolverPlano(tx: Executor, empresaId: string, grupo: string, subitem: string, natureza: Natureza) {
  const [p] = await tx.select().from(planoConta).where(and(eq(planoConta.empresaId, empresaId), sql`lower(${planoConta.grupo}) = lower(${grupo})`, sql`lower(${planoConta.subitem}) = lower(${subitem})`));
  if (p) return p;
  const [n] = await tx.insert(planoConta).values({ empresaId, grupo, subitem, natureza }).returning();
  return n!;
}

// ───────────── Contas financeiras ─────────────

export async function listarContas(db: Executor, empresaId: string) {
  return db.select({
    c: contaFinanceira,
    movimento: sql<string>`coalesce((select sum(l.valor) from ${lancamento} l where l.conta_id = "conta_financeira"."id"), 0)`,
    ultimo: sql<string | null>`(select max(l.data) from ${lancamento} l where l.conta_id = "conta_financeira"."id")`,
  }).from(contaFinanceira).where(eq(contaFinanceira.empresaId, empresaId)).orderBy(desc(contaFinanceira.ativo), asc(contaFinanceira.nome))
    .then((r) => r.map((x) => ({ ...x.c, saldo: num(x.c.saldoInicial) + num(x.movimento), ultimoMovimento: x.ultimo })));
}

export async function salvarConta(banco: BancoDados, ctx: Contexto, d: Omit<typeof contaFinanceira.$inferInsert, "id" | "empresaId">, id?: string) {
  try {
    return await banco.transaction(async (tx) => {
      const base = { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "conta_financeira", ip: ctx.ip };
      if (!id) {
        const [n] = await tx.insert(contaFinanceira).values({ ...d, empresaId: ctx.empresaId }).returning();
        await registrarAuditoria(tx, { ...base, acao: "CRIAR", entidadeId: n!.id, descricao: `Conta ${d.nome} criada` });
        return n!;
      }
      const [antes] = await tx.select().from(contaFinanceira).where(and(eq(contaFinanceira.id, id), eq(contaFinanceira.empresaId, ctx.empresaId)));
      if (!antes) throw new ErroNegocio("Conta não encontrada");
      const [depois] = await tx.update(contaFinanceira).set(d).where(eq(contaFinanceira.id, id)).returning();
      await auditarEdicao(tx, { ...base, entidadeId: id }, antes, depois!);
      return depois!;
    });
  } catch (e) {
    if (violacaoUnica(e, "conta_financeira_nome_uq")) throw new ErroNegocio("Já existe uma conta com este nome", "nome");
    throw e;
  }
}

// ───────────── Centros de custo ─────────────

export async function listarCentros(db: Executor, empresaId: string, apenasAtivos = false) {
  return db.select({ id: centroCusto.id, codigo: centroCusto.codigo, nome: centroCusto.nome, tipo: centroCusto.tipo, obraId: centroCusto.obraId, ativo: centroCusto.ativo })
    .from(centroCusto).where(and(eq(centroCusto.empresaId, empresaId), apenasAtivos ? eq(centroCusto.ativo, true) : undefined))
    .orderBy(asc(centroCusto.tipo), desc(centroCusto.codigo));
}

export async function criarCentro(banco: BancoDados, ctx: Contexto, d: { codigo: string; nome: string; tipo: "ADMINISTRATIVO" | "PROJETO" | "CONSULTORIA"; valorContrato: string | null }) {
  try {
    return await banco.transaction(async (tx) => {
      const [n] = await tx.insert(centroCusto).values({ ...d, empresaId: ctx.empresaId }).returning();
      await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "centro_custo", entidadeId: n!.id, descricao: `Centro de custo ${d.codigo} criado`, ip: ctx.ip });
      return n!;
    });
  } catch (e) {
    if (violacaoUnica(e, "centro_custo_codigo_uq")) throw new ErroNegocio("Já existe um centro de custo com este código", "codigo");
    throw e;
  }
}

/** Resultado por centro de custo (regra F4 do diagnóstico, com a correção D12). */
export async function resultadoPorCentro(db: Executor, empresaId: string, f: { de?: string; ate?: string; tipo?: string } = {}) {
  const cond: SQL[] = [eq(lancamento.empresaId, empresaId)];
  if (f.de) cond.push(gte(lancamento.data, f.de));
  if (f.ate) cond.push(lte(lancamento.data, f.ate));
  const movs = await db.select({ centroCustoId: lancamento.centroCustoId, natureza: planoConta.natureza, valor: sql<string>`sum(${lancamento.valor})` })
    .from(lancamento).innerJoin(planoConta, eq(planoConta.id, lancamento.planoContaId))
    .where(and(...cond)).groupBy(lancamento.centroCustoId, planoConta.natureza);
  const abertos = await db.select({ centroCustoId: titulo.centroCustoId, tipo: titulo.tipo, valor: sql<string>`sum(${tituloParcela.valor})` })
    .from(tituloParcela).innerJoin(titulo, eq(titulo.id, tituloParcela.tituloId))
    .where(and(eq(titulo.empresaId, empresaId), eq(titulo.cancelado, false), isNull(tituloParcela.pagoEm))).groupBy(titulo.centroCustoId, titulo.tipo);
  const centros = await db.select({ c: centroCusto, obraContrato: obra.valorContratoOriginal, obraCusto: obra.orcamentoCustoAprovado })
    .from(centroCusto).leftJoin(obra, eq(obra.id, centroCusto.obraId))
    .where(and(eq(centroCusto.empresaId, empresaId), f.tipo ? sql`${centroCusto.tipo} = ${f.tipo}` : undefined));
  return centros.map(({ c, obraContrato, obraCusto }) => {
    const r = resultado(movs.filter((m) => m.centroCustoId === c.id).map((m) => ({ natureza: m.natureza, valor: num(m.valor) })));
    const aPagar = num(abertos.find((a) => a.centroCustoId === c.id && a.tipo === "PAGAR")?.valor);
    const aReceberTitulos = num(abertos.find((a) => a.centroCustoId === c.id && a.tipo === "RECEBER")?.valor);
    const contrato = c.obraId ? num(obraContrato) : num(c.valorContrato) + num(c.valorAditivos);
    return {
      ...c, contrato, custoOrcado: num(obraCusto), ...r, aPagar, aReceberTitulos,
      aReceberContrato: contrato > 0 ? Math.max(contrato - r.receitas, 0) : 0,
      /** Lucro de caixa no estilo da planilha, já sem empréstimos/aplicações: receitas − saídas operacionais − a pagar. */
      lucroProjetado: r.resultadoOperacional - aPagar,
      temMovimento: r.receitas !== 0 || r.custos !== 0 || r.despesas !== 0 || r.impostos !== 0 || aPagar !== 0,
    };
  });
}

// ───────────── Lançamentos (razão) ─────────────

export interface FiltroLancamentos { de?: string; ate?: string; contaId?: string; centroCustoId?: string; natureza?: string; q?: string; pagina?: number; limite?: number }

export async function listarLancamentos(db: Executor, empresaId: string, f: FiltroLancamentos = {}) {
  const cond: (SQL | undefined)[] = [eq(lancamento.empresaId, empresaId)];
  if (f.de) cond.push(gte(lancamento.data, f.de));
  if (f.ate) cond.push(lte(lancamento.data, f.ate));
  if (f.contaId) cond.push(eq(lancamento.contaId, f.contaId));
  if (f.centroCustoId) cond.push(eq(lancamento.centroCustoId, f.centroCustoId));
  if (f.natureza) cond.push(sql`${planoConta.natureza} = ${f.natureza}`);
  if (f.q) { const t = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`; cond.push(or(ilike(lancamento.descricao, t), ilike(planoConta.subitem, t), ilike(planoConta.grupo, t))); }
  const limite = Math.min(f.limite ?? 100, 500);
  const base = db.select({
    id: lancamento.id, data: lancamento.data, valor: lancamento.valor, descricao: lancamento.descricao, observacao: lancamento.observacao,
    conta: contaFinanceira.nome, centro: centroCusto.codigo, centroNome: centroCusto.nome, grupo: planoConta.grupo, subitem: planoConta.subitem,
    natureza: planoConta.natureza, importado: isNotNull(lancamento.importacaoId), notaFiscalId: lancamento.notaFiscalId, parcelaId: lancamento.parcelaId,
  }).from(lancamento)
    .innerJoin(contaFinanceira, eq(contaFinanceira.id, lancamento.contaId))
    .innerJoin(centroCusto, eq(centroCusto.id, lancamento.centroCustoId))
    .innerJoin(planoConta, eq(planoConta.id, lancamento.planoContaId))
    .where(and(...cond));
  const linhas = await base.orderBy(desc(lancamento.data), desc(lancamento.criadoEm)).limit(limite + 1).offset(((f.pagina ?? 1) - 1) * limite);
  const [tot] = await db.select({
    n: sql<number>`count(*)::int`, entradas: sql<string>`coalesce(sum(case when ${lancamento.valor} > 0 then ${lancamento.valor} end), 0)`,
    saidas: sql<string>`coalesce(sum(case when ${lancamento.valor} < 0 then -${lancamento.valor} end), 0)`,
  }).from(lancamento).innerJoin(planoConta, eq(planoConta.id, lancamento.planoContaId)).where(and(...cond));
  return { linhas: linhas.slice(0, limite), temMais: linhas.length > limite, total: tot!.n, entradas: num(tot!.entradas), saidas: num(tot!.saidas) };
}

async function exigirRefs(tx: Executor, empresaId: string, d: { contaId?: string; centroCustoId: string; planoContaId: string; obraEtapaId?: string | null }) {
  const [cc] = await tx.select().from(centroCusto).where(and(eq(centroCusto.id, d.centroCustoId), eq(centroCusto.empresaId, empresaId)));
  if (!cc) throw new ErroNegocio("Centro de custo inválido", "centroCustoId");
  const [pc] = await tx.select().from(planoConta).where(and(eq(planoConta.id, d.planoContaId), eq(planoConta.empresaId, empresaId)));
  if (!pc) throw new ErroNegocio("Conta do plano inválida", "planoContaId");
  if (d.contaId) {
    const [ct] = await tx.select().from(contaFinanceira).where(and(eq(contaFinanceira.id, d.contaId), eq(contaFinanceira.empresaId, empresaId)));
    if (!ct) throw new ErroNegocio("Conta financeira inválida", "contaId");
  }
  let etapa = d.obraEtapaId ?? null;
  if (etapa) {
    const [e] = await tx.select().from(obraEtapa).where(eq(obraEtapa.id, etapa));
    if (!e || e.obraId !== cc.obraId) throw new ErroNegocio("A etapa não pertence à obra do centro de custo", "obraEtapaId");
  } else if (cc.obraId && pc.etapaPadraoId) {
    // de-para automático: subitem do plano → etapa da obra (D11)
    const [e] = await tx.select({ id: obraEtapa.id }).from(obraEtapa).where(and(eq(obraEtapa.obraId, cc.obraId), eq(obraEtapa.etapaPadraoId, pc.etapaPadraoId)));
    etapa = e?.id ?? null;
  }
  return { cc, pc, etapa };
}

export interface DadosLancamento {
  data: string; tipo: "ENTRADA" | "SAIDA"; valor: number; contaId: string; centroCustoId: string; planoContaId: string;
  obraEtapaId: string | null; descricao: string | null; observacao: string | null;
}

export async function criarLancamento(banco: BancoDados, ctx: Contexto, d: DadosLancamento) {
  if (!(d.valor > 0)) throw new ErroNegocio("Informe um valor maior que zero", "valor");
  return banco.transaction(async (tx) => {
    const { cc, pc, etapa } = await exigirRefs(tx, ctx.empresaId, d);
    const valor = d.tipo === "ENTRADA" ? d.valor : -d.valor;
    const [l] = await tx.insert(lancamento).values({
      empresaId: ctx.empresaId, data: d.data, contaId: d.contaId, centroCustoId: d.centroCustoId, planoContaId: d.planoContaId, obraEtapaId: etapa,
      valor: din(valor), descricao: d.descricao, observacao: d.observacao, criadoPor: ctx.usuarioId,
    }).returning();
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "lancamento", entidadeId: l!.id, obraId: cc.obraId, descricao: `Lançamento de ${din(valor)} em ${pc.grupo} › ${pc.subitem}`, depois: l, ip: ctx.ip });
    return l!;
  });
}

export async function excluirLancamento(banco: BancoDados, ctx: Contexto, id: string) {
  return banco.transaction(async (tx) => {
    const [l] = await tx.select().from(lancamento).where(and(eq(lancamento.id, id), eq(lancamento.empresaId, ctx.empresaId)));
    if (!l) throw new ErroNegocio("Lançamento não encontrado");
    if (l.parcelaId) await tx.update(tituloParcela).set({ pagoEm: null }).where(eq(tituloParcela.id, l.parcelaId)); // estorno do pagamento
    await tx.delete(lancamento).where(eq(lancamento.id, id));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EXCLUIR", entidade: "lancamento", entidadeId: id, descricao: `Lançamento de ${l.valor} excluído${l.parcelaId ? " (pagamento estornado)" : ""}`, antes: l, ip: ctx.ip });
  });
}

// ───────────── Títulos e parcelas ─────────────

export interface DadosTitulo {
  tipo: "PAGAR" | "RECEBER"; fornecedorId: string | null; clienteId: string | null; centroCustoId: string; planoContaId: string; obraEtapaId: string | null;
  descricao: string; documento: string | null; emissao: string; valorTotal: number;
  parcelas: number; primeiroVencimento: string; intervaloDias: number;
}

async function inserirTitulo(tx: Executor, ctx: Contexto, d: DadosTitulo & { notaFiscalId?: string | null; importacaoId?: string | null }) {
  const { etapa } = await exigirRefs(tx, ctx.empresaId, d);
  const [t] = await tx.insert(titulo).values({
    empresaId: ctx.empresaId, tipo: d.tipo, fornecedorId: d.fornecedorId, clienteId: d.clienteId, centroCustoId: d.centroCustoId,
    planoContaId: d.planoContaId, obraEtapaId: etapa, notaFiscalId: d.notaFiscalId ?? null, descricao: d.descricao, documento: d.documento,
    emissao: d.emissao, valorTotal: din(d.valorTotal), importacaoId: d.importacaoId ?? null, criadoPor: ctx.usuarioId,
  }).returning();
  const parcelas = gerarParcelas(d.valorTotal, d.parcelas, d.primeiroVencimento, d.intervaloDias);
  await tx.insert(tituloParcela).values(parcelas.map((p) => ({ ...p, valor: din(p.valor), tituloId: t!.id })));
  return t!;
}

export async function criarTitulo(banco: BancoDados, ctx: Contexto, d: DadosTitulo) {
  if (d.tipo === "PAGAR" && !d.fornecedorId) throw new ErroNegocio("Informe o fornecedor", "fornecedorId");
  if (d.tipo === "RECEBER" && !d.clienteId) throw new ErroNegocio("Informe o cliente", "clienteId");
  return banco.transaction(async (tx) => {
    const t = await inserirTitulo(tx, ctx, d);
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "titulo", entidadeId: t.id, descricao: `Conta a ${d.tipo === "PAGAR" ? "pagar" : "receber"}: ${d.descricao} (${din(d.valorTotal)} em ${d.parcelas}x)`, ip: ctx.ip });
    return t;
  });
}

export interface FiltroParcelas { tipo: "PAGAR" | "RECEBER"; situacao?: "ABERTAS" | "VENCIDAS" | "PAGAS" | "TODAS"; de?: string; ate?: string; centroCustoId?: string; q?: string }

export async function listarParcelas(db: Executor, empresaId: string, f: FiltroParcelas) {
  const hoje = hojeIso();
  const cond: (SQL | undefined)[] = [eq(titulo.empresaId, empresaId), eq(titulo.tipo, f.tipo), eq(titulo.cancelado, false)];
  if (!f.situacao || f.situacao === "ABERTAS") cond.push(isNull(tituloParcela.pagoEm));
  if (f.situacao === "VENCIDAS") cond.push(isNull(tituloParcela.pagoEm), sql`${tituloParcela.vencimento} < ${hoje}`);
  if (f.situacao === "PAGAS") cond.push(isNotNull(tituloParcela.pagoEm));
  if (f.de) cond.push(gte(tituloParcela.vencimento, f.de));
  if (f.ate) cond.push(lte(tituloParcela.vencimento, f.ate));
  if (f.centroCustoId) cond.push(eq(titulo.centroCustoId, f.centroCustoId));
  if (f.q) { const t = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`; cond.push(or(ilike(titulo.descricao, t), ilike(fornecedor.nome, t), ilike(cliente.nome, t), ilike(titulo.documento, t))); }
  const linhas = await db.select({
    id: tituloParcela.id, tituloId: titulo.id, numero: tituloParcela.numero, vencimento: tituloParcela.vencimento, valor: tituloParcela.valor,
    programado: tituloParcela.programado, pagoEm: tituloParcela.pagoEm, descricao: titulo.descricao, documento: titulo.documento,
    totalParcelas: sql<number>`(select count(*)::int from ${tituloParcela} x where x.titulo_id = ${titulo.id})`,
    pessoa: sql<string | null>`coalesce(${fornecedor.nome}, ${cliente.nome})`, centro: centroCusto.codigo, centroNome: centroCusto.nome,
    obraId: centroCusto.obraId, subitem: planoConta.subitem, notaFiscalId: titulo.notaFiscalId,
  }).from(tituloParcela)
    .innerJoin(titulo, eq(titulo.id, tituloParcela.tituloId))
    .innerJoin(centroCusto, eq(centroCusto.id, titulo.centroCustoId))
    .innerJoin(planoConta, eq(planoConta.id, titulo.planoContaId))
    .leftJoin(fornecedor, eq(fornecedor.id, titulo.fornecedorId))
    .leftJoin(cliente, eq(cliente.id, titulo.clienteId))
    .where(and(...cond)).orderBy(f.situacao === "PAGAS" ? desc(tituloParcela.pagoEm) : asc(tituloParcela.vencimento)).limit(500);
  return linhas.map((l) => ({ ...l, situacao: situacaoParcela(l, hoje) }));
}

/** Registra o pagamento/recebimento: cria o lançamento no caixa e baixa a parcela. */
export async function baixarParcela(banco: BancoDados, ctx: Contexto, parcelaId: string, d: { data: string; contaId: string; valor?: number | null }) {
  return banco.transaction(async (tx) => {
    const [p] = await tx.select({ p: tituloParcela, t: titulo }).from(tituloParcela).innerJoin(titulo, eq(titulo.id, tituloParcela.tituloId))
      .where(and(eq(tituloParcela.id, parcelaId), eq(titulo.empresaId, ctx.empresaId))).for("update");
    if (!p) throw new ErroNegocio("Parcela não encontrada");
    if (p.p.pagoEm) throw new ErroNegocio("Esta parcela já foi baixada");
    if (p.t.cancelado) throw new ErroNegocio("Título cancelado");
    const valor = d.valor && d.valor > 0 ? d.valor : num(p.p.valor);
    const sinal = p.t.tipo === "RECEBER" ? 1 : -1;
    const { cc } = await exigirRefs(tx, ctx.empresaId, { contaId: d.contaId, centroCustoId: p.t.centroCustoId, planoContaId: p.t.planoContaId });
    const [l] = await tx.insert(lancamento).values({
      empresaId: ctx.empresaId, data: d.data, contaId: d.contaId, centroCustoId: p.t.centroCustoId, planoContaId: p.t.planoContaId, obraEtapaId: p.t.obraEtapaId,
      valor: din(sinal * valor), descricao: `${p.t.descricao}${p.t.documento ? ` · ${p.t.documento}` : ""} · parcela ${p.p.numero}`,
      parcelaId, notaFiscalId: p.t.notaFiscalId, criadoPor: ctx.usuarioId,
    }).returning();
    await tx.update(tituloParcela).set({ pagoEm: d.data }).where(eq(tituloParcela.id, parcelaId));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EDITAR", entidade: "titulo", entidadeId: p.t.id, obraId: cc.obraId, descricao: `Parcela ${p.p.numero} de "${p.t.descricao}" ${sinal > 0 ? "recebida" : "paga"} (${din(valor)})`, ip: ctx.ip });
    return l!;
  });
}

export async function programarParcela(banco: BancoDados, ctx: Contexto, parcelaId: string, programado: boolean) {
  const [p] = await banco.select({ id: tituloParcela.id }).from(tituloParcela).innerJoin(titulo, eq(titulo.id, tituloParcela.tituloId))
    .where(and(eq(tituloParcela.id, parcelaId), eq(titulo.empresaId, ctx.empresaId)));
  if (!p) throw new ErroNegocio("Parcela não encontrada");
  await banco.update(tituloParcela).set({ programado }).where(eq(tituloParcela.id, parcelaId));
}

// ───────────── Notas fiscais ─────────────

export interface DadosNota {
  fornecedorId: string; numero: string; serie: string; chaveNfe: string | null; emissao: string;
  tipo: "A_VISTA" | "A_PRAZO" | "ACUMULADA" | "DEVOLUCAO"; valorTotal: number; centroCustoId: string; obraEtapaId: string | null; planoContaId: string;
  faturadoAoCliente: boolean; descricao: string | null; xml: string | null;
  parcelas: number; primeiroVencimento: string | null; intervaloDias: number;
  /** À vista já paga: baixa na hora nesta conta. */
  pagaNaConta: string | null;
}

/**
 * Lança a NF uma única vez e gera a obrigação (título + parcelas) — elimina a dupla digitação
 * planilha de NF × Financeiro (ponto N-4). Devolução não gera título a pagar: abate a verba.
 * NF faturada ao cliente não gera título (o cliente paga direto ao fornecedor) e não é custo da Masie.
 */
export async function lancarNota(banco: BancoDados, ctx: Contexto, d: DadosNota) {
  if (!(d.valorTotal > 0)) throw new ErroNegocio("Informe o valor da nota", "valorTotal");
  if (d.chaveNfe && !/^\d{44}$/.test(d.chaveNfe)) throw new ErroNegocio("Chave de acesso deve ter 44 dígitos", "chaveNfe");
  try {
    return await banco.transaction(async (tx) => {
      const [f] = await tx.select().from(fornecedor).where(and(eq(fornecedor.id, d.fornecedorId), eq(fornecedor.empresaId, ctx.empresaId)));
      if (!f) throw new ErroNegocio("Fornecedor inválido", "fornecedorId");
      const { cc, etapa } = await exigirRefs(tx, ctx.empresaId, d);
      const [nf] = await tx.insert(notaFiscal).values({
        empresaId: ctx.empresaId, fornecedorId: d.fornecedorId, numero: d.numero.trim(), serie: d.serie.trim() || "1", chaveNfe: d.chaveNfe,
        emissao: d.emissao, tipo: d.tipo, valorTotal: din(d.valorTotal), centroCustoId: d.centroCustoId, obraEtapaId: etapa, planoContaId: d.planoContaId,
        faturadoAoCliente: d.faturadoAoCliente, descricao: d.descricao, xml: d.xml, criadoPor: ctx.usuarioId,
      }).returning();
      let tituloId: string | null = null;
      if (d.tipo !== "DEVOLUCAO" && !d.faturadoAoCliente) {
        const parcelas = d.tipo === "A_PRAZO" ? d.parcelas : 1;
        const t = await inserirTitulo(tx, ctx, {
          tipo: "PAGAR", fornecedorId: d.fornecedorId, clienteId: null, centroCustoId: d.centroCustoId, planoContaId: d.planoContaId, obraEtapaId: etapa,
          descricao: d.descricao || `NF ${d.numero} · ${f.nome}`, documento: `NF ${d.numero}${d.serie && d.serie !== "1" ? `/${d.serie}` : ""}`,
          emissao: d.emissao, valorTotal: d.valorTotal, parcelas, primeiroVencimento: d.primeiroVencimento ?? d.emissao, intervaloDias: d.intervaloDias,
          notaFiscalId: nf!.id,
        });
        tituloId = t.id;
      }
      await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "nota_fiscal", entidadeId: nf!.id, obraId: cc.obraId, descricao: `NF ${d.numero} de ${f.nome} lançada (${din(d.valorTotal)})`, ip: ctx.ip });
      return { nota: nf!, tituloId };
    }).then(async (r) => {
      if (r.tituloId && d.pagaNaConta && d.tipo !== "A_PRAZO") {
        const [p] = await banco.select({ id: tituloParcela.id }).from(tituloParcela).where(eq(tituloParcela.tituloId, r.tituloId));
        await baixarParcela(banco, ctx, p!.id, { data: d.emissao, contaId: d.pagaNaConta });
      }
      return r;
    });
  } catch (e) {
    if (violacaoUnica(e, "nota_fiscal_numero_uq")) throw new ErroNegocio("Esta nota (fornecedor, número e série) já foi lançada", "numero");
    if (violacaoUnica(e, "nota_fiscal_chave_uq")) throw new ErroNegocio("Uma nota com esta chave de acesso já foi lançada", "chaveNfe");
    throw e;
  }
}

/** Duplicidade antes de gravar (para avisar na tela). */
export async function notaDuplicada(db: Executor, empresaId: string, d: { fornecedorId: string; numero: string; serie: string; chaveNfe?: string | null }) {
  const [n] = await db.select({ id: notaFiscal.id }).from(notaFiscal).where(and(eq(notaFiscal.empresaId, empresaId), eq(notaFiscal.status, "LANCADA"),
    or(and(eq(notaFiscal.fornecedorId, d.fornecedorId), eq(notaFiscal.numero, d.numero.trim()), eq(notaFiscal.serie, d.serie.trim() || "1")), d.chaveNfe ? eq(notaFiscal.chaveNfe, d.chaveNfe) : undefined)));
  return Boolean(n);
}

export async function cancelarNota(banco: BancoDados, ctx: Contexto, id: string) {
  return banco.transaction(async (tx) => {
    const [nf] = await tx.select().from(notaFiscal).where(and(eq(notaFiscal.id, id), eq(notaFiscal.empresaId, ctx.empresaId)));
    if (!nf || nf.status === "CANCELADA") throw new ErroNegocio("Nota não encontrada ou já cancelada");
    const pagas = await tx.select({ id: tituloParcela.id }).from(tituloParcela).innerJoin(titulo, eq(titulo.id, tituloParcela.tituloId))
      .where(and(eq(titulo.notaFiscalId, id), isNotNull(tituloParcela.pagoEm)));
    if (pagas.length) throw new ErroNegocio("Há parcelas pagas desta nota. Estorne os pagamentos (exclua os lançamentos) antes de cancelar.");
    await tx.update(notaFiscal).set({ status: "CANCELADA" }).where(eq(notaFiscal.id, id));
    await tx.update(titulo).set({ cancelado: true }).where(eq(titulo.notaFiscalId, id));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EXCLUIR", entidade: "nota_fiscal", entidadeId: id, descricao: `NF ${nf.numero} cancelada`, ip: ctx.ip });
  });
}

export async function listarNotas(db: Executor, empresaId: string, f: { centroCustoId?: string; q?: string; de?: string; ate?: string; incluirCanceladas?: boolean } = {}) {
  const cond: (SQL | undefined)[] = [eq(notaFiscal.empresaId, empresaId)];
  if (!f.incluirCanceladas) cond.push(eq(notaFiscal.status, "LANCADA"));
  if (f.centroCustoId) cond.push(eq(notaFiscal.centroCustoId, f.centroCustoId));
  if (f.de) cond.push(gte(notaFiscal.emissao, f.de));
  if (f.ate) cond.push(lte(notaFiscal.emissao, f.ate));
  if (f.q) { const t = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`; cond.push(or(ilike(notaFiscal.numero, t), ilike(fornecedor.nome, t), ilike(notaFiscal.descricao, t))); }
  return db.select({
    id: notaFiscal.id, numero: notaFiscal.numero, serie: notaFiscal.serie, emissao: notaFiscal.emissao, tipo: notaFiscal.tipo, valorTotal: notaFiscal.valorTotal,
    status: notaFiscal.status, faturadoAoCliente: notaFiscal.faturadoAoCliente, descricao: notaFiscal.descricao, fornecedor: fornecedor.nome,
    centro: centroCusto.codigo, obraId: centroCusto.obraId, etapa: obraEtapa.nome, subitem: planoConta.subitem, temXml: isNotNull(notaFiscal.xml),
    pago: sql<string>`coalesce((select sum(p.valor) from ${tituloParcela} p join ${titulo} t on t.id = p.titulo_id where t.nota_fiscal_id = "nota_fiscal"."id" and p.pago_em is not null), 0)`,
  }).from(notaFiscal)
    .innerJoin(fornecedor, eq(fornecedor.id, notaFiscal.fornecedorId))
    .innerJoin(centroCusto, eq(centroCusto.id, notaFiscal.centroCustoId))
    .innerJoin(planoConta, eq(planoConta.id, notaFiscal.planoContaId))
    .leftJoin(obraEtapa, eq(obraEtapa.id, notaFiscal.obraEtapaId))
    .where(and(...cond)).orderBy(desc(notaFiscal.emissao), desc(notaFiscal.criadoEm)).limit(500);
}

// ───────────── Verba por etapa ─────────────

/**
 * Orçado (orçamento-base: custo por etapa) × incorrido × pago × a pagar, por etapa da obra.
 * Incorrido = NFs lançadas (devolução abate; faturado ao cliente fica fora) + pagamentos sem NF.
 * Assim uma NF paga não é contada duas vezes.
 */
export async function verbaDaObra(db: Executor, empresaId: string, obraId: string) {
  const [cc] = await db.select().from(centroCusto).where(and(eq(centroCusto.obraId, obraId), eq(centroCusto.empresaId, empresaId)));
  const etapas = await db.select().from(obraEtapa).where(eq(obraEtapa.obraId, obraId)).orderBy(asc(obraEtapa.ordem));
  const [base] = await db.select().from(orcamento).where(and(eq(orcamento.obraId, obraId), eq(orcamento.status, "BASE")));
  const orcado = new Map<string, number>();
  if (base) {
    const p = normalizarParametros(base.parametros);
    for (const i of await db.select().from(orcamentoItem).where(eq(orcamentoItem.orcamentoId, base.id))) {
      orcado.set(i.etapaId, (orcado.get(i.etapaId) ?? 0) + calcularItem(i, p).custo);
    }
  }
  if (!cc) return { base: base ?? null, linhas: [], semEtapa: { incorrido: 0, pago: 0, aPagar: 0 } };
  const nfs = await db.select({ etapa: notaFiscal.obraEtapaId, tipo: notaFiscal.tipo, valor: notaFiscal.valorTotal }).from(notaFiscal)
    .where(and(eq(notaFiscal.centroCustoId, cc.id), eq(notaFiscal.status, "LANCADA"), eq(notaFiscal.faturadoAoCliente, false)));
  const saidas = await db.select({ etapa: lancamento.obraEtapaId, valor: lancamento.valor, nf: lancamento.notaFiscalId, natureza: planoConta.natureza })
    .from(lancamento).innerJoin(planoConta, eq(planoConta.id, lancamento.planoContaId))
    .where(and(eq(lancamento.centroCustoId, cc.id), sql`${lancamento.valor} < 0`, inArray(planoConta.natureza, ["CUSTO", "DESPESA"])));
  const abertos = await db.select({ etapa: titulo.obraEtapaId, valor: tituloParcela.valor }).from(tituloParcela).innerJoin(titulo, eq(titulo.id, tituloParcela.tituloId))
    .where(and(eq(titulo.centroCustoId, cc.id), eq(titulo.tipo, "PAGAR"), eq(titulo.cancelado, false), isNull(tituloParcela.pagoEm)));
  const somar = (lista: { etapa: string | null; v: number }[], etapaId: string | null) => lista.filter((x) => x.etapa === etapaId).reduce((t, x) => t + x.v, 0);
  const nfV = nfs.map((n) => ({ etapa: n.etapa, v: (n.tipo === "DEVOLUCAO" ? -1 : 1) * num(n.valor) }));
  const semNf = saidas.filter((s) => !s.nf).map((s) => ({ etapa: s.etapa, v: -num(s.valor) }));
  const pagos = saidas.map((s) => ({ etapa: s.etapa, v: -num(s.valor) }));
  const aPag = abertos.map((a) => ({ etapa: a.etapa, v: num(a.valor) }));
  const linhas = etapas.map((e) => ({
    etapa: e,
    ...avaliarVerba({ orcado: orcado.get(e.id) ?? 0, incorrido: somar(nfV, e.id) + somar(semNf, e.id), pago: somar(pagos, e.id), aPagar: somar(aPag, e.id) }),
  }));
  return {
    base: base ?? null, centroCustoId: cc.id, linhas,
    semEtapa: { incorrido: somar(nfV, null) + somar(semNf, null), pago: somar(pagos, null), aPagar: somar(aPag, null) },
  };
}

// ───────────── Painel financeiro ─────────────

export async function painelFinanceiro(db: Executor, empresaId: string, hoje = hojeIso()) {
  const contas = await listarContas(db, empresaId);
  const ano = hoje.slice(0, 4);
  const mes = hoje.slice(0, 7);
  const movsAno = await db.select({ data: lancamento.data, valor: lancamento.valor, natureza: planoConta.natureza })
    .from(lancamento).innerJoin(planoConta, eq(planoConta.id, lancamento.planoContaId))
    .where(and(eq(lancamento.empresaId, empresaId), gte(lancamento.data, `${Number(ano) - 1}-01-01`)));
  const m = movsAno.map((x) => ({ ...x, valor: num(x.valor) }));
  const parcelas = await db.select({ tipo: titulo.tipo, vencimento: tituloParcela.vencimento, valor: tituloParcela.valor, programado: tituloParcela.programado })
    .from(tituloParcela).innerJoin(titulo, eq(titulo.id, tituloParcela.tituloId))
    .where(and(eq(titulo.empresaId, empresaId), eq(titulo.cancelado, false), isNull(tituloParcela.pagoEm)));
  const soma = (tipo: "PAGAR" | "RECEBER", f: (v: string) => boolean) => parcelas.filter((p) => p.tipo === tipo && f(p.vencimento)).reduce((t, p) => t + num(p.valor), 0);
  const em7 = somarDias(hoje, 7);
  const em30 = somarDias(hoje, 30);
  // Fluxo mensal: 12 meses realizados + 3 meses projetados (parcelas em aberto)
  const meses: { mes: string; entradas: number; saidas: number; projetadoEntradas: number; projetadoSaidas: number }[] = [];
  const [a, mm] = mes.split("-").map(Number) as [number, number];
  for (let i = -11; i <= 3; i++) {
    const d = new Date(Date.UTC(a, mm - 1 + i, 1)).toISOString().slice(0, 7);
    const doMes = m.filter((x) => x.data.startsWith(d) && NATUREZAS[x.natureza].noResultado);
    meses.push({
      mes: d,
      entradas: doMes.filter((x) => x.valor > 0).reduce((t, x) => t + x.valor, 0),
      saidas: -doMes.filter((x) => x.valor < 0).reduce((t, x) => t + x.valor, 0),
      projetadoEntradas: parcelas.filter((p) => p.tipo === "RECEBER" && p.vencimento.startsWith(d)).reduce((t, p) => t + num(p.valor), 0),
      projetadoSaidas: parcelas.filter((p) => p.tipo === "PAGAR" && p.vencimento.startsWith(d)).reduce((t, p) => t + num(p.valor), 0),
    });
  }
  return {
    saldoTotal: contas.filter((c) => c.ativo).reduce((t, c) => t + c.saldo, 0),
    contas,
    aPagar: { vencido: soma("PAGAR", (v) => v < hoje), sete: soma("PAGAR", (v) => v >= hoje && v <= em7), trinta: soma("PAGAR", (v) => v >= hoje && v <= em30), total: soma("PAGAR", () => true) },
    aReceber: { vencido: soma("RECEBER", (v) => v < hoje), trinta: soma("RECEBER", (v) => v >= hoje && v <= em30), total: soma("RECEBER", () => true) },
    resultadoMes: resultado(m.filter((x) => x.data.startsWith(mes))),
    resultadoAno: resultado(m.filter((x) => x.data.startsWith(ano))),
    resultadoAnoAnterior: resultado(m.filter((x) => x.data.startsWith(String(Number(ano) - 1)))),
    meses,
  };
}


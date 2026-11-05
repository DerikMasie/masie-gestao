import { and, asc, desc, eq, max, sql } from "drizzle-orm";
import type { BancoDados, Executor } from "@/db";
import { anexo, cliente, empresa, obra, relatorioFoto, relatorioSemanal } from "@/db/schema";
import { somarDias } from "@/dominio/calendario";
import { datasDaSemana } from "@/dominio/fisico";
import { avisosCores, corValida, normalizarCores, sugerirPrazo, sugerirProximaSemana, sugerirRealizadas, type CoresRelatorio } from "@/dominio/relatorio";
import { anexarArquivo, lerConteudo, removerAnexo } from "./anexos";
import { auditarEdicao, registrarAuditoria } from "./auditoria";
import { type Contexto, ErroNegocio } from "./contexto";
import { carregarMedicoes } from "./medicoes";

export const MAX_FOTOS = 24;

/** Conteúdo calculado do relatório (congelado na emissão). */
export interface DadosRelatorio {
  semana: number;
  /** Data do relatório: sexta-feira da semana. */
  data: string;
  obra: { codigo: string; nome: string; cliente: string; endereco: string };
  empresa: { nome: string; razaoSocial: string; cnpj: string | null; banco: string | null; agencia: string | null; conta: string | null; pix: string | null; telefone: string | null; email: string | null };
  avanco: {
    realizado: number;
    previsto: number;
    etapas: { nome: string; realizado: number; previsto: number }[];
    curva: { semana: number; inicio: string; previsto: number; realizado: number | null }[];
  };
  contrato: { contrato: number; entrada: number; percentualEntrada: number; ajustes: number; quitadas: number; faturamentoDireto: number; saldo: number };
  medicoes: { numero: number; data: string; valor: number | null; situacao: "PAGA" | "NAO_PAGA"; fechada: boolean }[];
  ajustes: { tipo: "ADITIVO" | "DESCONTO" | "REEMBOLSO"; data: string; valor: number; descricao: string }[];
  /** Cores da obra no momento da emissão (relatórios antigos sem o campo usam o padrão). */
  cores?: CoresRelatorio;
}

const sextaDaSemana = (inicioObra: string, semana: number) => somarDias(datasDaSemana(inicioObra, semana).inicio, 4);

/** Monta os dados do relatório da semana a partir do físico, das medições e dos cadastros. */
export async function dadosDoRelatorio(db: Executor, empresaId: string, obraId: string, semana: number): Promise<DadosRelatorio> {
  const m0 = await carregarMedicoes(db, empresaId, obraId);
  const data = sextaDaSemana(m0.obra.dataInicio, semana);
  // Recalcula com a "data de hoje" igual à sexta da semana do relatório (estado das medições naquela semana).
  const m = await carregarMedicoes(db, empresaId, obraId, data);
  const f = m.fisico;
  const o = m.obra;
  const [cli] = await db.select({ nome: cliente.nome }).from(cliente).where(eq(cliente.id, o.clienteId));
  const [emp] = await db.select().from(empresa).where(eq(empresa.id, empresaId));
  const a = f.avanco;
  const ref = Math.min(Math.max(semana, 1), a.semanas);
  const etapas = f.etapas.filter((e) => e.exibirNoRelatorio).map((e) => {
    const ss = f.servicos.filter((s) => s.etapaId === e.id);
    const dur = ss.reduce((t, s) => t + Math.max(s.duracaoDias, 0), 0);
    const ate = (r: Record<number, number>) => Object.entries(r).filter(([k]) => Number(k) <= ref).reduce((x, [, v]) => x + v, 0);
    const pond = (sel: (s: (typeof ss)[number]) => number) => (dur > 0 ? ss.reduce((t, s) => t + Math.max(s.duracaoDias, 0) * sel(s), 0) / dur : 0);
    return { nome: e.nome, realizado: pond((s) => ate(s.realizado)), previsto: pond((s) => ate(s.previsto)) };
  });
  // Medições até o fim do previsto (ou do contrato), como a lista quinzenal do modelo.
  const ultimaPrevista = a.acumulado.find((p) => p.previsto >= 1 - 1e-6)?.semana ?? a.semanas;
  const medicoes = m.linhas.filter((l) => l.semanaInicio <= Math.max(ultimaPrevista, semana)).map((l) => ({
    numero: l.numero, data: l.data, fechada: l.estado === "FECHADA", situacao: l.situacao,
    valor: l.estado === "FUTURA" ? null : l.cobranca,
  }));
  return {
    semana, data,
    obra: { codigo: o.codigo, nome: o.nome, cliente: cli?.nome ?? "", endereco: [o.endereco, o.cidade, o.uf].filter(Boolean).join(" · ") },
    empresa: { nome: emp!.nomeFantasia, razaoSocial: emp!.razaoSocial, cnpj: emp!.cnpj, banco: emp!.banco, agencia: emp!.agencia, conta: emp!.conta, pix: emp!.pix, telefone: emp!.telefone, email: emp!.email },
    avanco: {
      realizado: a.acumulado[ref - 1]?.realizado ?? 0, previsto: a.acumulado[ref - 1]?.previsto ?? 0, etapas,
      curva: a.acumulado.slice(0, Math.max(ultimaPrevista, ref)).map((p) => ({ semana: p.semana, inicio: datasDaSemana(o.dataInicio, p.semana).inicio, previsto: p.previsto, realizado: p.semana <= ref ? p.realizado : null })),
    },
    contrato: { ...m.resumo, percentualEntrada: Number(o.percentualEntrada) },
    medicoes,
    ajustes: m.ajustes.map((x) => ({ tipo: x.tipo, data: x.data, valor: x.valor, descricao: x.descricao })),
    cores: normalizarCores(o.relatorioCores),
  };
}

// ───────────── Relatórios ─────────────

export async function listarRelatorios(db: Executor, obraId: string) {
  return db.select({
    r: relatorioSemanal,
    fotos: sql<number>`(select count(*) from ${relatorioFoto} where ${relatorioFoto.relatorioId} = ${relatorioSemanal.id})`.mapWith(Number),
  }).from(relatorioSemanal).where(eq(relatorioSemanal.obraId, obraId)).orderBy(desc(relatorioSemanal.semana));
}

async function exigirRelatorio(db: Executor, empresaId: string, obraId: string, id: string) {
  const [r] = await db.select().from(relatorioSemanal).where(and(eq(relatorioSemanal.id, id), eq(relatorioSemanal.obraId, obraId)));
  if (!r) throw new ErroNegocio("Relatório não encontrado");
  // A obra pertence à empresa? (carregarMedicoes valida; aqui uma checagem leve)
  const [ok] = await db.execute(sql`select 1 from obra where id = ${obraId} and empresa_id = ${empresaId}`) as unknown as unknown[];
  if (!ok) throw new ErroNegocio("Relatório não encontrado");
  return r;
}
const exigirRascunho = (r: { status: string }) => { if (r.status !== "RASCUNHO") throw new ErroNegocio("Relatório emitido. Reabra para editar (gera uma nova versão)."); };

export async function carregarRelatorio(db: Executor, empresaId: string, obraId: string, id: string) {
  const r = await exigirRelatorio(db, empresaId, obraId, id);
  const fotos = await db.select({ f: relatorioFoto, nome: anexo.nomeArquivo, tipo: anexo.tipoMime }).from(relatorioFoto)
    .innerJoin(anexo, eq(anexo.id, relatorioFoto.anexoId)).where(eq(relatorioFoto.relatorioId, id)).orderBy(asc(relatorioFoto.ordem));
  const dados = r.status === "EMITIDO" && r.dados ? (r.dados as DadosRelatorio) : await dadosDoRelatorio(db, empresaId, obraId, r.semana);
  return { relatorio: r, fotos: fotos.map((x) => ({ ...x.f, nome: x.nome, tipo: x.tipo })), dados };
}

/** Cria o relatório da semana com os textos sugeridos pelo físico (editáveis). */
export async function criarRelatorio(banco: BancoDados, ctx: Contexto, obraId: string, semana: number) {
  if (!Number.isInteger(semana) || semana < 1 || semana > 520) throw new ErroNegocio("Semana inválida");
  const m = await carregarMedicoes(banco, ctx.empresaId, obraId);
  const f = m.fisico;
  const etapaNome = new Map(f.etapas.map((e) => [e.id, e.nome]));
  const sv = f.servicos.map((s) => ({ descricao: s.descricao, etapa: etapaNome.get(s.etapaId) ?? "", previsto: s.previsto, realizado: s.realizado }));
  const ref = Math.min(semana, f.avanco.semanas);
  const fimPrev = f.avanco.acumulado.find((p) => p.previsto >= 1 - 1e-6)?.semana ?? null;
  const textos = {
    tarefasRealizadas: sugerirRealizadas(sv, semana),
    tarefasProximaSemana: sugerirProximaSemana(sv, semana),
    anomalias: "",
    acompanhamentoPrazo: sugerirPrazo({
      realizado: f.avanco.acumulado[ref - 1]?.realizado ?? 0, previsto: f.avanco.acumulado[ref - 1]?.previsto ?? 0, semanaFimPrevisto: fimPrev,
      dataFimPrevisto: fimPrev ? sextaDaSemana(f.obra.dataInicio, fimPrev) : null, dataFimContratual: f.obra.dataFimContratual,
    }),
  };
  try {
    return await banco.transaction(async (tx) => {
      const [r] = await tx.insert(relatorioSemanal).values({ obraId, semana, ...textos, criadoPor: ctx.usuarioId }).returning();
      await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "relatorio_semanal", entidadeId: r!.id, obraId, descricao: `Relatório semanal da semana ${semana} criado`, ip: ctx.ip });
      return r!;
    });
  } catch (e) {
    if (String((e as { cause?: { code?: string } })?.cause?.code ?? (e as { code?: string }).code) === "23505") throw new ErroNegocio(`Já existe o relatório da semana ${semana}`);
    throw e;
  }
}

export interface TextosRelatorio { tarefasRealizadas: string; tarefasProximaSemana: string; anomalias: string; acompanhamentoPrazo: string }

export async function salvarTextos(banco: BancoDados, ctx: Contexto, obraId: string, id: string, t: TextosRelatorio) {
  for (const v of Object.values(t)) if (v.length > 6000) throw new ErroNegocio("Texto muito longo (máx. 6.000 caracteres por campo)");
  return banco.transaction(async (tx) => {
    const antes = await exigirRelatorio(tx, ctx.empresaId, obraId, id);
    exigirRascunho(antes);
    const [depois] = await tx.update(relatorioSemanal).set(t).where(eq(relatorioSemanal.id, id)).returning();
    await auditarEdicao(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "relatorio_semanal", entidadeId: id, obraId, descricao: `Relatório da semana ${antes.semana}`, ip: ctx.ip }, antes, depois!);
  });
}

export async function emitirRelatorio(banco: BancoDados, ctx: Contexto, obraId: string, id: string) {
  return banco.transaction(async (tx) => {
    const r = await exigirRelatorio(tx, ctx.empresaId, obraId, id);
    exigirRascunho(r);
    const dados = await dadosDoRelatorio(tx, ctx.empresaId, obraId, r.semana);
    const [e] = await tx.update(relatorioSemanal).set({ status: "EMITIDO", versao: r.versao + 1, dados, emitidoEm: new Date(), emitidoPor: ctx.usuarioId })
      .where(eq(relatorioSemanal.id, id)).returning();
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EDITAR", entidade: "relatorio_semanal", entidadeId: id, obraId, descricao: `Relatório da semana ${r.semana} emitido (versão ${e!.versao})`, ip: ctx.ip });
    return e!;
  });
}

export async function reabrirRelatorio(banco: BancoDados, ctx: Contexto, obraId: string, id: string) {
  return banco.transaction(async (tx) => {
    const r = await exigirRelatorio(tx, ctx.empresaId, obraId, id);
    if (r.status !== "EMITIDO") throw new ErroNegocio("O relatório já está em edição");
    await tx.update(relatorioSemanal).set({ status: "RASCUNHO" }).where(eq(relatorioSemanal.id, id));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EDITAR", entidade: "relatorio_semanal", entidadeId: id, obraId, descricao: `Relatório da semana ${r.semana} reaberto para a versão ${r.versao + 1}`, ip: ctx.ip });
  });
}

export async function excluirRelatorio(banco: BancoDados, ctx: Contexto, obraId: string, id: string) {
  const r = await exigirRelatorio(banco, ctx.empresaId, obraId, id);
  if (r.versao > 0) throw new ErroNegocio("Relatório já emitido não pode ser excluído (fica no histórico). Reabra para corrigir.");
  const fotos = await banco.select().from(relatorioFoto).where(eq(relatorioFoto.relatorioId, id));
  for (const f of fotos) await removerAnexo(banco, ctx, f.anexoId);
  await banco.transaction(async (tx) => {
    await tx.delete(relatorioSemanal).where(eq(relatorioSemanal.id, id));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EXCLUIR", entidade: "relatorio_semanal", entidadeId: id, obraId, descricao: `Rascunho do relatório da semana ${r.semana} excluído`, ip: ctx.ip });
  });
}

// ───────────── Fotos ─────────────

export async function adicionarFoto(banco: BancoDados, ctx: Contexto, obraId: string, id: string, arquivo: { nome: string; tipo: string; dados: Buffer }) {
  const r = await exigirRelatorio(banco, ctx.empresaId, obraId, id);
  exigirRascunho(r);
  if (!["image/jpeg", "image/png"].includes(arquivo.tipo)) throw new ErroNegocio("Envie fotos em JPG ou PNG");
  const [{ n, m }] = (await banco.select({ n: sql<number>`count(*)`.mapWith(Number), m: max(relatorioFoto.ordem) }).from(relatorioFoto).where(eq(relatorioFoto.relatorioId, id))) as [{ n: number; m: number | null }];
  if (n >= MAX_FOTOS) throw new ErroNegocio(`Máximo de ${MAX_FOTOS} fotos por relatório`);
  const a = await anexarArquivo(banco, ctx, { entidade: "relatorio_semanal", entidadeId: id, obraId }, { ...arquivo, descricao: `Foto do relatório da semana ${r.semana}` });
  const [f] = await banco.insert(relatorioFoto).values({ relatorioId: id, anexoId: a.id, ordem: (m ?? 0) + 1 }).returning();
  return f!;
}

async function exigirFoto(db: Executor, empresaId: string, obraId: string, relatorioId: string, fotoId: string) {
  const r = await exigirRelatorio(db, empresaId, obraId, relatorioId);
  exigirRascunho(r);
  const [f] = await db.select().from(relatorioFoto).where(and(eq(relatorioFoto.id, fotoId), eq(relatorioFoto.relatorioId, relatorioId)));
  if (!f) throw new ErroNegocio("Foto não encontrada");
  return f;
}

export async function salvarFoto(banco: BancoDados, ctx: Contexto, obraId: string, relatorioId: string, fotoId: string, d: { legenda: string | null; focoX: number; focoY: number }) {
  const lim = (v: number) => Math.min(Math.max(Math.round(v), 0), 100);
  await exigirFoto(banco, ctx.empresaId, obraId, relatorioId, fotoId);
  await banco.update(relatorioFoto).set({ legenda: d.legenda?.trim().slice(0, 200) || null, focoX: lim(d.focoX), focoY: lim(d.focoY) }).where(eq(relatorioFoto.id, fotoId));
}

export async function moverFoto(banco: BancoDados, ctx: Contexto, obraId: string, relatorioId: string, fotoId: string, direcao: -1 | 1) {
  return banco.transaction(async (tx) => {
    await exigirFoto(tx, ctx.empresaId, obraId, relatorioId, fotoId);
    const todas = await tx.select().from(relatorioFoto).where(eq(relatorioFoto.relatorioId, relatorioId)).orderBy(asc(relatorioFoto.ordem));
    const i = todas.findIndex((x) => x.id === fotoId);
    const j = i + direcao;
    if (j < 0 || j >= todas.length) return;
    [todas[i], todas[j]] = [todas[j]!, todas[i]!];
    for (const [k, x] of todas.entries()) await tx.update(relatorioFoto).set({ ordem: k + 1 }).where(eq(relatorioFoto.id, x.id));
  });
}

export async function removerFoto(banco: BancoDados, ctx: Contexto, obraId: string, relatorioId: string, fotoId: string) {
  const f = await exigirFoto(banco, ctx.empresaId, obraId, relatorioId, fotoId);
  await banco.delete(relatorioFoto).where(eq(relatorioFoto.id, fotoId));
  await removerAnexo(banco, ctx, f.anexoId);
}

/** Conteúdo das fotos (para o PDF), na ordem. */
export async function conteudoFotos(db: Executor, fotos: { anexoId: string }[]) {
  const out: Buffer[] = [];
  for (const f of fotos) {
    const [a] = await db.select({ caminho: anexo.caminho }).from(anexo).where(eq(anexo.id, f.anexoId));
    out.push(await lerConteudo(a!.caminho, db));
  }
  return out;
}

// ───────────── Cores do relatório da obra ─────────────

/** Salva as cores do relatório da obra (valem para os próximos relatórios e prévias; os emitidos mantêm as suas). */
export async function salvarCoresRelatorio(banco: BancoDados, ctx: Contexto, obraId: string, cores: CoresRelatorio | null) {
  if (cores && ![cores.principal, cores.destaque, cores.fundo].every(corValida)) throw new ErroNegocio("Cor inválida (use o formato #rrggbb)");
  return banco.transaction(async (tx) => {
    const [antes] = await tx.select().from(obra).where(and(eq(obra.id, obraId), eq(obra.empresaId, ctx.empresaId)));
    if (!antes) throw new ErroNegocio("Obra não encontrada");
    const valor = cores ? normalizarCores(cores) : null;
    const [depois] = await tx.update(obra).set({ relatorioCores: valor }).where(eq(obra.id, obraId)).returning();
    await auditarEdicao(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "obra", entidadeId: obraId, obraId, descricao: "Cores do relatório semanal", ip: ctx.ip }, antes, depois!);
    return { avisos: valor ? avisosCores(valor) : [] };
  });
}

import { and, asc, count, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import type { BancoDados, Executor } from "@/db";
import {
  cartao, cartaoChecklist, cartaoComentario, cartaoEtiqueta, etiqueta, obra, quadro, quadroColuna, usuario,
} from "@/db/schema";
import { COLUNAS_PADRAO, corValida, ETIQUETAS_PADRAO, posicaoEntre, precisaRenumerar } from "@/dominio/quadro";
import { auditarEdicao, registrarAuditoria } from "./auditoria";
import { type Contexto, ErroNegocio, violacaoUnica } from "./contexto";

const ENT = "cartao";

async function exigirQuadro(db: Executor, empresaId: string, quadroId: string) {
  const [q] = await db.select().from(quadro).where(and(eq(quadro.id, quadroId), eq(quadro.empresaId, empresaId)));
  if (!q) throw new ErroNegocio("Quadro não encontrado");
  return q;
}

async function exigirCartao(db: Executor, empresaId: string, cartaoId: string) {
  const [c] = await db.select().from(cartao).where(and(eq(cartao.id, cartaoId), eq(cartao.empresaId, empresaId)));
  if (!c) throw new ErroNegocio("Cartão não encontrado");
  return c;
}

async function exigirColuna(db: Executor, quadroId: string, colunaId: string) {
  const [c] = await db.select().from(quadroColuna).where(and(eq(quadroColuna.id, colunaId), eq(quadroColuna.quadroId, quadroId)));
  if (!c) throw new ErroNegocio("Coluna não encontrada neste quadro");
  return c;
}

async function validarResponsavelObra(db: Executor, empresaId: string, d: { responsavelId?: string | null; obraId?: string | null }) {
  if (d.responsavelId) {
    const [u] = await db.select({ id: usuario.id }).from(usuario).where(and(eq(usuario.id, d.responsavelId), eq(usuario.empresaId, empresaId), eq(usuario.ativo, true)));
    if (!u) throw new ErroNegocio("Responsável inválido ou inativo", "responsavelId");
  }
  if (d.obraId) {
    const [o] = await db.select({ id: obra.id }).from(obra).where(and(eq(obra.id, d.obraId), eq(obra.empresaId, empresaId), isNull(obra.excluidoEm)));
    if (!o) throw new ErroNegocio("Obra inválida", "obraId");
  }
}

// ───────────── Quadros ─────────────

export async function listarQuadros(db: Executor, empresaId: string) {
  return db.select({
    id: quadro.id, nome: quadro.nome, descricao: quadro.descricao, arquivado: quadro.arquivado,
    abertos: sql<number>`(select count(*)::int from ${cartao} c join ${quadroColuna} k on k.id = c.coluna_id where c.quadro_id = "quadro"."id" and not c.arquivado and not k.concluida)`,
    atrasados: sql<number>`(select count(*)::int from ${cartao} c join ${quadroColuna} k on k.id = c.coluna_id where c.quadro_id = "quadro"."id" and not c.arquivado and not k.concluida and c.data_entrega < (now() at time zone 'America/Sao_Paulo')::date)`,
  }).from(quadro).where(eq(quadro.empresaId, empresaId)).orderBy(asc(quadro.arquivado), asc(quadro.nome));
}

/** Cria um quadro já com o fluxo padrão de colunas e etiquetas (podem ser alteradas depois). */
export async function criarQuadro(banco: BancoDados, ctx: Contexto, d: { nome: string; descricao: string | null }) {
  return banco.transaction(async (tx) => {
    const [q] = await tx.insert(quadro).values({ ...d, empresaId: ctx.empresaId, criadoPor: ctx.usuarioId }).returning();
    await tx.insert(quadroColuna).values(COLUNAS_PADRAO.map((c, i) => ({ ...c, quadroId: q!.id, ordem: i + 1 })));
    await tx.insert(etiqueta).values(ETIQUETAS_PADRAO.map((e) => ({ ...e, quadroId: q!.id })));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "quadro", entidadeId: q!.id, descricao: `Quadro "${d.nome}" criado`, ip: ctx.ip });
    return q!;
  });
}

export async function atualizarQuadro(banco: BancoDados, ctx: Contexto, quadroId: string, d: { nome: string; descricao: string | null; arquivado: boolean }) {
  return banco.transaction(async (tx) => {
    const antes = await exigirQuadro(tx, ctx.empresaId, quadroId);
    const [depois] = await tx.update(quadro).set(d).where(eq(quadro.id, quadroId)).returning();
    await auditarEdicao(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "quadro", entidadeId: quadroId, ip: ctx.ip }, antes, depois!);
    return depois!;
  });
}

export interface FiltroQuadro { responsavelId?: string; etiquetaId?: string; q?: string; mostrarArquivados?: boolean }

export async function obterQuadroCompleto(db: Executor, empresaId: string, quadroId: string, f: FiltroQuadro = {}) {
  const q = await exigirQuadro(db, empresaId, quadroId);
  const colunas = await db.select().from(quadroColuna).where(eq(quadroColuna.quadroId, quadroId)).orderBy(asc(quadroColuna.ordem));
  const etiquetas = await db.select().from(etiqueta).where(eq(etiqueta.quadroId, quadroId)).orderBy(asc(etiqueta.nome));
  const cond: (SQL | undefined)[] = [eq(cartao.quadroId, quadroId)];
  if (!f.mostrarArquivados) cond.push(eq(cartao.arquivado, false));
  if (f.responsavelId) cond.push(eq(cartao.responsavelId, f.responsavelId));
  if (f.etiquetaId) cond.push(sql`exists (select 1 from ${cartaoEtiqueta} ce where ce.cartao_id = ${cartao.id} and ce.etiqueta_id = ${f.etiquetaId})`);
  if (f.q) cond.push(sql`(${cartao.titulo} ilike ${"%" + f.q.replace(/[%_\\]/g, "\\$&") + "%"} or ${cartao.descricao} ilike ${"%" + f.q.replace(/[%_\\]/g, "\\$&") + "%"})`);
  const cartoes = await db.select({
    id: cartao.id, colunaId: cartao.colunaId, titulo: cartao.titulo, dataEntrega: cartao.dataEntrega, posicao: cartao.posicao,
    responsavelId: cartao.responsavelId, responsavelNome: usuario.nome, obraId: cartao.obraId, obraCodigo: obra.codigo, arquivado: cartao.arquivado,
    etiquetas: sql<string[]>`coalesce((select array_agg(ce.etiqueta_id::text) from ${cartaoEtiqueta} ce where ce.cartao_id = ${cartao.id}), '{}')`,
    checklistTotal: sql<number>`(select count(*)::int from ${cartaoChecklist} x where x.cartao_id = ${cartao.id})`,
    checklistFeitos: sql<number>`(select count(*)::int from ${cartaoChecklist} x where x.cartao_id = ${cartao.id} and x.feito)`,
    comentarios: sql<number>`(select count(*)::int from ${cartaoComentario} x where x.cartao_id = ${cartao.id})`,
    temDescricao: sql<boolean>`coalesce(length(${cartao.descricao}), 0) > 0`,
  }).from(cartao)
    .leftJoin(usuario, eq(usuario.id, cartao.responsavelId))
    .leftJoin(obra, eq(obra.id, cartao.obraId))
    .where(and(...cond)).orderBy(asc(cartao.posicao));
  return { quadro: q, colunas, etiquetas, cartoes };
}

// ───────────── Colunas ─────────────

export async function salvarColuna(banco: BancoDados, ctx: Contexto, quadroId: string, d: { nome: string; concluida: boolean; limite: number | null }, colunaId?: string) {
  return banco.transaction(async (tx) => {
    await exigirQuadro(tx, ctx.empresaId, quadroId);
    if (!colunaId) {
      const [{ max }] = (await tx.select({ max: sql<number>`coalesce(max(${quadroColuna.ordem}), 0)::int` }).from(quadroColuna).where(eq(quadroColuna.quadroId, quadroId))) as [{ max: number }];
      const [c] = await tx.insert(quadroColuna).values({ ...d, quadroId, ordem: max + 1 }).returning();
      await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "quadro_coluna", entidadeId: c!.id, descricao: `Coluna "${d.nome}" criada`, ip: ctx.ip });
      return c!;
    }
    const antes = await exigirColuna(tx, quadroId, colunaId);
    const [depois] = await tx.update(quadroColuna).set(d).where(eq(quadroColuna.id, colunaId)).returning();
    if (d.concluida !== antes.concluida) {
      await tx.update(cartao).set({ concluidoEm: d.concluida ? new Date() : null }).where(eq(cartao.colunaId, colunaId));
    }
    await auditarEdicao(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "quadro_coluna", entidadeId: colunaId, ip: ctx.ip }, antes, depois!);
    return depois!;
  });
}

export async function moverColuna(banco: BancoDados, ctx: Contexto, quadroId: string, colunaId: string, direcao: -1 | 1) {
  return banco.transaction(async (tx) => {
    await exigirQuadro(tx, ctx.empresaId, quadroId);
    const colunas = await tx.select().from(quadroColuna).where(eq(quadroColuna.quadroId, quadroId)).orderBy(asc(quadroColuna.ordem)).for("update");
    const i = colunas.findIndex((c) => c.id === colunaId);
    const j = i + direcao;
    if (i < 0) throw new ErroNegocio("Coluna não encontrada");
    if (j < 0 || j >= colunas.length) return;
    [colunas[i], colunas[j]] = [colunas[j]!, colunas[i]!];
    for (const [n, c] of colunas.entries()) await tx.update(quadroColuna).set({ ordem: n + 1 }).where(eq(quadroColuna.id, c.id));
  });
}

export async function excluirColuna(banco: BancoDados, ctx: Contexto, quadroId: string, colunaId: string) {
  return banco.transaction(async (tx) => {
    await exigirQuadro(tx, ctx.empresaId, quadroId);
    const c = await exigirColuna(tx, quadroId, colunaId);
    const [{ n }] = (await tx.select({ n: count() }).from(cartao).where(eq(cartao.colunaId, colunaId))) as [{ n: number }];
    if (n > 0) throw new ErroNegocio("Mova ou exclua os cartões desta coluna antes de excluí-la.");
    const [{ total }] = (await tx.select({ total: count() }).from(quadroColuna).where(eq(quadroColuna.quadroId, quadroId))) as [{ total: number }];
    if (total <= 1) throw new ErroNegocio("O quadro precisa ter ao menos uma coluna.");
    await tx.delete(quadroColuna).where(eq(quadroColuna.id, colunaId));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EXCLUIR", entidade: "quadro_coluna", entidadeId: colunaId, descricao: `Coluna "${c.nome}" excluída`, ip: ctx.ip });
  });
}

// ───────────── Etiquetas ─────────────

export async function salvarEtiqueta(banco: BancoDados, ctx: Contexto, quadroId: string, d: { nome: string; cor: string }, etiquetaId?: string) {
  if (!corValida(d.cor)) throw new ErroNegocio("Cor inválida", "cor");
  try {
    return await banco.transaction(async (tx) => {
      await exigirQuadro(tx, ctx.empresaId, quadroId);
      if (!etiquetaId) return (await tx.insert(etiqueta).values({ ...d, quadroId }).returning())[0]!;
      const [e] = await tx.update(etiqueta).set(d).where(and(eq(etiqueta.id, etiquetaId), eq(etiqueta.quadroId, quadroId))).returning();
      if (!e) throw new ErroNegocio("Etiqueta não encontrada");
      return e;
    });
  } catch (e) {
    if (violacaoUnica(e, "etiqueta_nome_uq")) throw new ErroNegocio("Já existe uma etiqueta com este nome", "nome");
    throw e;
  }
}

export async function excluirEtiqueta(banco: BancoDados, ctx: Contexto, quadroId: string, etiquetaId: string) {
  await exigirQuadro(banco, ctx.empresaId, quadroId);
  await banco.delete(etiqueta).where(and(eq(etiqueta.id, etiquetaId), eq(etiqueta.quadroId, quadroId)));
}

// ───────────── Cartões ─────────────

export interface DadosCartao {
  titulo: string;
  descricao: string | null;
  responsavelId: string | null;
  obraId: string | null;
  dataInicio: string | null;
  dataEntrega: string | null;
  etiquetas?: string[];
}

async function ultimaPosicao(db: Executor, colunaId: string) {
  const [r] = await db.select({ p: sql<number | null>`max(${cartao.posicao})` }).from(cartao).where(eq(cartao.colunaId, colunaId));
  return r?.p == null ? null : Number(r.p);
}

async function definirEtiquetas(db: Executor, quadroId: string, cartaoId: string, ids: string[]) {
  const validas = ids.length ? await db.select({ id: etiqueta.id }).from(etiqueta).where(and(eq(etiqueta.quadroId, quadroId), inArray(etiqueta.id, ids))) : [];
  await db.delete(cartaoEtiqueta).where(eq(cartaoEtiqueta.cartaoId, cartaoId));
  if (validas.length) await db.insert(cartaoEtiqueta).values(validas.map((e) => ({ cartaoId, etiquetaId: e.id })));
}

export async function criarCartao(banco: BancoDados, ctx: Contexto, quadroId: string, d: DadosCartao & { colunaId?: string | null }) {
  if (d.dataInicio && d.dataEntrega && d.dataEntrega < d.dataInicio) throw new ErroNegocio("A entrega deve ser após o início", "dataEntrega");
  return banco.transaction(async (tx) => {
    await exigirQuadro(tx, ctx.empresaId, quadroId);
    await validarResponsavelObra(tx, ctx.empresaId, d);
    const coluna = d.colunaId
      ? await exigirColuna(tx, quadroId, d.colunaId)
      : (await tx.select().from(quadroColuna).where(eq(quadroColuna.quadroId, quadroId)).orderBy(asc(quadroColuna.ordem)).limit(1))[0];
    if (!coluna) throw new ErroNegocio("O quadro não tem colunas");
    const { etiquetas: ids = [], colunaId: _c, ...campos } = d;
    const [c] = await tx.insert(cartao).values({
      ...campos, empresaId: ctx.empresaId, quadroId, colunaId: coluna.id, criadoPor: ctx.usuarioId,
      posicao: posicaoEntre(await ultimaPosicao(tx, coluna.id), null), concluidoEm: coluna.concluida ? new Date() : null,
    }).returning();
    await definirEtiquetas(tx, quadroId, c!.id, ids);
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: ENT, entidadeId: c!.id, obraId: d.obraId, descricao: `Cartão "${d.titulo}" criado em ${coluna.nome}`, ip: ctx.ip });
    return c!;
  });
}

export async function atualizarCartao(banco: BancoDados, ctx: Contexto, cartaoId: string, d: DadosCartao) {
  if (d.dataInicio && d.dataEntrega && d.dataEntrega < d.dataInicio) throw new ErroNegocio("A entrega deve ser após o início", "dataEntrega");
  return banco.transaction(async (tx) => {
    const antes = await exigirCartao(tx, ctx.empresaId, cartaoId);
    await validarResponsavelObra(tx, ctx.empresaId, d);
    const { etiquetas: ids, ...campos } = d;
    const [depois] = await tx.update(cartao).set(campos).where(eq(cartao.id, cartaoId)).returning();
    if (ids) await definirEtiquetas(tx, antes.quadroId, cartaoId, ids);
    await auditarEdicao(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: ENT, entidadeId: cartaoId, obraId: depois!.obraId, ip: ctx.ip }, antes, depois!);
    return depois!;
  });
}

/**
 * Move o cartão para `colunaId`, antes do cartão `antesDe` (ou para o fim, se nulo).
 * Marca/desmarca a conclusão conforme a coluna e registra o movimento na auditoria.
 */
export async function moverCartao(banco: BancoDados, ctx: Contexto, cartaoId: string, colunaId: string, antesDe: string | null) {
  return banco.transaction(async (tx) => {
    const c = await exigirCartao(tx, ctx.empresaId, cartaoId);
    const destino = await exigirColuna(tx, c.quadroId, colunaId);
    const [origem] = await tx.select().from(quadroColuna).where(eq(quadroColuna.id, c.colunaId));
    if (antesDe === cartaoId) return c;
    const irmaos = await tx.select({ id: cartao.id, posicao: cartao.posicao }).from(cartao)
      .where(and(eq(cartao.colunaId, colunaId), sql`${cartao.id} <> ${cartaoId}`)).orderBy(asc(cartao.posicao)).for("update");

    if (destino.limite != null && origem?.id !== destino.id && irmaos.length >= destino.limite) {
      throw new ErroNegocio(`A coluna "${destino.nome}" atingiu o limite de ${destino.limite} cartão(ões).`);
    }

    let idx = antesDe ? irmaos.findIndex((i) => i.id === antesDe) : irmaos.length;
    if (idx < 0) idx = irmaos.length;
    let anterior = irmaos[idx - 1]?.posicao ?? null;
    let seguinte = irmaos[idx]?.posicao ?? null;
    if (precisaRenumerar(anterior == null ? null : Number(anterior), seguinte == null ? null : Number(seguinte))) {
      for (const [n, i] of irmaos.entries()) await tx.update(cartao).set({ posicao: (n + 1) * 1000 }).where(eq(cartao.id, i.id));
      anterior = idx > 0 ? idx * 1000 : null;
      seguinte = idx < irmaos.length ? (idx + 1) * 1000 : null;
    }
    const posicao = posicaoEntre(anterior == null ? null : Number(anterior), seguinte == null ? null : Number(seguinte));
    const concluidoEm = destino.concluida ? (c.concluidoEm ?? new Date()) : null;
    const [depois] = await tx.update(cartao).set({ colunaId, posicao, concluidoEm }).where(eq(cartao.id, cartaoId)).returning();
    if (origem?.id !== destino.id) {
      await registrarAuditoria(tx, {
        empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "MOVER", entidade: ENT, entidadeId: cartaoId, obraId: c.obraId,
        descricao: `"${c.titulo}": ${origem?.nome ?? "?"} → ${destino.nome}`, antes: { coluna: origem?.nome }, depois: { coluna: destino.nome }, ip: ctx.ip,
      });
    }
    return depois!;
  });
}

export async function arquivarCartao(banco: BancoDados, ctx: Contexto, cartaoId: string, arquivado: boolean) {
  return banco.transaction(async (tx) => {
    const c = await exigirCartao(tx, ctx.empresaId, cartaoId);
    await tx.update(cartao).set({ arquivado }).where(eq(cartao.id, cartaoId));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: arquivado ? "EXCLUIR" : "RESTAURAR", entidade: ENT, entidadeId: cartaoId, obraId: c.obraId, descricao: `Cartão "${c.titulo}" ${arquivado ? "arquivado" : "restaurado"}`, ip: ctx.ip });
  });
}

export async function excluirCartao(banco: BancoDados, ctx: Contexto, cartaoId: string) {
  return banco.transaction(async (tx) => {
    const c = await exigirCartao(tx, ctx.empresaId, cartaoId);
    await tx.delete(cartao).where(eq(cartao.id, cartaoId));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EXCLUIR", entidade: ENT, entidadeId: cartaoId, obraId: c.obraId, descricao: `Cartão "${c.titulo}" excluído`, antes: c, ip: ctx.ip });
    return c;
  });
}

export async function detalheCartao(db: Executor, empresaId: string, cartaoId: string) {
  const c = await exigirCartao(db, empresaId, cartaoId);
  const [etqs, checklist, comentarios, [coluna]] = await Promise.all([
    db.select({ id: cartaoEtiqueta.etiquetaId }).from(cartaoEtiqueta).where(eq(cartaoEtiqueta.cartaoId, cartaoId)),
    db.select().from(cartaoChecklist).where(eq(cartaoChecklist.cartaoId, cartaoId)).orderBy(asc(cartaoChecklist.ordem), asc(cartaoChecklist.criadoEm)),
    db.select({ id: cartaoComentario.id, texto: cartaoComentario.texto, criadoEm: cartaoComentario.criadoEm, autor: usuario.nome, autorId: usuario.id })
      .from(cartaoComentario).innerJoin(usuario, eq(usuario.id, cartaoComentario.usuarioId))
      .where(eq(cartaoComentario.cartaoId, cartaoId)).orderBy(desc(cartaoComentario.criadoEm)),
    db.select().from(quadroColuna).where(eq(quadroColuna.id, c.colunaId)),
  ]);
  return { cartao: c, etiquetas: etqs.map((e) => e.id), checklist, comentarios, coluna: coluna! };
}

// ───────────── Checklist e comentários ─────────────

export async function adicionarItemChecklist(banco: BancoDados, ctx: Contexto, cartaoId: string, texto: string) {
  await exigirCartao(banco, ctx.empresaId, cartaoId);
  const [{ max }] = (await banco.select({ max: sql<number>`coalesce(max(${cartaoChecklist.ordem}), 0)::int` }).from(cartaoChecklist).where(eq(cartaoChecklist.cartaoId, cartaoId))) as [{ max: number }];
  await banco.insert(cartaoChecklist).values({ cartaoId, texto, ordem: max + 1 });
}

export async function alternarItemChecklist(banco: BancoDados, ctx: Contexto, itemId: string) {
  const [i] = await banco.select({ id: cartaoChecklist.id, feito: cartaoChecklist.feito, cartaoId: cartaoChecklist.cartaoId }).from(cartaoChecklist).where(eq(cartaoChecklist.id, itemId));
  if (!i) throw new ErroNegocio("Item não encontrado");
  await exigirCartao(banco, ctx.empresaId, i.cartaoId);
  await banco.update(cartaoChecklist).set({ feito: !i.feito }).where(eq(cartaoChecklist.id, itemId));
  return i.cartaoId;
}

export async function removerItemChecklist(banco: BancoDados, ctx: Contexto, itemId: string) {
  const [i] = await banco.select({ cartaoId: cartaoChecklist.cartaoId }).from(cartaoChecklist).where(eq(cartaoChecklist.id, itemId));
  if (!i) throw new ErroNegocio("Item não encontrado");
  await exigirCartao(banco, ctx.empresaId, i.cartaoId);
  await banco.delete(cartaoChecklist).where(eq(cartaoChecklist.id, itemId));
  return i.cartaoId;
}

export async function comentar(banco: BancoDados, ctx: Contexto, cartaoId: string, texto: string) {
  return banco.transaction(async (tx) => {
    const c = await exigirCartao(tx, ctx.empresaId, cartaoId);
    await tx.insert(cartaoComentario).values({ cartaoId, usuarioId: ctx.usuarioId, texto });
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "COMENTAR", entidade: ENT, entidadeId: cartaoId, obraId: c.obraId, descricao: `Comentou em "${c.titulo}"`, ip: ctx.ip });
  });
}

// ───────────── Calendário e "minhas tarefas" ─────────────

export async function cartoesDoPeriodo(
  db: Executor, empresaId: string,
  f: { de: string; ate: string; quadroId?: string; responsavelId?: string; etiquetaId?: string; incluirConcluidos?: boolean },
) {
  const cond: (SQL | undefined)[] = [
    eq(cartao.empresaId, empresaId), eq(cartao.arquivado, false), eq(quadro.arquivado, false),
    gte(cartao.dataEntrega, f.de), lte(cartao.dataEntrega, f.ate),
  ];
  if (f.quadroId) cond.push(eq(cartao.quadroId, f.quadroId));
  if (f.responsavelId) cond.push(eq(cartao.responsavelId, f.responsavelId));
  if (f.etiquetaId) cond.push(sql`exists (select 1 from ${cartaoEtiqueta} ce where ce.cartao_id = ${cartao.id} and ce.etiqueta_id = ${f.etiquetaId})`);
  if (!f.incluirConcluidos) cond.push(eq(quadroColuna.concluida, false));
  return db.select({
    id: cartao.id, titulo: cartao.titulo, dataEntrega: cartao.dataEntrega, quadroId: cartao.quadroId, quadroNome: quadro.nome,
    colunaNome: quadroColuna.nome, concluida: quadroColuna.concluida, responsavelNome: usuario.nome,
    corEtiqueta: sql<string | null>`(select e.cor from ${cartaoEtiqueta} ce join ${etiqueta} e on e.id = ce.etiqueta_id where ce.cartao_id = ${cartao.id} order by e.nome limit 1)`,
  }).from(cartao)
    .innerJoin(quadro, eq(quadro.id, cartao.quadroId))
    .innerJoin(quadroColuna, eq(quadroColuna.id, cartao.colunaId))
    .leftJoin(usuario, eq(usuario.id, cartao.responsavelId))
    .where(and(...cond)).orderBy(asc(cartao.dataEntrega), asc(cartao.titulo));
}

export async function minhasTarefas(db: Executor, empresaId: string, usuarioId: string, limite = 8) {
  return db.select({
    id: cartao.id, titulo: cartao.titulo, dataEntrega: cartao.dataEntrega, quadroId: cartao.quadroId, quadroNome: quadro.nome, colunaNome: quadroColuna.nome,
  }).from(cartao)
    .innerJoin(quadro, eq(quadro.id, cartao.quadroId))
    .innerJoin(quadroColuna, eq(quadroColuna.id, cartao.colunaId))
    .where(and(eq(cartao.empresaId, empresaId), eq(cartao.responsavelId, usuarioId), eq(cartao.arquivado, false), eq(quadroColuna.concluida, false), eq(quadro.arquivado, false)))
    .orderBy(sql`${cartao.dataEntrega} asc nulls last`, asc(cartao.titulo)).limit(limite);
}

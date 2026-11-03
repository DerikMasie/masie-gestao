import { randomInt } from "node:crypto";
import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import type { BancoDados, Executor } from "@/db";
import { perfil, usuario } from "@/db/schema";
import type { MatrizPermissoes } from "@/dominio/permissoes";
import { tokenAleatorio } from "@/lib/cripto";
import { gerarHashSenha, problemaSenha, verificarSenha } from "@/lib/auth/senha";
import type { DadosUsuario } from "@/lib/validacao";
import { auditarEdicao, registrarAuditoria } from "./auditoria";
import { type Contexto, ErroNegocio, violacaoUnica } from "./contexto";
import { encerrarSessoesDoUsuario } from "./sessoes";

export async function listarUsuarios(db: Executor, empresaId: string) {
  return db.select({
    id: usuario.id, nome: usuario.nome, email: usuario.email, cargo: usuario.cargo, ativo: usuario.ativo,
    ultimoLoginEm: usuario.ultimoLoginEm, perfilId: usuario.perfilId, perfilNome: perfil.nome, telefone: usuario.telefone,
  }).from(usuario).innerJoin(perfil, eq(perfil.id, usuario.perfilId))
    .where(eq(usuario.empresaId, empresaId)).orderBy(asc(usuario.nome));
}

export async function listarUsuariosAtivos(db: Executor, empresaId: string) {
  return db.select({ id: usuario.id, nome: usuario.nome }).from(usuario)
    .where(and(eq(usuario.empresaId, empresaId), eq(usuario.ativo, true))).orderBy(asc(usuario.nome));
}

/** Senha provisória legível (sem caracteres ambíguos) com letras e números. */
export function gerarSenhaProvisoria(): string {
  const base = tokenAleatorio(9).replace(/[-_0OoIl1]/g, "x");
  return `${base.slice(0, 6)}${randomInt(10, 100)}`;
}

async function garantirAdministradorRestante(db: Executor, empresaId: string, excetoUsuarioId: string) {
  const [r] = await db.select({ n: count() }).from(usuario).innerJoin(perfil, eq(perfil.id, usuario.perfilId))
    .where(and(eq(usuario.empresaId, empresaId), eq(usuario.ativo, true), eq(perfil.nome, "Administrador"), ne(usuario.id, excetoUsuarioId)));
  if ((r?.n ?? 0) === 0) throw new ErroNegocio("Deve existir pelo menos um Administrador ativo.");
}

async function validarPerfil(db: Executor, empresaId: string, perfilId: string) {
  const [p] = await db.select().from(perfil).where(and(eq(perfil.id, perfilId), eq(perfil.empresaId, empresaId)));
  if (!p) throw new ErroNegocio("Perfil inválido", "perfilId");
  return p;
}

/** Cria usuário com senha provisória (troca obrigatória no primeiro acesso). Retorna a senha uma única vez. */
export async function criarUsuario(banco: BancoDados, ctx: Contexto, d: DadosUsuario) {
  const senha = gerarSenhaProvisoria();
  try {
    return await banco.transaction(async (tx) => {
      await validarPerfil(tx, ctx.empresaId, d.perfilId);
      const [novo] = await tx.insert(usuario).values({ ...d, empresaId: ctx.empresaId, senhaHash: await gerarHashSenha(senha), deveTrocarSenha: true }).returning();
      await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "usuario", entidadeId: novo!.id, descricao: `Usuário ${d.email} criado`, depois: novo, ip: ctx.ip });
      return { usuario: novo!, senhaProvisoria: senha };
    });
  } catch (e) {
    if (violacaoUnica(e, "usuario_email_uq")) throw new ErroNegocio("Já existe um usuário com este e-mail", "email");
    throw e;
  }
}

export async function atualizarUsuario(banco: BancoDados, ctx: Contexto, id: string, d: DadosUsuario) {
  try {
    return await banco.transaction(async (tx) => {
      const [antes] = await tx.select().from(usuario).where(and(eq(usuario.id, id), eq(usuario.empresaId, ctx.empresaId)));
      if (!antes) throw new ErroNegocio("Usuário não encontrado");
      const novoPerfil = await validarPerfil(tx, ctx.empresaId, d.perfilId);
      const [perfilAntigo] = await tx.select().from(perfil).where(eq(perfil.id, antes.perfilId));
      const deixaDeSerAdmin = perfilAntigo?.nome === "Administrador" && (novoPerfil.nome !== "Administrador" || !d.ativo);
      if (deixaDeSerAdmin) await garantirAdministradorRestante(tx, ctx.empresaId, id);
      if (id === ctx.usuarioId && !d.ativo) throw new ErroNegocio("Você não pode inativar o próprio usuário.");
      const [depois] = await tx.update(usuario).set(d).where(eq(usuario.id, id)).returning();
      if (!d.ativo) await encerrarSessoesDoUsuario(tx, id);
      await auditarEdicao(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "usuario", entidadeId: id, ip: ctx.ip }, antes, depois!);
      return depois!;
    });
  } catch (e) {
    if (violacaoUnica(e, "usuario_email_uq")) throw new ErroNegocio("Já existe um usuário com este e-mail", "email");
    throw e;
  }
}

export async function redefinirSenha(banco: BancoDados, ctx: Contexto, id: string) {
  const senha = gerarSenhaProvisoria();
  await banco.transaction(async (tx) => {
    const [u] = await tx.select().from(usuario).where(and(eq(usuario.id, id), eq(usuario.empresaId, ctx.empresaId)));
    if (!u) throw new ErroNegocio("Usuário não encontrado");
    await tx.update(usuario).set({ senhaHash: await gerarHashSenha(senha), deveTrocarSenha: true }).where(eq(usuario.id, id));
    await encerrarSessoesDoUsuario(tx, id);
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "TROCAR_SENHA", entidade: "usuario", entidadeId: id, descricao: `Senha de ${u.email} redefinida pelo administrador`, ip: ctx.ip });
  });
  return senha;
}

export async function trocarPropriaSenha(banco: BancoDados, ctx: Contexto, senhaAtual: string, novaSenha: string, tokenAtual: string) {
  const problema = problemaSenha(novaSenha);
  if (problema) throw new ErroNegocio(problema, "novaSenha");
  await banco.transaction(async (tx) => {
    const [u] = await tx.select().from(usuario).where(eq(usuario.id, ctx.usuarioId));
    if (!u || !(await verificarSenha(u.senhaHash, senhaAtual))) throw new ErroNegocio("Senha atual incorreta", "senhaAtual");
    if (await verificarSenha(u.senhaHash, novaSenha)) throw new ErroNegocio("A nova senha deve ser diferente da atual", "novaSenha");
    await tx.update(usuario).set({ senhaHash: await gerarHashSenha(novaSenha), deveTrocarSenha: false }).where(eq(usuario.id, u.id));
    await encerrarSessoesDoUsuario(tx, u.id, tokenAtual); // derruba outras sessões abertas
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: u.id, acao: "TROCAR_SENHA", entidade: "usuario", entidadeId: u.id, descricao: "Senha alterada pelo próprio usuário", ip: ctx.ip });
  });
}

// ───────────── Perfis ─────────────

export async function listarPerfis(db: Executor, empresaId: string) {
  return db.select({
    id: perfil.id, nome: perfil.nome, descricao: perfil.descricao, acessoTodasObras: perfil.acessoTodasObras,
    sistema: perfil.sistema, permissoes: perfil.permissoes,
    usuarios: sql<number>`(select count(*)::int from "usuario" u where u.perfil_id = "perfil"."id")`,
  }).from(perfil).where(eq(perfil.empresaId, empresaId)).orderBy(asc(perfil.nome));
}

export async function salvarPerfil(
  banco: BancoDados, ctx: Contexto,
  d: { nome: string; descricao: string | null; acessoTodasObras: boolean; permissoes: MatrizPermissoes }, id?: string,
) {
  try {
    return await banco.transaction(async (tx) => {
      const base = { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "perfil", ip: ctx.ip };
      if (!id) {
        const [n] = await tx.insert(perfil).values({ ...d, empresaId: ctx.empresaId }).returning();
        await registrarAuditoria(tx, { ...base, acao: "CRIAR", entidadeId: n!.id, descricao: `Perfil ${d.nome} criado`, depois: n });
        return n!;
      }
      const [antes] = await tx.select().from(perfil).where(and(eq(perfil.id, id), eq(perfil.empresaId, ctx.empresaId)));
      if (!antes) throw new ErroNegocio("Perfil não encontrado");
      if (antes.nome === "Administrador") throw new ErroNegocio("O perfil Administrador tem acesso completo e não pode ser alterado.");
      if (antes.sistema && d.nome !== antes.nome) throw new ErroNegocio("Perfis de sistema não podem ser renomeados.", "nome");
      const [depois] = await tx.update(perfil).set(d).where(eq(perfil.id, id)).returning();
      await auditarEdicao(tx, { ...base, entidadeId: id }, antes, depois!);
      return depois!;
    });
  } catch (e) {
    if (violacaoUnica(e, "perfil_empresa_nome_uq")) throw new ErroNegocio("Já existe um perfil com este nome", "nome");
    throw e;
  }
}

export async function excluirPerfil(banco: BancoDados, ctx: Contexto, id: string) {
  return banco.transaction(async (tx) => {
    const [p] = await tx.select().from(perfil).where(and(eq(perfil.id, id), eq(perfil.empresaId, ctx.empresaId)));
    if (!p) throw new ErroNegocio("Perfil não encontrado");
    if (p.sistema) throw new ErroNegocio("Perfis de sistema não podem ser excluídos.");
    const [r] = await tx.select({ n: count() }).from(usuario).where(eq(usuario.perfilId, id));
    if ((r?.n ?? 0) > 0) throw new ErroNegocio("Há usuários com este perfil. Altere o perfil deles antes de excluir.");
    await tx.delete(perfil).where(eq(perfil.id, id));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EXCLUIR", entidade: "perfil", entidadeId: id, descricao: `Perfil ${p.nome} excluído`, antes: p, ip: ctx.ip });
  });
}

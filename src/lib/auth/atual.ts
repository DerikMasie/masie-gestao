import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { usuarioObra } from "@/db/schema";
import { type Acao, type Modulo, pode } from "@/dominio/permissoes";
import { validarSessao, type UsuarioSessao } from "@/servicos/sessoes";

export const COOKIE_SESSAO = "masie_sessao";

export async function definirCookieSessao(token: string, expiraEm: Date) {
  (await cookies()).set(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiraEm,
  });
}

export async function lerTokenSessao() {
  return (await cookies()).get(COOKIE_SESSAO)?.value ?? null;
}

export async function metaRequisicao() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  return { ip, userAgent: h.get("user-agent") };
}

/** Usuário da requisição atual (memoizado por requisição). */
export const obterUsuarioAtual = cache(async (): Promise<UsuarioSessao | null> => {
  const token = await lerTokenSessao();
  if (!token) return null;
  const r = await validarSessao(db, token);
  return r?.usuario ?? null;
});

export class AcessoNegado extends Error {
  constructor(mensagem = "Você não tem permissão para esta ação.") {
    super(mensagem);
    this.name = "AcessoNegado";
  }
}

/** Para páginas: redireciona para o login se não houver sessão. */
export async function exigirUsuario(): Promise<UsuarioSessao> {
  const u = await obterUsuarioAtual();
  if (!u) redirect("/login");
  return u;
}

/** Para páginas: redireciona para a tela de "sem permissão". */
export async function exigirPermissaoPagina(modulo: Modulo, acao: Acao = "ver"): Promise<UsuarioSessao> {
  const u = await exigirUsuario();
  if (!pode(u.perfil.permissoes, modulo, acao)) redirect("/sem-permissao");
  return u;
}

/** Para server actions: lança AcessoNegado (convertido em mensagem de erro no formulário). */
export async function exigirPermissao(modulo: Modulo, acao: Acao = "ver"): Promise<UsuarioSessao> {
  const u = await obterUsuarioAtual();
  if (!u) throw new AcessoNegado("Sessão expirada. Faça login novamente.");
  if (!pode(u.perfil.permissoes, modulo, acao)) throw new AcessoNegado();
  return u;
}

export function temPermissao(u: UsuarioSessao, modulo: Modulo, acao: Acao = "ver") {
  return pode(u.perfil.permissoes, modulo, acao);
}

/** Verdadeiro se o usuário pode acessar a obra (perfil com todas as obras ou vínculo direto). */
export async function podeAcessarObra(u: UsuarioSessao, obraId: string): Promise<boolean> {
  if (u.perfil.acessoTodasObras) return true;
  const [v] = await db.select({ o: usuarioObra.obraId }).from(usuarioObra)
    .where(and(eq(usuarioObra.usuarioId, u.id), eq(usuarioObra.obraId, obraId))).limit(1);
  return Boolean(v);
}

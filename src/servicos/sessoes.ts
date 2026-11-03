import { and, eq, gt, sql } from "drizzle-orm";
import type { Executor } from "@/db";
import { perfil, sessao, tentativaLogin, usuario } from "@/db/schema";
import { sha256, tokenAleatorio } from "@/lib/cripto";
import { gerarHashSenha, verificarSenha } from "@/lib/auth/senha";
import { registrarAuditoria } from "./auditoria";

export const DURACAO_SESSAO_DIAS = 30;
const RENOVAR_ABAIXO_DIAS = 15;
export const MAX_TENTATIVAS = 5;
export const JANELA_TENTATIVAS_MIN = 15;

const DIA_MS = 86_400_000;

export interface UsuarioSessao {
  id: string;
  empresaId: string;
  nome: string;
  email: string;
  deveTrocarSenha: boolean;
  perfil: { id: string; nome: string; acessoTodasObras: boolean; permissoes: typeof perfil.$inferSelect.permissoes };
}

export async function criarSessao(db: Executor, usuarioId: string, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const token = tokenAleatorio();
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_DIAS * DIA_MS);
  await db.insert(sessao).values({ id: sha256(token), usuarioId, expiraEm, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null });
  return { token, expiraEm };
}

/** Valida o token do cookie. Renova a expiração (sessão deslizante) quando faltam menos de 15 dias. */
export async function validarSessao(db: Executor, token: string): Promise<{ usuario: UsuarioSessao; expiraEm: Date; renovada: boolean } | null> {
  const id = sha256(token);
  const [linha] = await db
    .select({ s: sessao, u: usuario, p: perfil })
    .from(sessao)
    .innerJoin(usuario, eq(usuario.id, sessao.usuarioId))
    .innerJoin(perfil, eq(perfil.id, usuario.perfilId))
    .where(and(eq(sessao.id, id), gt(sessao.expiraEm, new Date())))
    .limit(1);
  if (!linha || !linha.u.ativo) return null;

  let expiraEm = linha.s.expiraEm;
  let renovada = false;
  if (expiraEm.getTime() - Date.now() < RENOVAR_ABAIXO_DIAS * DIA_MS) {
    expiraEm = new Date(Date.now() + DURACAO_SESSAO_DIAS * DIA_MS);
    await db.update(sessao).set({ expiraEm }).where(eq(sessao.id, id));
    renovada = true;
  }
  const { u, p } = linha;
  return {
    usuario: {
      id: u.id, empresaId: u.empresaId, nome: u.nome, email: u.email, deveTrocarSenha: u.deveTrocarSenha,
      perfil: { id: p.id, nome: p.nome, acessoTodasObras: p.acessoTodasObras, permissoes: p.permissoes },
    },
    expiraEm,
    renovada,
  };
}

export async function encerrarSessao(db: Executor, token: string) {
  await db.delete(sessao).where(eq(sessao.id, sha256(token)));
}

export async function encerrarSessoesDoUsuario(db: Executor, usuarioId: string, excetoToken?: string) {
  const cond = excetoToken
    ? and(eq(sessao.usuarioId, usuarioId), sql`${sessao.id} <> ${sha256(excetoToken)}`)
    : eq(sessao.usuarioId, usuarioId);
  await db.delete(sessao).where(cond);
}

export type ResultadoLogin =
  | { ok: true; token: string; expiraEm: Date; usuarioId: string; deveTrocarSenha: boolean }
  | { ok: false; motivo: "CREDENCIAIS" | "BLOQUEADO" };

// Hash fictício para gastar o mesmo tempo quando o e-mail não existe (evita enumeração de usuários).
let hashFicticio: Promise<string> | undefined;
const obterHashFicticio = () => (hashFicticio ??= gerarHashSenha(tokenAleatorio()));

export async function autenticar(db: Executor, emailInformado: string, senha: string, meta: { ip?: string | null; userAgent?: string | null }): Promise<ResultadoLogin> {
  const email = emailInformado.trim().toLowerCase();
  const desde = new Date(Date.now() - JANELA_TENTATIVAS_MIN * 60_000);
  const [{ falhas }] = (await db
    .select({ falhas: sql<number>`count(*)::int` })
    .from(tentativaLogin)
    .where(and(eq(tentativaLogin.email, email), eq(tentativaLogin.sucesso, false), gt(tentativaLogin.criadoEm, desde)))) as [{ falhas: number }];
  if (falhas >= MAX_TENTATIVAS) return { ok: false, motivo: "BLOQUEADO" };

  const [u] = await db.select().from(usuario).where(sql`lower(${usuario.email}) = ${email}`).limit(1);
  const senhaOk = await verificarSenha(u?.senhaHash ?? (await obterHashFicticio()), senha);

  if (!u || !u.ativo || !senhaOk) {
    await db.insert(tentativaLogin).values({ email, ip: meta.ip ?? null, sucesso: false });
    await registrarAuditoria(db, {
      empresaId: u?.empresaId ?? null, usuarioId: u?.id ?? null, acao: "LOGIN_FALHOU", entidade: "usuario",
      entidadeId: u?.id ?? null, descricao: `Tentativa de login falhou para ${email}`, ip: meta.ip,
    });
    return { ok: false, motivo: "CREDENCIAIS" };
  }

  await db.insert(tentativaLogin).values({ email, ip: meta.ip ?? null, sucesso: true });
  await db.update(usuario).set({ ultimoLoginEm: new Date() }).where(eq(usuario.id, u.id));
  const { token, expiraEm } = await criarSessao(db, u.id, meta);
  await registrarAuditoria(db, { empresaId: u.empresaId, usuarioId: u.id, acao: "LOGIN", entidade: "usuario", entidadeId: u.id, ip: meta.ip });
  return { ok: true, token, expiraEm, usuarioId: u.id, deveTrocarSenha: u.deveTrocarSenha };
}

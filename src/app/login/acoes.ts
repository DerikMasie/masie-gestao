"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import type { EstadoForm } from "@/lib/acoes";
import { definirCookieSessao, lerTokenSessao, metaRequisicao, COOKIE_SESSAO } from "@/lib/auth/atual";
import { autenticar, encerrarSessao, JANELA_TENTATIVAS_MIN } from "@/servicos/sessoes";
import { cookies } from "next/headers";

export async function entrar(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const email = String(fd.get("email") ?? "").slice(0, 200);
  const senha = String(fd.get("senha") ?? "").slice(0, 200);
  if (!email || !senha) return { erro: "Informe e-mail e senha." };
  const r = await autenticar(db, email, senha, await metaRequisicao());
  if (!r.ok) {
    return { erro: r.motivo === "BLOQUEADO"
      ? `Muitas tentativas sem sucesso. Aguarde ${JANELA_TENTATIVAS_MIN} minutos ou peça ao administrador para redefinir sua senha.`
      : "E-mail ou senha incorretos." };
  }
  await definirCookieSessao(r.token, r.expiraEm);
  const destino = String(fd.get("destino") ?? "/");
  redirect(r.deveTrocarSenha ? "/conta/senha" : destino.startsWith("/") && !destino.startsWith("//") ? destino : "/");
}

export async function sair() {
  const token = await lerTokenSessao();
  if (token) await encerrarSessao(db, token);
  (await cookies()).delete(COOKIE_SESSAO);
  redirect("/login");
}

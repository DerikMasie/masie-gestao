import "server-only";
import { z } from "zod";
import { unstable_rethrow } from "next/navigation";
import { AcessoNegado, metaRequisicao, obterUsuarioAtual } from "@/lib/auth/atual";
import type { Contexto } from "@/servicos/contexto";
import { ErroNegocio } from "@/servicos/contexto";
import { errosDoZod } from "./validacao";

/** Estado devolvido pelas server actions para os formulários. */
export interface EstadoForm {
  ok?: boolean;
  mensagem?: string;
  erro?: string;
  campos?: Record<string, string>;
  /** Informação exibida uma única vez (ex.: senha provisória). */
  segredo?: string;
}

/** Converte exceções conhecidas em mensagens; erros inesperados viram mensagem genérica (e são logados). */
export async function tratar(fn: () => Promise<EstadoForm | void>): Promise<EstadoForm> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    unstable_rethrow(e); // deixa redirect()/notFound() seguirem
    if (e instanceof z.ZodError) return { erro: "Verifique os campos destacados.", campos: errosDoZod(e) };
    if (e instanceof ErroNegocio) return { erro: e.message, campos: e.campo ? { [e.campo]: e.message } : undefined };
    if (e instanceof AcessoNegado) return { erro: e.message };
    console.error("[acao]", e);
    return { erro: "Ocorreu um erro inesperado. Tente novamente ou contate o administrador." };
  }
}

export async function contextoAtual(): Promise<Contexto> {
  const u = await obterUsuarioAtual();
  if (!u) throw new AcessoNegado("Sessão expirada. Faça login novamente.");
  const { ip } = await metaRequisicao();
  return { empresaId: u.empresaId, usuarioId: u.id, ip };
}

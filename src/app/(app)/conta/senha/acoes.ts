"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { contextoAtual, tratar, type EstadoForm } from "@/lib/acoes";
import { lerTokenSessao } from "@/lib/auth/atual";
import { ErroNegocio } from "@/servicos/contexto";
import { trocarPropriaSenha } from "@/servicos/usuarios";

export async function trocarSenha(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const r = await tratar(async () => {
    const ctx = await contextoAtual();
    const nova = String(fd.get("novaSenha") ?? "");
    if (nova !== String(fd.get("confirmacao") ?? "")) throw new ErroNegocio("A confirmação não confere", "confirmacao");
    await trocarPropriaSenha(db, ctx, String(fd.get("senhaAtual") ?? ""), nova, (await lerTokenSessao())!);
  });
  if (r.ok) redirect("/?senha=alterada");
  return r;
}

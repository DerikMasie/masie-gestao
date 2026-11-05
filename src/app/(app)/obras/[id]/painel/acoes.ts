"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { contextoAtual, tratar, type EstadoForm } from "@/lib/acoes";
import { AcessoNegado, exigirPermissao, podeAcessarObra } from "@/lib/auth/atual";
import { criarLembrete, excluirLembrete, marcarLembrete } from "@/servicos/painel-obra";

/** Lembretes da semana: quem lança o realizado (Planejamento → editar) também cuida dos lembretes. */
async function exigir(obraId: string) {
  const u = await exigirPermissao("planejamento", "editar");
  if (!(await podeAcessarObra(u, obraId))) throw new AcessoNegado("Você não tem acesso a esta obra.");
  return contextoAtual();
}
const revalidar = (obraId: string) => { revalidatePath(`/obras/${obraId}/painel`); revalidatePath("/"); };

export async function criarLembreteAcao(obraId: string, semana: number, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId);
    await criarLembrete(db, ctx, obraId, { texto: String(fd.get("texto") ?? ""), importante: fd.get("importante") === "on", semana: z.number().int().min(1).max(520).parse(semana) });
    revalidar(obraId);
    return { ok: true };
  });
}

export async function marcarLembreteAcao(obraId: string, id: string, feito: boolean): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId);
    await marcarLembrete(db, ctx, obraId, z.uuid().parse(id), feito);
    revalidar(obraId);
  });
}

export async function excluirLembreteAcao(obraId: string, id: string): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId);
    await excluirLembrete(db, ctx, obraId, z.uuid().parse(id));
    revalidar(obraId);
  });
}

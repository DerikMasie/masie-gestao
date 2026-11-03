"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { contextoAtual, tratar, type EstadoForm } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/auth/atual";
import { esquemaCliente, formParaObjeto } from "@/lib/validacao";
import { excluirCliente, salvarCliente } from "@/servicos/cadastros";

export async function salvarClienteAcao(id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  let destino = "";
  const r = await tratar(async () => {
    await exigirPermissao("clientes", id ? "editar" : "criar");
    const c = await salvarCliente(db, await contextoAtual(), esquemaCliente.parse(formParaObjeto(fd)), id ?? undefined);
    destino = `/clientes?salvo=${encodeURIComponent(c.nome)}`;
  });
  if (destino) redirect(destino);
  return r;
}

export async function excluirClienteAcao(id: string, _: EstadoForm): Promise<EstadoForm> {
  const r = await tratar(async () => {
    await exigirPermissao("clientes", "excluir");
    await excluirCliente(db, await contextoAtual(), id);
  });
  if (r.ok) redirect("/clientes");
  return r;
}

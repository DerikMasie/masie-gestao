"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { contextoAtual, tratar, type EstadoForm } from "@/lib/acoes";
import { AcessoNegado, exigirPermissao, podeAcessarObra } from "@/lib/auth/atual";
import { esquemaObra, formParaObjeto } from "@/lib/validacao";
import { anexarArquivo, obterAnexo, removerAnexo } from "@/servicos/anexos";
import { ErroNegocio } from "@/servicos/contexto";
import { atualizarObra, criarObra, desvincularUsuarioObra, excluirObra, vincularUsuarioObra } from "@/servicos/obras";

async function exigirObra(obraId: string, acao: "ver" | "editar" | "excluir" = "editar") {
  const u = await exigirPermissao("obras", acao);
  if (!(await podeAcessarObra(u, obraId))) throw new AcessoNegado("Você não tem acesso a esta obra.");
  return u;
}

export async function criarObraAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  let destino = "";
  const r = await tratar(async () => {
    await exigirPermissao("obras", "criar");
    const { obra } = await criarObra(db, await contextoAtual(), esquemaObra.parse(formParaObjeto(fd)));
    destino = `/obras/${obra.id}?criada=1`;
  });
  if (destino) redirect(destino);
  return r;
}

export async function editarObraAcao(obraId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const r = await tratar(async () => {
    await exigirObra(obraId);
    await atualizarObra(db, await contextoAtual(), obraId, esquemaObra.parse(formParaObjeto(fd)));
  });
  if (r.ok) redirect(`/obras/${obraId}?salva=1`);
  return r;
}

export async function excluirObraAcao(obraId: string, _: EstadoForm): Promise<EstadoForm> {
  const r = await tratar(async () => {
    await exigirObra(obraId, "excluir");
    await excluirObra(db, await contextoAtual(), obraId);
  });
  if (r.ok) redirect("/obras?excluida=1");
  return r;
}

export async function vincularAcao(obraId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirObra(obraId);
    const usuarioId = String(fd.get("usuarioId") ?? "");
    const papel = String(fd.get("papel") ?? "").trim() || "Equipe";
    if (!usuarioId) throw new ErroNegocio("Selecione o usuário", "usuarioId");
    await vincularUsuarioObra(db, await contextoAtual(), obraId, usuarioId, papel.slice(0, 60));
    revalidatePath(`/obras/${obraId}`);
    return { ok: true, mensagem: "Usuário vinculado à obra." };
  });
}

export async function desvincularAcao(obraId: string, usuarioId: string, _: EstadoForm): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirObra(obraId);
    await desvincularUsuarioObra(db, await contextoAtual(), obraId, usuarioId);
    revalidatePath(`/obras/${obraId}`);
  });
}

export async function anexarAcao(obraId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirObra(obraId);
    const arquivos = fd.getAll("arquivo").filter((f): f is File => f instanceof File && f.size > 0);
    if (!arquivos.length) throw new ErroNegocio("Selecione ao menos um arquivo", "arquivo");
    const ctx = await contextoAtual();
    const descricao = String(fd.get("descricao") ?? "").trim().slice(0, 300) || null;
    for (const f of arquivos) {
      await anexarArquivo(db, ctx, { entidade: "obra", entidadeId: obraId, obraId },
        { nome: f.name, tipo: f.type, dados: Buffer.from(await f.arrayBuffer()), descricao });
    }
    revalidatePath(`/obras/${obraId}`);
    return { ok: true, mensagem: `${arquivos.length} arquivo(s) anexado(s).` };
  });
}

export async function removerAnexoAcao(obraId: string, anexoId: string, _: EstadoForm): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirObra(obraId);
    const ctx = await contextoAtual();
    const a = await obterAnexo(db, ctx.empresaId, anexoId);
    if (!a || a.obraId !== obraId) throw new ErroNegocio("Anexo não encontrado");
    await removerAnexo(db, ctx, anexoId);
    revalidatePath(`/obras/${obraId}`);
  });
}

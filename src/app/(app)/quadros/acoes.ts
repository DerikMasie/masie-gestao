"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { contextoAtual, tratar, type EstadoForm } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/auth/atual";
import { dataIsoOpcional, formParaObjeto, textoObrigatorio, textoOpcional } from "@/lib/validacao";
import { anexarArquivo, obterAnexo, removerAnexo } from "@/servicos/anexos";
import { ErroNegocio } from "@/servicos/contexto";
import {
  adicionarItemChecklist, alternarItemChecklist, arquivarCartao, atualizarCartao, atualizarQuadro, comentar, criarCartao,
  criarQuadro, detalheCartao, excluirCartao, excluirColuna, excluirEtiqueta, moverCartao, moverColuna, removerItemChecklist,
  salvarColuna, salvarEtiqueta,
} from "@/servicos/quadros";

const uuidOpc = z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable().default(null));
const esquemaCartao = z.object({
  titulo: textoObrigatorio("Título", 200),
  descricao: textoOpcional(5000),
  responsavelId: uuidOpc,
  obraId: uuidOpc,
  dataInicio: dataIsoOpcional("Data de início"),
  dataEntrega: dataIsoOpcional("Data de entrega"),
});

const caminho = (quadroId: string) => `/quadros/${quadroId}`;
function revalidar(quadroId: string) {
  revalidatePath(caminho(quadroId));
  revalidatePath("/quadros/calendario");
  revalidatePath("/");
}

export async function criarQuadroAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  let destino = "";
  const r = await tratar(async () => {
    await exigirPermissao("quadro", "criar");
    const d = z.object({ nome: textoObrigatorio("Nome", 80), descricao: textoOpcional(300) }).parse(formParaObjeto(fd));
    destino = caminho((await criarQuadro(db, await contextoAtual(), d)).id);
  });
  if (destino) redirect(destino);
  return r;
}

export async function editarQuadroAcao(quadroId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("quadro", "editar");
    const d = z.object({ nome: textoObrigatorio("Nome", 80), descricao: textoOpcional(300) }).parse(formParaObjeto(fd));
    await atualizarQuadro(db, await contextoAtual(), quadroId, { ...d, arquivado: fd.get("arquivado") === "on" });
    revalidar(quadroId); revalidatePath("/quadros");
    return { ok: true, mensagem: "Quadro atualizado." };
  });
}

/** Criação rápida (título + coluna), usada no rodapé de cada coluna e no calendário. */
export async function criarCartaoRapidoAcao(quadroId: string, colunaId: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("quadro", "criar");
    const o = formParaObjeto(fd);
    const qid = (o.quadroId as string) || quadroId;
    const d = esquemaCartao.parse({ ...o, descricao: "", obraId: "" });
    await criarCartao(db, await contextoAtual(), qid, { ...d, colunaId });
    revalidar(qid);
    return { ok: true };
  });
}

export async function salvarCartaoAcao(quadroId: string, cartaoId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("quadro", "editar");
    const d = esquemaCartao.parse(formParaObjeto(fd));
    await atualizarCartao(db, await contextoAtual(), cartaoId, { ...d, etiquetas: fd.getAll("etiquetas").map(String) });
    revalidar(quadroId);
    return { ok: true, mensagem: "Cartão salvo." };
  });
}

/** Chamada pelo arrastar-e-soltar (sem formulário). */
export async function moverCartaoAcao(cartaoId: string, colunaId: string, antesDe: string | null): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("quadro", "editar");
    const c = await moverCartao(db, await contextoAtual(), cartaoId, colunaId, antesDe);
    revalidar(c.quadroId);
  });
}

export async function moverCartaoFormAcao(quadroId: string, cartaoId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("quadro", "editar");
    const colunaId = String(fd.get("colunaId") ?? "");
    if (!colunaId) throw new ErroNegocio("Selecione a coluna");
    await moverCartao(db, await contextoAtual(), cartaoId, colunaId, null);
    revalidar(quadroId);
    return { ok: true, mensagem: "Cartão movido." };
  });
}

export async function arquivarCartaoAcao(quadroId: string, cartaoId: string, arquivar: boolean, _: EstadoForm): Promise<EstadoForm> {
  const r = await tratar(async () => {
    await exigirPermissao("quadro", "editar");
    await arquivarCartao(db, await contextoAtual(), cartaoId, arquivar);
    revalidar(quadroId);
  });
  if (r.ok) redirect(caminho(quadroId));
  return r;
}

export async function excluirCartaoAcao(quadroId: string, cartaoId: string, _: EstadoForm): Promise<EstadoForm> {
  const r = await tratar(async () => {
    await exigirPermissao("quadro", "excluir");
    await excluirCartao(db, await contextoAtual(), cartaoId);
    revalidar(quadroId);
  });
  if (r.ok) redirect(caminho(quadroId));
  return r;
}

export async function checklistAdicionarAcao(quadroId: string, cartaoId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("quadro", "editar");
    const texto = textoObrigatorio("Item", 300).parse(fd.get("texto"));
    await adicionarItemChecklist(db, await contextoAtual(), cartaoId, texto);
    revalidar(quadroId);
    return { ok: true };
  });
}

export async function checklistAlternarAcao(quadroId: string, itemId: string, _: EstadoForm): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("quadro", "editar");
    await alternarItemChecklist(db, await contextoAtual(), itemId);
    revalidar(quadroId);
  });
}

export async function checklistRemoverAcao(quadroId: string, itemId: string, _: EstadoForm): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("quadro", "editar");
    await removerItemChecklist(db, await contextoAtual(), itemId);
    revalidar(quadroId);
  });
}

export async function comentarAcao(quadroId: string, cartaoId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("quadro", "ver");
    const texto = textoObrigatorio("Comentário", 3000).parse(fd.get("texto"));
    await comentar(db, await contextoAtual(), cartaoId, texto);
    revalidar(quadroId);
    return { ok: true };
  });
}

export async function anexarCartaoAcao(quadroId: string, cartaoId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("quadro", "editar");
    const ctx = await contextoAtual();
    const { cartao } = await detalheCartao(db, ctx.empresaId, cartaoId);
    const arquivos = fd.getAll("arquivo").filter((f): f is File => f instanceof File && f.size > 0);
    if (!arquivos.length) throw new ErroNegocio("Selecione ao menos um arquivo", "arquivo");
    for (const f of arquivos) {
      await anexarArquivo(db, ctx, { entidade: "cartao", entidadeId: cartaoId, obraId: cartao.obraId }, { nome: f.name, tipo: f.type, dados: Buffer.from(await f.arrayBuffer()) });
    }
    revalidar(quadroId);
    return { ok: true, mensagem: `${arquivos.length} arquivo(s) anexado(s).` };
  });
}

export async function removerAnexoCartaoAcao(quadroId: string, anexoId: string, _: EstadoForm): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("quadro", "editar");
    const ctx = await contextoAtual();
    const a = await obterAnexo(db, ctx.empresaId, anexoId);
    if (!a || a.entidade !== "cartao") throw new ErroNegocio("Anexo não encontrado");
    await removerAnexo(db, ctx, anexoId);
    revalidar(quadroId);
  });
}

const esquemaColuna = z.object({
  nome: textoObrigatorio("Nome", 60),
  limite: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).max(999).nullable()),
});

export async function salvarColunaAcao(quadroId: string, colunaId: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("quadro", "editar");
    const d = esquemaColuna.parse(formParaObjeto(fd));
    await salvarColuna(db, await contextoAtual(), quadroId, { ...d, concluida: fd.get("concluida") === "on" }, colunaId ?? undefined);
    revalidar(quadroId);
    return { ok: true, mensagem: colunaId ? undefined : "Coluna criada." };
  });
}

export async function moverColunaAcao(quadroId: string, colunaId: string, direcao: -1 | 1, _: EstadoForm): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("quadro", "editar");
    await moverColuna(db, await contextoAtual(), quadroId, colunaId, direcao);
    revalidar(quadroId);
  });
}

export async function excluirColunaAcao(quadroId: string, colunaId: string, _: EstadoForm): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("quadro", "excluir");
    await excluirColuna(db, await contextoAtual(), quadroId, colunaId);
    revalidar(quadroId);
  });
}

export async function salvarEtiquetaAcao(quadroId: string, etiquetaId: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("quadro", "editar");
    const d = z.object({ nome: textoObrigatorio("Nome", 40), cor: z.string() }).parse(formParaObjeto(fd));
    await salvarEtiqueta(db, await contextoAtual(), quadroId, d, etiquetaId ?? undefined);
    revalidar(quadroId);
    return { ok: true };
  });
}

export async function excluirEtiquetaAcao(quadroId: string, etiquetaId: string, _: EstadoForm): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("quadro", "editar");
    await excluirEtiqueta(db, await contextoAtual(), quadroId, etiquetaId);
    revalidar(quadroId);
  });
}

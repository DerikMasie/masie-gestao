"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import type { Acao } from "@/dominio/permissoes";
import { contextoAtual, tratar, type EstadoForm } from "@/lib/acoes";
import { AcessoNegado, exigirPermissao, podeAcessarObra } from "@/lib/auth/atual";
import { ErroNegocio } from "@/servicos/contexto";
import {
  adicionarFoto, criarRelatorio, emitirRelatorio, excluirRelatorio, moverFoto, reabrirRelatorio, removerFoto, salvarCoresRelatorio, salvarFoto, salvarTextos,
} from "@/servicos/relatorios";

/** Módulo "Relatórios semanais": criar = criar/editar rascunho e fotos; editar = emitir e reabrir; excluir = excluir rascunho. */
async function exigir(obraId: string, acao: Acao) {
  const u = await exigirPermissao("relatorios", acao);
  if (!(await podeAcessarObra(u, obraId))) throw new AcessoNegado("Você não tem acesso a esta obra.");
  return contextoAtual();
}
const caminho = (obraId: string, id?: string) => `/obras/${obraId}?aba=fisico&vista=relatorio${id ? `&rel=${id}` : ""}`;
const revalidar = (obraId: string) => revalidatePath(`/obras/${obraId}`);
const uuid = z.uuid();

export async function criarRelatorioAcao(obraId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  let destino = "";
  const r = await tratar(async () => {
    const ctx = await exigir(obraId, "criar");
    const semana = z.coerce.number().int().min(1).max(520).parse(fd.get("semana"));
    destino = caminho(obraId, (await criarRelatorio(db, ctx, obraId, semana)).id);
    revalidar(obraId);
  });
  if (destino) redirect(destino);
  return r;
}

const texto = z.string().max(6000, "Texto muito longo").transform((v) => v.replace(/\r\n/g, "\n"));

export async function salvarTextosAcao(obraId: string, id: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, "criar");
    const t = z.object({ tarefasRealizadas: texto, tarefasProximaSemana: texto, anomalias: texto, acompanhamentoPrazo: texto }).parse({
      tarefasRealizadas: fd.get("tarefasRealizadas") ?? "", tarefasProximaSemana: fd.get("tarefasProximaSemana") ?? "",
      anomalias: fd.get("anomalias") ?? "", acompanhamentoPrazo: fd.get("acompanhamentoPrazo") ?? "",
    });
    await salvarTextos(db, ctx, obraId, uuid.parse(id), t);
    revalidar(obraId);
    return { ok: true, mensagem: "Textos salvos." };
  });
}

export async function emitirRelatorioAcao(obraId: string, id: string, _: EstadoForm): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, "editar");
    const e = await emitirRelatorio(db, ctx, obraId, uuid.parse(id));
    revalidar(obraId);
    return { ok: true, mensagem: `Relatório emitido (versão ${e.versao}). Baixe o PDF para enviar ao cliente.` };
  });
}

export async function reabrirRelatorioAcao(obraId: string, id: string, _: EstadoForm): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, "editar");
    await reabrirRelatorio(db, ctx, obraId, uuid.parse(id));
    revalidar(obraId);
    return { ok: true, mensagem: "Relatório reaberto para edição." };
  });
}

export async function excluirRelatorioAcao(obraId: string, id: string, _: EstadoForm): Promise<EstadoForm> {
  let destino = "";
  const r = await tratar(async () => {
    const ctx = await exigir(obraId, "excluir");
    await excluirRelatorio(db, ctx, obraId, uuid.parse(id));
    revalidar(obraId);
    destino = caminho(obraId);
  });
  if (destino) redirect(destino);
  return r;
}

export async function enviarFotoAcao(obraId: string, id: string, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, "criar");
    const arquivo = fd.get("foto");
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroNegocio("Selecione a foto");
    if (arquivo.size > 15 * 1024 * 1024) throw new ErroNegocio("Foto maior que 15 MB");
    await adicionarFoto(db, ctx, obraId, uuid.parse(id), { nome: arquivo.name, tipo: arquivo.type, dados: Buffer.from(await arquivo.arrayBuffer()) });
    revalidar(obraId);
  });
}

export async function salvarFotoAcao(obraId: string, id: string, fotoId: string, d: { legenda: string | null; focoX: number; focoY: number }): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, "criar");
    const v = z.object({ legenda: z.string().max(200).nullable(), focoX: z.number().finite(), focoY: z.number().finite() }).parse(d);
    await salvarFoto(db, ctx, obraId, uuid.parse(id), uuid.parse(fotoId), v);
    revalidar(obraId);
  });
}

export async function moverFotoAcao(obraId: string, id: string, fotoId: string, direcao: -1 | 1): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, "criar");
    await moverFoto(db, ctx, obraId, uuid.parse(id), uuid.parse(fotoId), direcao === -1 ? -1 : 1);
    revalidar(obraId);
  });
}

export async function removerFotoAcao(obraId: string, id: string, fotoId: string): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, "criar");
    await removerFoto(db, ctx, obraId, uuid.parse(id), uuid.parse(fotoId));
    revalidar(obraId);
  });
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida");

export async function salvarCoresAcao(obraId: string, cores: { principal: string; destaque: string; fundo: string } | null): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, "editar");
    const v = cores ? z.object({ principal: hex, destaque: hex, fundo: hex }).parse(cores) : null;
    await salvarCoresRelatorio(db, ctx, obraId, v);
    revalidar(obraId);
    return { ok: true, mensagem: v ? "Cores salvas. Valem para as prévias e os próximos relatórios emitidos desta obra." : "Cores voltaram ao padrão Masie." };
  });
}

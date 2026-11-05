"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { lerNumero } from "@/dominio/formato";
import type { Acao } from "@/dominio/permissoes";
import { contextoAtual, tratar, type EstadoForm } from "@/lib/acoes";
import { AcessoNegado, exigirPermissao, podeAcessarObra } from "@/lib/auth/atual";
import { textoObrigatorio, textoOpcional } from "@/lib/validacao";
import { ErroNegocio } from "@/servicos/contexto";
import {
  alterarEtapaRelatorio, criarEtapaObra, excluirServico, gerarDoOrcamentoBase, importarFisico, salvarPeriodoMedicao, salvarSemanas,
  salvarServico,
} from "@/servicos/fisico";

/**
 * Permissões (módulo "Planejamento"):
 *  - ver: abas do físico;
 *  - editar: lançar o realizado da semana (engenheiro da obra);
 *  - criar: montar/alterar a planilha da obra, o previsto e o período de medição.
 */
async function exigir(obraId: string, acao: Acao) {
  const u = await exigirPermissao("planejamento", acao);
  if (!(await podeAcessarObra(u, obraId))) throw new AcessoNegado("Você não tem acesso a esta obra.");
  return contextoAtual();
}

const revalidar = (obraId: string) => revalidatePath(`/obras/${obraId}`);

const num = (rotulo: string) => z.preprocess((v) => (typeof v === "number" ? v : lerNumero(String(v ?? ""))), z.number({ error: `${rotulo} inválido` }).finite(`${rotulo} inválido`).nullable());

const esquemaServico = z.object({
  etapaId: z.uuid("Etapa inválida"),
  descricao: textoObrigatorio("Serviço", 500),
  fornecedorId: z.preprocess((v) => (v === "" ? null : v), z.uuid("Fornecedor inválido").nullable()),
  maoDeObraAcertada: num("MO acertada"),
  maoDeObraVerba: num("MO verba").transform((v) => v ?? 0),
  valorCliente: num("Valor cliente").transform((v) => v ?? 0),
  duracaoDias: num("Duração").transform((v) => v ?? 0),
  curvaAbc: z.preprocess((v) => (v === "" ? null : v), z.enum(["A", "B", "C"]).nullable()),
  observacao: textoOpcional(1000),
});

export async function salvarServicoAcao(obraId: string, servicoId: string | null, dados: Record<string, unknown>): Promise<EstadoForm & { id?: string }> {
  let id: string | undefined;
  const r = await tratar(async () => {
    const ctx = await exigir(obraId, "criar");
    id = (await salvarServico(db, ctx, obraId, esquemaServico.parse(dados), servicoId ?? undefined)).id;
    revalidar(obraId);
  });
  return { ...r, id };
}

export async function excluirServicoAcao(obraId: string, servicoId: string): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, "criar");
    await excluirServico(db, ctx, obraId, servicoId);
    revalidar(obraId);
  });
}

const esquemaAlteracoes = z.array(z.object({
  servicoId: z.uuid(),
  semana: z.number().int().min(1).max(520),
  valor: z.number().finite().nullable(),
})).max(20000);

export async function salvarSemanasAcao(obraId: string, serie: "previsto" | "realizado", alteracoes: unknown): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, serie === "realizado" ? "editar" : "criar");
    const r = await salvarSemanas(db, ctx, obraId, serie, esquemaAlteracoes.parse(alteracoes));
    revalidar(obraId);
    return { ok: true, mensagem: r.alteradas ? `${r.alteradas} alteração(ões) salva(s).` : "Nada a salvar." };
  });
}

export async function gerarDoOrcamentoAcao(obraId: string, _: EstadoForm): Promise<EstadoForm> {
  let destino = "";
  const r = await tratar(async () => {
    const ctx = await exigir(obraId, "criar");
    const g = await gerarDoOrcamentoBase(db, ctx, obraId);
    revalidar(obraId);
    destino = `/obras/${obraId}?aba=fisico&vista=planilha&gerada=${g.servicos}`;
  });
  if (destino) redirect(destino);
  return r;
}

export async function importarFisicoAcao(obraId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  let destino = "";
  const r = await tratar(async () => {
    const ctx = await exigir(obraId, "criar");
    const arquivo = fd.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroNegocio("Selecione a planilha", "arquivo");
    if (arquivo.size > 25 * 1024 * 1024) throw new ErroNegocio("Arquivo maior que 25 MB", "arquivo");
    if (!/\.xls[xm]$/i.test(arquivo.name)) throw new ErroNegocio("Envie a planilha de controle em .xlsx ou .xlsm", "arquivo");
    const rel = await importarFisico(db, ctx, obraId, Buffer.from(await arquivo.arrayBuffer()), arquivo.name, { substituir: fd.get("substituir") === "on" });
    revalidar(obraId);
    const q = new URLSearchParams({
      importada: String(rel.servicos), semanas: String(rel.semanas), previsto: rel.previsto ? "1" : "0",
      ...(rel.etapasCriadas.length ? { criadas: rel.etapasCriadas.join(", ").slice(0, 300) } : {}),
      ...(rel.fornecedoresCriados.length ? { fornCriados: rel.fornecedoresCriados.join(", ").slice(0, 400) } : {}),
    });
    destino = `/obras/${obraId}?aba=fisico&vista=planilha&${q}`;
  });
  if (destino) redirect(destino);
  return r;
}

export async function criarEtapaAcao(obraId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, "criar");
    const nome = textoObrigatorio("Nome da categoria", 80).parse(fd.get("nome"));
    await criarEtapaObra(db, ctx, obraId, nome);
    revalidar(obraId);
    return { ok: true, mensagem: `Categoria "${nome}" criada. Inclua os serviços nela.` };
  });
}

export async function alterarEtapaRelatorioAcao(obraId: string, etapaId: string, exibir: boolean): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, "criar");
    await alterarEtapaRelatorio(db, ctx, obraId, z.uuid().parse(etapaId), exibir);
    revalidar(obraId);
  });
}

export async function periodoMedicaoAcao(obraId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, "criar");
    await salvarPeriodoMedicao(db, ctx, obraId, Number(fd.get("semanasPorMedicao")));
    revalidar(obraId);
    return { ok: true, mensagem: "Período de medição salvo." };
  });
}

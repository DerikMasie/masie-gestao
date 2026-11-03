"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { lerNumero } from "@/dominio/formato";
import { contextoAtual, tratar, type EstadoForm } from "@/lib/acoes";
import { AcessoNegado, exigirPermissao, podeAcessarObra, temPermissao } from "@/lib/auth/atual";
import { esquemaParametrosOrcamento, formParaObjeto, textoObrigatorio, textoOpcional } from "@/lib/validacao";
import { ErroNegocio } from "@/servicos/contexto";
import {
  avancarFluxo, carregarOrcamento, copiarDeOutroOrcamento, excluirItem, excluirRascunho, importarPlanilha, moverItem,
  novaRevisao, salvarItem, salvarParametros, type AcaoFluxo,
} from "@/servicos/orcamentos";

async function exigir(obraId: string, acao: "ver" | "criar" | "editar" | "aprovar" | "excluir" = "editar") {
  const u = await exigirPermissao("orcamentos", acao);
  if (!(await podeAcessarObra(u, obraId))) throw new AcessoNegado("Você não tem acesso a esta obra.");
  return u;
}

/** Garante que o orçamento pertence à obra informada na URL (evita misturar obras). */
async function exigirDaObra(obraId: string, orcamentoId: string) {
  const ctx = await contextoAtual();
  const c = await carregarOrcamento(db, ctx.empresaId, orcamentoId);
  if (c.orcamento.obraId !== obraId) throw new ErroNegocio("Orçamento não pertence a esta obra");
  return { ctx, c };
}

const caminho = (obraId: string, orcamentoId?: string) => (orcamentoId ? `/obras/${obraId}/orcamentos/${orcamentoId}` : `/obras/${obraId}?aba=orcamento`);
function revalidar(obraId: string, orcamentoId?: string) {
  revalidatePath(`/obras/${obraId}`);
  if (orcamentoId) revalidatePath(caminho(obraId, orcamentoId));
}

export async function novaRevisaoAcao(obraId: string, origemId: string, _: EstadoForm): Promise<EstadoForm> {
  let destino = "";
  const r = await tratar(async () => {
    await exigir(obraId, "criar");
    const { ctx } = await exigirDaObra(obraId, origemId);
    destino = caminho(obraId, (await novaRevisao(db, ctx, origemId)).id);
  });
  if (destino) redirect(destino);
  return r;
}

export async function importarPlanilhaAcao(obraId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  let destino = "";
  const r = await tratar(async () => {
    await exigir(obraId, "criar");
    const arquivo = fd.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroNegocio("Selecione a planilha", "arquivo");
    if (arquivo.size > 20 * 1024 * 1024) throw new ErroNegocio("Arquivo maior que 20 MB", "arquivo");
    if (!/\.xlsx$/i.test(arquivo.name)) throw new ErroNegocio("Envie um arquivo .xlsx (abra o .xlsm no Excel e use Salvar como → .xlsx)", "arquivo");
    const numero = z.coerce.number().int().min(1).max(99).parse(fd.get("numero") ?? 1);
    const rel = await importarPlanilha(db, await contextoAtual(), obraId, numero, Buffer.from(await arquivo.arrayBuffer()), arquivo.name, { ignorarSemQuantidade: fd.get("ignorarSemQuantidade") === "on" });
    const q = new URLSearchParams({
      importado: "1", itens: String(rel.itens), confere: rel.confere == null ? "na" : rel.confere ? "1" : "0",
      ...(rel.etapasCriadas.length ? { criadas: rel.etapasCriadas.join(", ").slice(0, 300) } : {}),
      ...(rel.avisos.length ? { avisos: rel.avisos.join(" | ").slice(0, 800) } : {}),
    });
    revalidar(obraId);
    destino = `${caminho(obraId, rel.orcamentoId)}?${q}`;
  });
  if (destino) redirect(destino);
  return r;
}

export async function salvarParametrosAcao(obraId: string, orcamentoId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigir(obraId);
    const { ctx } = await exigirDaObra(obraId, orcamentoId);
    const o = formParaObjeto(fd);
    const parametros = esquemaParametrosOrcamento().parse(o);
    const d = z.object({ titulo: textoObrigatorio("Título", 120), observacoes: textoOpcional(3000) }).parse(o);
    await salvarParametros(db, ctx, orcamentoId, { ...d, parametros });
    revalidar(obraId, orcamentoId);
    return { ok: true, mensagem: "Parâmetros salvos. Os valores foram recalculados." };
  });
}

const n = (rotulo: string) => z.preprocess((v) => (typeof v === "number" ? v : lerNumero(String(v ?? ""))), z.number({ error: `${rotulo} inválido` }).finite(`${rotulo} inválido`).nullable());

const esquemaItem = z.object({
  etapaId: z.uuid("Etapa inválida"),
  grupo: textoOpcional(120),
  descricao: textoObrigatorio("Descrição", 500),
  unidade: textoOpcional(20),
  quantidade: n("Quantidade").transform((v) => v ?? 0),
  memoriaCalculo: textoOpcional(1000),
  quebra: n("Quebra").transform((v) => v ?? 1),
  custoUnitarioMaoDeObra: n("Valor de MO").transform((v) => v ?? 0),
  custoUnitarioMaterial: n("Valor de material").transform((v) => v ?? 0),
  /** BDI do item digitado em % (vazio = usa o do orçamento). */
  bdiMaoDeObra: n("BDI MO").transform((v) => (v == null ? null : v / 100)),
  bdiMaterial: n("BDI material").transform((v) => (v == null ? null : v / 100)),
  observacao: textoOpcional(1000),
});
export type ItemEditado = z.input<typeof esquemaItem>;

/** Chamada direta pelo editor (sem formulário): cria ou atualiza um item e devolve o id. */
export async function salvarItemAcao(obraId: string, orcamentoId: string, itemId: string | null, dados: Record<string, unknown>): Promise<EstadoForm & { id?: string }> {
  let id: string | undefined;
  const r = await tratar(async () => {
    await exigir(obraId);
    const { ctx } = await exigirDaObra(obraId, orcamentoId);
    id = (await salvarItem(db, ctx, orcamentoId, esquemaItem.parse(dados), itemId ?? undefined)).id;
    revalidar(obraId, orcamentoId);
  });
  return { ...r, id };
}

export async function excluirItemAcao(obraId: string, orcamentoId: string, itemId: string): Promise<EstadoForm> {
  return tratar(async () => {
    await exigir(obraId);
    const { ctx } = await exigirDaObra(obraId, orcamentoId);
    await excluirItem(db, ctx, orcamentoId, itemId);
    revalidar(obraId, orcamentoId);
  });
}

export async function moverItemAcao(obraId: string, orcamentoId: string, itemId: string, direcao: -1 | 1): Promise<EstadoForm> {
  return tratar(async () => {
    await exigir(obraId);
    const { ctx } = await exigirDaObra(obraId, orcamentoId);
    await moverItem(db, ctx, orcamentoId, itemId, direcao);
    revalidar(obraId, orcamentoId);
  });
}

export async function fluxoAcao(obraId: string, orcamentoId: string, acao: AcaoFluxo, _: EstadoForm): Promise<EstadoForm> {
  return tratar(async () => {
    const u = await exigir(obraId, acao === "ENVIAR" || acao === "VOLTAR_RASCUNHO" ? "editar" : "aprovar");
    if ((acao === "APROVAR" || acao === "REJEITAR" || acao === "DEFINIR_BASE") && !temPermissao(u, "orcamentos", "aprovar")) throw new AcessoNegado();
    const { ctx } = await exigirDaObra(obraId, orcamentoId);
    await avancarFluxo(db, ctx, orcamentoId, acao);
    revalidar(obraId, orcamentoId);
    const msg: Record<AcaoFluxo, string> = {
      ENVIAR: "Orçamento marcado como enviado; valores congelados.", VOLTAR_RASCUNHO: "Orçamento voltou para rascunho.",
      APROVAR: "Orçamento aprovado.", REJEITAR: "Orçamento marcado como rejeitado.",
      DEFINIR_BASE: "Definido como orçamento-base: o custo orçado da obra foi atualizado.",
    };
    return { ok: true, mensagem: msg[acao] };
  });
}

export async function copiarDeAcao(obraId: string, orcamentoId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigir(obraId);
    const { ctx } = await exigirDaObra(obraId, orcamentoId);
    const origem = z.uuid("Selecione o orçamento de origem").parse(fd.get("origemId"));
    const r = await copiarDeOutroOrcamento(db, ctx, orcamentoId, origem);
    revalidar(obraId, orcamentoId);
    return { ok: true, mensagem: `${r.itens} itens copiados.${r.etapasCriadas.length ? ` Etapas criadas na obra: ${r.etapasCriadas.join(", ")}.` : ""}` };
  });
}

export async function excluirRascunhoAcao(obraId: string, orcamentoId: string, _: EstadoForm): Promise<EstadoForm> {
  const r = await tratar(async () => {
    await exigir(obraId, "excluir");
    const { ctx } = await exigirDaObra(obraId, orcamentoId);
    await excluirRascunho(db, ctx, orcamentoId);
    revalidar(obraId);
  });
  if (r.ok) redirect(caminho(obraId));
  return r;
}

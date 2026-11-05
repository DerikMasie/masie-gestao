"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { lerNumero } from "@/dominio/formato";
import type { Acao } from "@/dominio/permissoes";
import { contextoAtual, tratar, type EstadoForm } from "@/lib/acoes";
import { AcessoNegado, exigirPermissao, podeAcessarObra } from "@/lib/auth/atual";
import { formParaObjeto, textoObrigatorio } from "@/lib/validacao";
import { alterarSituacaoMedicao, excluirAjuste, fecharMedicao, reabrirMedicao, salvarAjuste, salvarPagamentos } from "@/servicos/medicoes";

/**
 * Permissões (módulo "Medições e aditivos"): criar = fechar medição e lançar aditivos/descontos/reembolsos;
 * editar = situação paga/não paga e pagamentos a fornecedores; aprovar = reabrir medição fechada.
 */
async function exigir(obraId: string, acao: Acao) {
  const u = await exigirPermissao("medicoes", acao);
  if (!(await podeAcessarObra(u, obraId))) throw new AcessoNegado("Você não tem acesso a esta obra.");
  return contextoAtual();
}
const revalidar = (obraId: string) => revalidatePath(`/obras/${obraId}`);
const numero = z.coerce.number().int().min(1).max(600);
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

export async function fecharMedicaoAcao(obraId: string, n: number, _: EstadoForm): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, "criar");
    await fecharMedicao(db, ctx, obraId, numero.parse(n));
    revalidar(obraId);
    return { ok: true, mensagem: `Medição ${n} fechada. Os valores ficaram congelados.` };
  });
}

export async function reabrirMedicaoAcao(obraId: string, n: number, _: EstadoForm): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, "aprovar");
    await reabrirMedicao(db, ctx, obraId, numero.parse(n));
    revalidar(obraId);
    return { ok: true, mensagem: `Medição ${n} reaberta.` };
  });
}

export async function situacaoMedicaoAcao(obraId: string, n: number, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, "editar");
    const paga = fd.get("situacao") === "PAGA";
    const pagaEm = paga ? dataIso.parse(fd.get("pagaEm")) : null;
    await alterarSituacaoMedicao(db, ctx, obraId, numero.parse(n), paga ? "PAGA" : "NAO_PAGA", pagaEm);
    revalidar(obraId);
    return { ok: true, mensagem: paga ? `Medição ${n} marcada como paga.` : `Medição ${n} marcada como não paga.` };
  });
}

const esquemaAjuste = z.object({
  tipo: z.enum(["ADITIVO", "DESCONTO", "REEMBOLSO"], { error: "Escolha o tipo" }),
  data: dataIso,
  valor: z.preprocess((v) => lerNumero(String(v ?? "")), z.number({ error: "Informe o valor" }).positive("Informe um valor maior que zero")),
  descricao: textoObrigatorio("Descrição", 300),
  medicaoNumero: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(1).nullable()),
});

export async function salvarAjusteAcao(obraId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, "criar");
    await salvarAjuste(db, ctx, obraId, esquemaAjuste.parse(formParaObjeto(fd)));
    revalidar(obraId);
    return { ok: true, mensagem: "Lançamento incluído." };
  });
}

export async function excluirAjusteAcao(obraId: string, id: string, _: EstadoForm): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, "criar");
    await excluirAjuste(db, ctx, obraId, z.uuid().parse(id));
    revalidar(obraId);
    return { ok: true, mensagem: "Lançamento removido." };
  });
}

const esquemaPagamentos = z.array(z.object({ fornecedorId: z.uuid(), semana: z.number().int().min(1).max(520), valor: z.number().finite().nullable() })).max(5000);

export async function salvarPagamentosAcao(obraId: string, alteracoes: unknown): Promise<EstadoForm> {
  return tratar(async () => {
    const ctx = await exigir(obraId, "editar");
    const r = await salvarPagamentos(db, ctx, obraId, esquemaPagamentos.parse(alteracoes));
    revalidar(obraId);
    return { ok: true, mensagem: r.alteradas ? `${r.alteradas} pagamento(s) salvo(s).` : "Nada a salvar." };
  });
}

"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { contextoAtual, tratar, type EstadoForm } from "@/lib/acoes";
import { AcessoNegado, exigirPermissao, temPermissao } from "@/lib/auth/atual";
import { esquemaDadosBancarios, esquemaFornecedor, formParaObjeto } from "@/lib/validacao";
import { excluirFornecedor, salvarFornecedor } from "@/servicos/cadastros";

export async function salvarFornecedorAcao(id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  let destino = "";
  const r = await tratar(async () => {
    const u = await exigirPermissao("fornecedores", id ? "editar" : "criar");
    const obj = formParaObjeto(fd);
    let bancarios;
    if (obj.alterarBancarios === "1") {
      if (!temPermissao(u, "fornecedores_bancarios", "editar")) throw new AcessoNegado("Você não pode alterar dados bancários.");
      bancarios = esquemaDadosBancarios.parse({ nomeDeposito: obj.b_nomeDeposito, banco: obj.b_banco, agencia: obj.b_agencia, conta: obj.b_conta, pix: obj.b_pix });
    }
    const f = await salvarFornecedor(db, await contextoAtual(), esquemaFornecedor.parse(obj), bancarios, id ?? undefined);
    destino = `/fornecedores?salvo=${encodeURIComponent(f.nome)}`;
  });
  if (destino) redirect(destino);
  return r;
}

export async function excluirFornecedorAcao(id: string, _: EstadoForm): Promise<EstadoForm> {
  const r = await tratar(async () => {
    await exigirPermissao("fornecedores", "excluir");
    await excluirFornecedor(db, await contextoAtual(), id);
  });
  if (r.ok) redirect("/fornecedores");
  return r;
}

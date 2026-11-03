"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { normalizarMatriz, TODOS_MODULOS } from "@/dominio/permissoes";
import { contextoAtual, tratar, type EstadoForm } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/auth/atual";
import { esquemaEmpresa, esquemaUsuario, formParaObjeto, textoObrigatorio, textoOpcional } from "@/lib/validacao";
import { salvarEmpresa, salvarEtapaPadrao } from "@/servicos/cadastros";
import { ErroNegocio } from "@/servicos/contexto";
import { atualizarUsuario, criarUsuario, excluirPerfil, redefinirSenha, salvarPerfil } from "@/servicos/usuarios";
import { z } from "zod";

export async function salvarEmpresaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("configuracoes", "editar");
    const { lucroMaoDeObra, lucroMaterial, impostos, formula, ...d } = esquemaEmpresa.parse(formParaObjeto(fd));
    await salvarEmpresa(db, await contextoAtual(), d, { lucroMaoDeObra: Number(lucroMaoDeObra), lucroMaterial: Number(lucroMaterial), impostos: Number(impostos), formula });
    revalidatePath("/", "layout");
    return { ok: true, mensagem: "Dados da empresa salvos. Os novos parâmetros valem para orçamentos criados a partir de agora." };
  });
}

const esquemaEtapa = z.object({
  nome: textoObrigatorio("Nome", 100),
  tipo: z.enum(["CONTRATO", "ADITIVO", "FATURAMENTO_DIRETO"]),
  ordem: z.coerce.number().int().min(1).max(999),
  ativo: z.preprocess((v) => v === "on", z.boolean()),
});

export async function salvarEtapaAcao(id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("configuracoes", "editar");
    await salvarEtapaPadrao(db, await contextoAtual(), esquemaEtapa.parse(formParaObjeto(fd)), id ?? undefined);
    revalidatePath("/configuracoes/etapas");
    return { ok: true, mensagem: id ? "Etapa atualizada." : "Etapa criada." };
  });
}

export async function criarUsuarioAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("usuarios", "criar");
    const { usuario, senhaProvisoria } = await criarUsuario(db, await contextoAtual(), esquemaUsuario.parse({ ...formParaObjeto(fd), ativo: "on" }));
    revalidatePath("/configuracoes/usuarios");
    return { ok: true, mensagem: `Usuário ${usuario.email} criado.`, segredo: senhaProvisoria };
  });
}

export async function editarUsuarioAcao(id: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const r = await tratar(async () => {
    await exigirPermissao("usuarios", "editar");
    await atualizarUsuario(db, await contextoAtual(), id, esquemaUsuario.parse(formParaObjeto(fd)));
  });
  if (r.ok) redirect("/configuracoes/usuarios?salvo=1");
  return r;
}

export async function redefinirSenhaAcao(id: string, _: EstadoForm): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("usuarios", "editar");
    const senha = await redefinirSenha(db, await contextoAtual(), id);
    return { ok: true, segredo: senha };
  });
}

export async function salvarPerfilAcao(id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  let destino = "";
  const r = await tratar(async () => {
    await exigirPermissao("usuarios", id ? "editar" : "criar");
    const bruto: Record<string, string[]> = {};
    for (const m of TODOS_MODULOS) bruto[m] = fd.getAll(`perm_${m}`).map(String);
    const d = z.object({ nome: textoObrigatorio("Nome", 60), descricao: textoOpcional(300) }).parse(formParaObjeto(fd));
    const permissoes = normalizarMatriz(bruto);
    if (!Object.keys(permissoes).length) throw new ErroNegocio("Selecione ao menos uma permissão.");
    await salvarPerfil(db, await contextoAtual(), { ...d, acessoTodasObras: fd.get("acessoTodasObras") === "on", permissoes }, id ?? undefined);
    destino = "/configuracoes/perfis?salvo=1";
  });
  if (destino) redirect(destino);
  return r;
}

export async function excluirPerfilAcao(id: string, _: EstadoForm): Promise<EstadoForm> {
  const r = await tratar(async () => {
    await exigirPermissao("usuarios", "excluir");
    await excluirPerfil(db, await contextoAtual(), id);
  });
  if (r.ok) redirect("/configuracoes/perfis");
  return r;
}

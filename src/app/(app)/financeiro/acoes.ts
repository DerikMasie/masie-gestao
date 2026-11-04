"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { fornecedor } from "@/db/schema";
import { somenteDigitos } from "@/dominio/documentos";
import { lerNumero } from "@/dominio/formato";
import { contextoAtual, tratar, type EstadoForm } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/auth/atual";
import { lerNFe } from "@/lib/nfe";
import { dataIso, dataIsoOpcional, formParaObjeto, textoObrigatorio, textoOpcional } from "@/lib/validacao";
import { ErroNegocio } from "@/servicos/contexto";
import {
  baixarParcela, cancelarNota, criarCentro, criarLancamento, criarTitulo, excluirLancamento, lancarNota, programarParcela, salvarConta, salvarPlano,
} from "@/servicos/financeiro";
import { desfazerImportacao, importarFinanceiro } from "@/servicos/importacao-financeiro";

const valor = (rotulo: string) => z.preprocess((v) => lerNumero(String(v ?? "")), z.number({ error: `${rotulo} inválido` }).finite(`${rotulo} inválido`).positive(`${rotulo} deve ser maior que zero`));
const uuid = (rotulo: string) => z.uuid(`Selecione ${rotulo}`);
const uuidOpc = z.preprocess((v) => (v === "" || v == null ? null : v), z.uuid().nullable());
const inteiro = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

function revalidarFinanceiro() {
  for (const p of ["/financeiro", "/financeiro/lancamentos", "/financeiro/contas", "/financeiro/provisao", "/financeiro/centros", "/compras/notas", "/"]) revalidatePath(p);
  revalidatePath("/obras", "layout");
}

// ───────────── Lançamentos ─────────────

const esquemaLanc = z.object({
  data: dataIso("Data"), tipo: z.enum(["ENTRADA", "SAIDA"]), valor: valor("Valor"), contaId: uuid("a conta"), centroCustoId: uuid("o centro de custo"),
  planoContaId: uuid("a classificação"), obraEtapaId: uuidOpc, descricao: textoOpcional(500), observacao: textoOpcional(500),
});

export async function criarLancamentoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("financeiro", "criar");
    await criarLancamento(db, await contextoAtual(), esquemaLanc.parse(formParaObjeto(fd)));
    revalidarFinanceiro();
    return { ok: true, mensagem: "Lançamento registrado." };
  });
}

export async function excluirLancamentoAcao(id: string, _: EstadoForm): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("financeiro", "excluir");
    await excluirLancamento(db, await contextoAtual(), id);
    revalidarFinanceiro();
  });
}

// ───────────── Títulos ─────────────

const esquemaTitulo = z.object({
  tipo: z.enum(["PAGAR", "RECEBER"]), fornecedorId: uuidOpc, clienteId: uuidOpc, centroCustoId: uuid("o centro de custo"), planoContaId: uuid("a classificação"),
  obraEtapaId: uuidOpc, descricao: textoObrigatorio("Descrição", 300), documento: textoOpcional(60), emissao: dataIso("Emissão"), valorTotal: valor("Valor"),
  parcelas: inteiro(1, 120).default(1), primeiroVencimento: dataIso("Primeiro vencimento"), intervaloDias: inteiro(1, 365).default(30),
});

export async function criarTituloAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("financeiro", "criar");
    const d = esquemaTitulo.parse(formParaObjeto(fd));
    await criarTitulo(db, await contextoAtual(), d);
    revalidarFinanceiro();
    return { ok: true, mensagem: `Conta a ${d.tipo === "PAGAR" ? "pagar" : "receber"} registrada em ${d.parcelas} parcela(s).` };
  });
}

export async function baixarParcelaAcao(parcelaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("financeiro", "editar");
    const d = z.object({ data: dataIso("Data"), contaId: uuid("a conta"), valor: z.preprocess((v) => lerNumero(String(v ?? "")), z.number().positive().nullable()) }).parse(formParaObjeto(fd));
    await baixarParcela(db, await contextoAtual(), parcelaId, d);
    revalidarFinanceiro();
    return { ok: true, mensagem: "Baixa registrada no caixa." };
  });
}

export async function programarParcelaAcao(parcelaId: string, programado: boolean): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("financeiro", "editar");
    await programarParcela(db, await contextoAtual(), parcelaId, programado);
    revalidarFinanceiro();
  });
}

// ───────────── Cadastros financeiros ─────────────

export async function salvarContaAcao(id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("configuracoes", "editar");
    const d = z.object({
      nome: textoObrigatorio("Nome", 80), tipo: z.enum(["BANCO", "CAIXA", "CARTAO", "APLICACAO"]), banco: textoOpcional(60), agencia: textoOpcional(20), conta: textoOpcional(30),
      saldoInicial: z.preprocess((v) => lerNumero(String(v ?? "")) ?? 0, z.number().finite()).transform((n) => n.toFixed(2)),
    }).parse(formParaObjeto(fd));
    await salvarConta(db, await contextoAtual(), { ...d, contaDeSocio: fd.get("contaDeSocio") === "on", ativo: id ? fd.get("ativo") === "on" : true }, id ?? undefined);
    revalidatePath("/configuracoes/contas"); revalidarFinanceiro();
    return { ok: true, mensagem: "Conta salva." };
  });
}

export async function salvarPlanoAcao(id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("configuracoes", "editar");
    const d = z.object({
      grupo: textoObrigatorio("Grupo", 80), subitem: textoObrigatorio("Subitem", 80),
      natureza: z.enum(["RECEITA", "CUSTO", "DESPESA", "IMPOSTO", "RETIRADA", "FINANCIAMENTO", "INVESTIMENTO", "TRANSFERENCIA", "AJUSTE"]), etapaPadraoId: uuidOpc,
    }).parse(formParaObjeto(fd));
    await salvarPlano(db, await contextoAtual(), { ...d, ativo: id ? fd.get("ativo") === "on" : true }, id ?? undefined);
    revalidatePath("/configuracoes/plano-de-contas");
    return { ok: true, mensagem: id ? undefined : "Subitem criado." };
  });
}

export async function criarCentroAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("financeiro", "criar");
    const d = z.object({
      codigo: z.string().trim().regex(/^[A-Za-z0-9._-]{2,30}$/, "Código inválido"), nome: textoObrigatorio("Nome", 120),
      tipo: z.enum(["ADMINISTRATIVO", "PROJETO", "CONSULTORIA"]),
      valorContrato: z.preprocess((v) => lerNumero(String(v ?? "")), z.number().nonnegative().nullable()).transform((n) => (n == null ? null : n.toFixed(2))),
    }).parse(formParaObjeto(fd));
    await criarCentro(db, await contextoAtual(), d);
    revalidarFinanceiro();
    return { ok: true, mensagem: "Centro de custo criado." };
  });
}

// ───────────── Importação do histórico ─────────────

export async function importarFinanceiroAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  let destino = "";
  const r = await tratar(async () => {
    await exigirPermissao("financeiro", "criar");
    await exigirPermissao("configuracoes", "editar");
    const f = fd.get("arquivo");
    if (!(f instanceof File) || f.size === 0) throw new ErroNegocio("Selecione o arquivo", "arquivo");
    if (!/\.xls[xm]$/i.test(f.name)) throw new ErroNegocio("Envie o Financeiro em .xlsm ou .xlsx", "arquivo");
    if (f.size > 25 * 1024 * 1024) throw new ErroNegocio("Arquivo maior que 25 MB", "arquivo");
    const rel = await importarFinanceiro(db, await contextoAtual(), Buffer.from(await f.arrayBuffer()), f.name);
    revalidarFinanceiro();
    destino = `/financeiro/importar?id=${rel.importacaoId}`;
  });
  if (destino) redirect(destino);
  return r;
}

export async function desfazerImportacaoAcao(id: string, _: EstadoForm): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("financeiro", "excluir");
    const n = await desfazerImportacao(db, await contextoAtual(), id);
    revalidarFinanceiro(); revalidatePath("/financeiro/importar");
    return { ok: true, mensagem: `${n} lançamentos removidos.` };
  });
}

// ───────────── Notas fiscais ─────────────

const esquemaNota = z.object({
  fornecedorId: uuidOpc, numero: textoObrigatorio("Número", 20), serie: z.string().trim().max(5).default("1"),
  chaveNfe: z.preprocess((v) => (typeof v === "string" && v.trim() ? somenteDigitos(v) : null), z.string().nullable()),
  emissao: dataIso("Emissão"), tipo: z.enum(["A_VISTA", "A_PRAZO", "ACUMULADA", "DEVOLUCAO"]), valorTotal: valor("Valor"),
  centroCustoId: uuid("a obra/centro de custo"), obraEtapaId: uuidOpc, planoContaId: uuid("a classificação"), descricao: textoOpcional(500),
  parcelas: inteiro(1, 60).default(1), primeiroVencimento: dataIsoOpcional("Primeiro vencimento"), intervaloDias: inteiro(1, 365).default(30), pagaNaConta: uuidOpc,
  xml: z.preprocess((v) => (typeof v === "string" && v.trim() ? v : null), z.string().max(5_000_000).nullable()),
  emitenteDocumento: textoOpcional(20), emitenteNome: textoOpcional(200),
});

export async function lancarNotaAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  let destino = "";
  const r = await tratar(async () => {
    await exigirPermissao("compras", "criar");
    const ctx = await contextoAtual();
    const d = esquemaNota.parse(formParaObjeto(fd));
    if (d.xml) {
      // confere o XML no servidor: chave e valor não podem divergir do que foi gravado
      const x = lerNFe(d.xml);
      if (d.chaveNfe && d.chaveNfe !== x.chave) throw new ErroNegocio("A chave informada não confere com o XML", "chaveNfe");
      if (Math.abs(x.valorTotal - d.valorTotal) > 0.009) throw new ErroNegocio(`O valor informado difere do XML (R$ ${x.valorTotal.toFixed(2)})`, "valorTotal");
      d.chaveNfe = x.chave;
    }
    let fornecedorId = d.fornecedorId;
    if (!fornecedorId) {
      // fornecedor vindo do XML: localizar por CNPJ ou cadastrar
      if (!d.emitenteNome) throw new ErroNegocio("Selecione o fornecedor", "fornecedorId");
      const doc = d.emitenteDocumento ? somenteDigitos(d.emitenteDocumento) : null;
      const [f] = doc ? await db.select().from(fornecedor).where(and(eq(fornecedor.empresaId, ctx.empresaId), eq(fornecedor.documento, doc), sql`${fornecedor.excluidoEm} is null`)) : [];
      if (f) fornecedorId = f.id;
      else {
        const [n] = await db.insert(fornecedor).values({ empresaId: ctx.empresaId, nome: d.emitenteNome.slice(0, 120), razaoSocial: d.emitenteNome, documento: doc, tipoPessoa: doc && doc.length === 11 ? "PF" : "PJ" })
          .onConflictDoNothing().returning();
        fornecedorId = n?.id ?? (await db.select().from(fornecedor).where(and(eq(fornecedor.empresaId, ctx.empresaId), sql`lower(${fornecedor.nome}) = lower(${d.emitenteNome.slice(0, 120)})`)))[0]!.id;
      }
    }
    const { emitenteDocumento: _d, emitenteNome: _n, ...dados } = d;
    await lancarNota(db, ctx, { ...dados, fornecedorId: fornecedorId!, faturadoAoCliente: fd.get("faturadoAoCliente") === "on" });
    revalidarFinanceiro();
    destino = "/compras/notas?lancada=1";
  });
  if (destino) redirect(destino);
  return r;
}

export async function cancelarNotaAcao(id: string, _: EstadoForm): Promise<EstadoForm> {
  return tratar(async () => {
    await exigirPermissao("compras", "excluir");
    await cancelarNota(db, await contextoAtual(), id);
    revalidarFinanceiro();
  });
}

/** Para o formulário de NF: localizar fornecedor pelo CNPJ do XML. */
export async function fornecedorPorDocumentoAcao(documento: string): Promise<{ id: string; nome: string } | null> {
  const u = await exigirPermissao("compras", "criar");
  const doc = somenteDigitos(documento);
  if (doc.length < 11) return null;
  const [f] = await db.select({ id: fornecedor.id, nome: fornecedor.nome }).from(fornecedor)
    .where(and(eq(fornecedor.empresaId, u.empresaId), eq(fornecedor.documento, doc), sql`${fornecedor.excluidoEm} is null`));
  return f ?? null;
}

/** Saldo da verba da etapa (para o aviso de estouro no formulário de NF). */
export async function verbaEtapaAcao(centroCustoId: string, obraEtapaId: string) {
  const u = await exigirPermissao("compras", "ver");
  const { centroCusto } = await import("@/db/schema");
  const { verbaDaObra } = await import("@/servicos/financeiro");
  const [cc] = await db.select().from(centroCusto).where(and(eq(centroCusto.id, centroCustoId), eq(centroCusto.empresaId, u.empresaId)));
  if (!cc?.obraId) return null;
  const v = await verbaDaObra(db, u.empresaId, cc.obraId);
  const l = v.linhas.find((x) => x.etapa.id === obraEtapaId);
  return l ? { orcado: l.orcado, incorrido: l.incorrido, saldo: l.saldo, temBase: Boolean(v.base) } : null;
}

import { and, asc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import type { BancoDados, Executor } from "@/db";
import { cliente, empresa, etapaPadrao, fornecedor } from "@/db/schema";
import type { ParametrosOrcamento } from "@/dominio/orcamento";
import { cifrarJson, decifrarJson } from "@/lib/cripto";
import type { DadosBancarios, DadosCliente, DadosFornecedor } from "@/lib/validacao";
import { auditarEdicao, registrarAuditoria } from "./auditoria";
import { type Contexto, ErroNegocio, violacaoUnica } from "./contexto";
import { contarObrasPorCliente } from "./obras";

const termoBusca = (q: string) => `%${q.replace(/[%_\\]/g, "\\$&")}%`;

// ───────────── Clientes ─────────────

export async function listarClientes(db: Executor, empresaId: string, q?: string) {
  const c: (SQL | undefined)[] = [eq(cliente.empresaId, empresaId), isNull(cliente.excluidoEm)];
  if (q) c.push(or(ilike(cliente.nome, termoBusca(q)), ilike(cliente.documento, termoBusca(q.replace(/\D/g, "") || q)), ilike(cliente.email, termoBusca(q))));
  return db.select().from(cliente).where(and(...c)).orderBy(asc(cliente.nome));
}

export async function obterCliente(db: Executor, empresaId: string, id: string) {
  const [c] = await db.select().from(cliente).where(and(eq(cliente.id, id), eq(cliente.empresaId, empresaId), isNull(cliente.excluidoEm)));
  return c ?? null;
}

function erroDocumento(e: unknown, entidade: string): never {
  if (violacaoUnica(e, `${entidade}_documento_uq`)) throw new ErroNegocio("Já existe um cadastro com este CPF/CNPJ", "documento");
  if (violacaoUnica(e, `${entidade}_nome_uq`)) throw new ErroNegocio("Já existe um fornecedor com este nome conhecido", "nome");
  throw e;
}

export async function salvarCliente(banco: BancoDados, ctx: Contexto, d: DadosCliente, id?: string) {
  try {
    return await banco.transaction(async (tx) => {
      const base = { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "cliente", ip: ctx.ip };
      if (!id) {
        const [novo] = await tx.insert(cliente).values({ ...d, empresaId: ctx.empresaId }).returning();
        await registrarAuditoria(tx, { ...base, acao: "CRIAR", entidadeId: novo!.id, descricao: `Cliente ${d.nome} cadastrado`, depois: novo });
        return novo!;
      }
      const antes = await obterCliente(tx, ctx.empresaId, id);
      if (!antes) throw new ErroNegocio("Cliente não encontrado");
      const [depois] = await tx.update(cliente).set(d).where(eq(cliente.id, id)).returning();
      await auditarEdicao(tx, { ...base, entidadeId: id }, antes, depois!);
      return depois!;
    });
  } catch (e) { erroDocumento(e, "cliente"); }
}

export async function excluirCliente(banco: BancoDados, ctx: Contexto, id: string) {
  return banco.transaction(async (tx) => {
    const antes = await obterCliente(tx, ctx.empresaId, id);
    if (!antes) throw new ErroNegocio("Cliente não encontrado");
    if ((await contarObrasPorCliente(tx, id)) > 0) throw new ErroNegocio("Cliente possui obras vinculadas e não pode ser excluído. Inative-o ou exclua as obras antes.");
    await tx.update(cliente).set({ excluidoEm: new Date() }).where(eq(cliente.id, id));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EXCLUIR", entidade: "cliente", entidadeId: id, descricao: `Cliente ${antes.nome} excluído`, antes, ip: ctx.ip });
  });
}

// ───────────── Fornecedores ─────────────

export async function listarFornecedores(db: Executor, empresaId: string, f: { q?: string; especialidade?: string; ativos?: boolean } = {}) {
  const c: (SQL | undefined)[] = [eq(fornecedor.empresaId, empresaId), isNull(fornecedor.excluidoEm)];
  if (f.q) c.push(or(ilike(fornecedor.nome, termoBusca(f.q)), ilike(fornecedor.razaoSocial, termoBusca(f.q)), ilike(fornecedor.especialidade, termoBusca(f.q)), ilike(fornecedor.documento, termoBusca(f.q.replace(/\D/g, "") || f.q))));
  if (f.especialidade) c.push(eq(fornecedor.especialidade, f.especialidade));
  if (f.ativos) c.push(eq(fornecedor.ativo, true));
  return db.select({
    id: fornecedor.id, nome: fornecedor.nome, razaoSocial: fornecedor.razaoSocial, tipoPessoa: fornecedor.tipoPessoa,
    documento: fornecedor.documento, especialidade: fornecedor.especialidade, telefone: fornecedor.telefone,
    email: fornecedor.email, ativo: fornecedor.ativo, temDadosBancarios: sql<boolean>`${fornecedor.dadosBancariosCifrado} is not null`,
  }).from(fornecedor).where(and(...c)).orderBy(asc(fornecedor.nome));
}

export async function especialidadesFornecedores(db: Executor, empresaId: string) {
  const r = await db.selectDistinct({ e: fornecedor.especialidade }).from(fornecedor)
    .where(and(eq(fornecedor.empresaId, empresaId), isNull(fornecedor.excluidoEm), sql`${fornecedor.especialidade} is not null`))
    .orderBy(asc(fornecedor.especialidade));
  return r.map((x) => x.e!);
}

export async function obterFornecedor(db: Executor, empresaId: string, id: string) {
  const [f] = await db.select().from(fornecedor).where(and(eq(fornecedor.id, id), eq(fornecedor.empresaId, empresaId), isNull(fornecedor.excluidoEm)));
  return f ?? null;
}

/** Decifra os dados bancários e registra o acesso na auditoria (LGPD). */
export async function lerDadosBancarios(db: Executor, ctx: Contexto, id: string): Promise<DadosBancarios | null> {
  const f = await obterFornecedor(db, ctx.empresaId, id);
  if (!f?.dadosBancariosCifrado) return null;
  await registrarAuditoria(db, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "VER_DADOS_SENSIVEIS", entidade: "fornecedor", entidadeId: id, descricao: `Dados bancários de ${f.nome} visualizados`, ip: ctx.ip });
  return decifrarJson<DadosBancarios>(f.dadosBancariosCifrado);
}

/**
 * @param bancarios undefined = não alterar; objeto = substituir (só quem tem permissão de editar dados bancários).
 */
export async function salvarFornecedor(banco: BancoDados, ctx: Contexto, d: DadosFornecedor, bancarios: DadosBancarios | undefined, id?: string) {
  const extra = bancarios === undefined ? {} : { dadosBancariosCifrado: cifrarJson(bancarios as Record<string, unknown>) };
  try {
    return await banco.transaction(async (tx) => {
      const base = { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "fornecedor", ip: ctx.ip };
      if (!id) {
        const [novo] = await tx.insert(fornecedor).values({ ...d, ...extra, empresaId: ctx.empresaId }).returning();
        await registrarAuditoria(tx, { ...base, acao: "CRIAR", entidadeId: novo!.id, descricao: `Fornecedor ${d.nome} cadastrado`, depois: novo });
        return novo!;
      }
      const antes = await obterFornecedor(tx, ctx.empresaId, id);
      if (!antes) throw new ErroNegocio("Fornecedor não encontrado");
      const [depois] = await tx.update(fornecedor).set({ ...d, ...extra }).where(eq(fornecedor.id, id)).returning();
      await auditarEdicao(tx, { ...base, entidadeId: id }, antes, depois!);
      return depois!;
    });
  } catch (e) { erroDocumento(e, "fornecedor"); }
}

export async function excluirFornecedor(banco: BancoDados, ctx: Contexto, id: string) {
  return banco.transaction(async (tx) => {
    const antes = await obterFornecedor(tx, ctx.empresaId, id);
    if (!antes) throw new ErroNegocio("Fornecedor não encontrado");
    await tx.update(fornecedor).set({ excluidoEm: new Date() }).where(eq(fornecedor.id, id));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EXCLUIR", entidade: "fornecedor", entidadeId: id, descricao: `Fornecedor ${antes.nome} excluído`, antes, ip: ctx.ip });
  });
}

// ───────────── Empresa ─────────────

export async function obterEmpresa(db: Executor, empresaId: string) {
  const [e] = await db.select().from(empresa).where(eq(empresa.id, empresaId));
  return e ?? null;
}

export async function salvarEmpresa(banco: BancoDados, ctx: Contexto, d: Omit<typeof empresa.$inferInsert, "id" | "parametrosOrcamento">, parametros: ParametrosOrcamento) {
  return banco.transaction(async (tx) => {
    const antes = await obterEmpresa(tx, ctx.empresaId);
    if (!antes) throw new ErroNegocio("Empresa não encontrada");
    const [depois] = await tx.update(empresa).set({ ...d, parametrosOrcamento: parametros }).where(eq(empresa.id, ctx.empresaId)).returning();
    await auditarEdicao(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "empresa", entidadeId: ctx.empresaId, ip: ctx.ip }, antes, depois!);
    return depois!;
  });
}

// ───────────── Etapas padrão ─────────────

export async function listarEtapasPadrao(db: Executor, empresaId: string) {
  return db.select().from(etapaPadrao).where(eq(etapaPadrao.empresaId, empresaId)).orderBy(asc(etapaPadrao.ordem));
}

export async function salvarEtapaPadrao(banco: BancoDados, ctx: Contexto, d: { nome: string; tipo: "CONTRATO" | "ADITIVO" | "FATURAMENTO_DIRETO"; ordem: number; ativo: boolean }, id?: string) {
  return banco.transaction(async (tx) => {
    const base = { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "etapa_padrao", ip: ctx.ip };
    if (!id) {
      const [n] = await tx.insert(etapaPadrao).values({ ...d, empresaId: ctx.empresaId }).returning();
      await registrarAuditoria(tx, { ...base, acao: "CRIAR", entidadeId: n!.id, descricao: `Etapa padrão "${d.nome}" criada`, depois: n });
      return n!;
    }
    const [antes] = await tx.select().from(etapaPadrao).where(and(eq(etapaPadrao.id, id), eq(etapaPadrao.empresaId, ctx.empresaId)));
    if (!antes) throw new ErroNegocio("Etapa não encontrada");
    const [depois] = await tx.update(etapaPadrao).set(d).where(eq(etapaPadrao.id, id)).returning();
    await auditarEdicao(tx, { ...base, entidadeId: id }, antes, depois!);
    return depois!;
  });
}

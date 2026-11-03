import type { Executor } from "@/db";
import { auditoria } from "@/db/schema";
import { diferencas, limparParaAuditoria } from "@/dominio/auditoria";

type Acao = (typeof auditoria.$inferInsert)["acao"];

export interface EntradaAuditoria {
  empresaId: string | null;
  usuarioId: string | null;
  acao: Acao;
  entidade: string;
  entidadeId?: string | null;
  obraId?: string | null;
  descricao?: string | null;
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
  ip?: string | null;
}

export async function registrarAuditoria(db: Executor, e: EntradaAuditoria) {
  await db.insert(auditoria).values({
    empresaId: e.empresaId,
    usuarioId: e.usuarioId,
    acao: e.acao,
    entidade: e.entidade,
    entidadeId: e.entidadeId ?? null,
    obraId: e.obraId ?? null,
    descricao: e.descricao ?? null,
    antes: limparParaAuditoria(e.antes ?? null),
    depois: limparParaAuditoria(e.depois ?? null),
    ip: e.ip ?? null,
  });
}

/** Registra uma edição apenas se houve mudança real; grava só os campos alterados. */
export async function auditarEdicao(
  db: Executor,
  base: Omit<EntradaAuditoria, "acao" | "antes" | "depois">,
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
) {
  const d = diferencas(antes, depois);
  if (!d) return false;
  await db.insert(auditoria).values({
    empresaId: base.empresaId, usuarioId: base.usuarioId, acao: "EDITAR", entidade: base.entidade,
    entidadeId: base.entidadeId ?? null, obraId: base.obraId ?? null, descricao: base.descricao ?? null,
    antes: d.antes, depois: d.depois, ip: base.ip ?? null,
  });
  return true;
}

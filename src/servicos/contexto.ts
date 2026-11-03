/** Quem está executando a operação — usado para isolamento por empresa e auditoria. */
export interface Contexto {
  empresaId: string;
  usuarioId: string;
  ip?: string | null;
}

/** Erro de regra de negócio: mensagem exibida ao usuário, com campo opcional. */
export class ErroNegocio extends Error {
  constructor(mensagem: string, public campo?: string) {
    super(mensagem);
    this.name = "ErroNegocio";
  }
}

/** Violação de índice único do PostgreSQL. */
export function violacaoUnica(e: unknown, indice?: string): boolean {
  const err = e as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  const c = err?.code === "23505" ? err : err?.cause?.code === "23505" ? err.cause : null;
  return Boolean(c && (!indice || c.constraint_name === indice));
}

import { diferencaDias } from "./calendario";

export const SITUACOES_OBRA = {
  PROSPECCAO: "Prospecção",
  EM_ORCAMENTO: "Em orçamento",
  CONTRATADA: "Contratada",
  EM_ANDAMENTO: "Em andamento",
  PARALISADA: "Paralisada",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
} as const;

export type SituacaoObra = keyof typeof SITUACOES_OBRA;

/** Situações em que a obra está em execução e conta como "ativa" no dashboard. */
export const SITUACOES_ATIVAS: SituacaoObra[] = ["CONTRATADA", "EM_ANDAMENTO", "PARALISADA"];

export function obraAtiva(situacao: SituacaoObra): boolean {
  return SITUACOES_ATIVAS.includes(situacao);
}

/**
 * Próximo código no padrão da empresa "AAAA-NNNN" (ex.: 2026-0007), sequencial por ano.
 * Recebe os códigos existentes; ignora códigos fora do padrão.
 */
export function proximoCodigoObra(ano: number, existentes: string[]): string {
  const prefixo = `${ano}-`;
  const maior = existentes
    .filter((c) => c.startsWith(prefixo))
    .map((c) => Number.parseInt(c.slice(prefixo.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((m, n) => Math.max(m, n), 0);
  return `${prefixo}${String(maior + 1).padStart(4, "0")}`;
}

export const CODIGO_OBRA_REGEX = /^[0-9A-Za-z][0-9A-Za-z._-]{1,29}$/;

export type StatusPrazo = "NAO_INICIADA" | "NO_PRAZO" | "ATRASADA" | "CONCLUIDA_NO_PRAZO" | "CONCLUIDA_COM_ATRASO" | "NAO_APLICAVEL";

export interface PrazoObra {
  status: StatusPrazo;
  diasTotais: number;
  diasDecorridos: number;
  /** Fração do prazo contratual já decorrida (0–1, pode passar de 1 se atrasada). */
  prazoDecorrido: number;
  diasAtraso: number;
}

/**
 * Situação de prazo pelo calendário (não usa avanço físico — que chega na Fase 4).
 * Atrasada = obra ativa cujo término contratual já passou.
 */
export function calcularPrazo(
  o: { situacao: SituacaoObra; dataInicio: string; dataFimContratual: string; dataConclusao?: string | null },
  hoje: string,
): PrazoObra {
  const diasTotais = Math.max(diferencaDias(o.dataInicio, o.dataFimContratual), 1);
  const referencia = o.situacao === "CONCLUIDA" && o.dataConclusao ? o.dataConclusao : hoje;
  const diasDecorridos = Math.max(diferencaDias(o.dataInicio, referencia), 0);
  const diasAtraso = Math.max(diferencaDias(o.dataFimContratual, referencia), 0);
  const base = { diasTotais, diasDecorridos, prazoDecorrido: diasDecorridos / diasTotais, diasAtraso };

  if (o.situacao === "CANCELADA" || o.situacao === "PROSPECCAO" || o.situacao === "EM_ORCAMENTO") {
    return { ...base, status: "NAO_APLICAVEL", diasAtraso: 0 };
  }
  if (o.situacao === "CONCLUIDA") {
    return { ...base, status: diasAtraso > 0 ? "CONCLUIDA_COM_ATRASO" : "CONCLUIDA_NO_PRAZO" };
  }
  if (diferencaDias(o.dataInicio, hoje) < 0) return { ...base, status: "NAO_INICIADA", diasDecorridos: 0, prazoDecorrido: 0 };
  return { ...base, status: diasAtraso > 0 ? "ATRASADA" : "NO_PRAZO" };
}

/** Margem prevista sobre o contrato: (contrato − custo orçado) ÷ contrato. */
export function margemPrevista(valorContrato: number, custoOrcado: number): number | null {
  if (valorContrato <= 0 || custoOrcado <= 0) return null;
  return (valorContrato - custoOrcado) / valorContrato;
}

export type { TipoEtapa } from "./eap";
import { EAP_UNICA } from "./eap";

/** Etapas padrão (EAP única, decisão D11). */
export const ETAPAS_PADRAO = EAP_UNICA.map(({ nome, tipo }) => ({ nome, tipo }));

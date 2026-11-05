/**
 * Painel da obra (estilo dashboard) — regras puras.
 *
 *  A1  Situação de uma atividade prevista na semana N:
 *        concluída        → acumulado realizado ≥ 100%
 *        atrasada         → acumulado realizado até N < previsto acumulado até N − 1 (já devia estar mais adiantada)
 *        em andamento     → lançou avanço na semana N
 *        não iniciada     → nada lançado na semana N (e não está atrasada)
 *  A2  Lembretes visíveis na semana N: os da própria semana (feitos ou não) + os não feitos de semanas anteriores.
 */

export type SituacaoAtividade = "CONCLUIDA" | "ATRASADA" | "EM_ANDAMENTO" | "NAO_INICIADA";

export const SITUACAO_ATIVIDADE: Record<SituacaoAtividade, string> = {
  CONCLUIDA: "Concluída", ATRASADA: "Atrasada", EM_ANDAMENTO: "Em andamento", NAO_INICIADA: "Não iniciada",
};

const ate = (r: Record<number, number>, n: number) => Object.entries(r).filter(([k]) => Number(k) <= n).reduce((t, [, v]) => t + v, 0);

export function situacaoAtividade(s: { previsto: Record<number, number>; realizado: Record<number, number> }, semana: number): SituacaoAtividade {
  const real = ate(s.realizado, semana);
  if (real >= 1 - 1e-6) return "CONCLUIDA";
  if (real < ate(s.previsto, semana - 1) - 1e-6) return "ATRASADA";
  if ((s.realizado[semana] ?? 0) > 0) return "EM_ANDAMENTO";
  return "NAO_INICIADA";
}

export interface LembreteBase { semana: number; feitoEm: Date | string | null }

/** A2 */
export function lembretesDaSemana<T extends LembreteBase>(todos: T[], semana: number): T[] {
  return todos.filter((l) => l.semana === semana || (l.semana < semana && !l.feitoEm));
}

/** Acumula uma série (ex.: cobrança por medição → executado acumulado). */
export function acumular(v: number[]): number[] {
  let t = 0;
  return v.map((x) => (t += x));
}

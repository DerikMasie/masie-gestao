/**
 * Motor do físico da obra — reproduz as abas "Realizado-Físico" e "Previsto físico" da planilha de controle (AO/Palco).
 *
 *  F1  Peso do serviço   = duração ÷ duração total da obra          (coluna "% Relativo"; decisão do cliente: ponderar pela duração)
 *  F2  % concluído       = Σ % executado nas semanas                (coluna "% Concluído")
 *  F3  Avanço da semana  = Σ peso × % executado na semana           (linha "% concluido")
 *  F4  Acumulado         = soma das semanas até a semana             (linha "% acumulado"; só até a semana atual no gráfico)
 *  F5  % da etapa        = Σ duração × % concluído ÷ Σ duração da etapa
 *  F6  Valor da semana   = Σ valor cliente × % da semana             (abas ocultas "Previsto/Realizado medição")
 *
 * Correções em relação à planilha (ver diagnóstico, seção 1.3):
 *  - A linha da etapa na planilha usa a MÉDIA SIMPLES dos serviços × peso da etapa, enquanto o % concluído usa a média
 *    ponderada pela duração. Aqui as duas usam a ponderação pela duração. Os resultados são idênticos quando os serviços
 *    da etapa têm a mesma duração (caso do Palco, todos com 1 dia) e corretos quando não têm.
 *  - Não há limite de semanas (a planilha trunca as somas em 36–47 semanas) e a 1ª semana entra no acumulado previsto.
 */

import { diferencaDias, segundaDaSemana, somarDias } from "./calendario";
import { lerNumero } from "./formato";

export type Serie = "previsto" | "realizado";

export interface ServicoFisico {
  id: string;
  etapaId: string;
  duracao: number;
  valorCliente: number;
  /** semana (1..n) → fração do serviço (0.25 = 25%). */
  previsto: Record<number, number>;
  realizado: Record<number, number>;
}

export interface EtapaFisico { id: string }

const EPS = 1e-9;
const somaValores = (r: Record<number, number>) => Object.values(r).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

/** F1: peso de cada serviço no avanço da obra. Duração total zero → todos com peso 0 (planilha: célula vazia). */
export function pesos(servicos: Pick<ServicoFisico, "id" | "duracao">[]): Map<string, number> {
  const total = servicos.reduce((t, s) => t + Math.max(s.duracao, 0), 0);
  return new Map(servicos.map((s) => [s.id, total > 0 ? Math.max(s.duracao, 0) / total : 0]));
}

/** F2: % concluído (ou previsto total) do serviço. */
export function concluido(s: Pick<ServicoFisico, Serie>, serie: Serie): number {
  return somaValores(s[serie]);
}

/** Última semana com algum valor lançado (previsto ou realizado). */
export function ultimaSemanaComDados(servicos: Pick<ServicoFisico, Serie>[]): number {
  let m = 0;
  for (const s of servicos) for (const serie of ["previsto", "realizado"] as const) for (const k of Object.keys(s[serie])) if (s[serie][Number(k)]) m = Math.max(m, Number(k));
  return m;
}

export interface PontoSemana { semana: number; previsto: number; realizado: number }

export interface AvancoEtapa {
  etapaId: string;
  /** Peso da etapa na obra (Σ pesos dos serviços). */
  peso: number;
  /** F5: % da etapa concluída (0–1), relativo à própria etapa. */
  previsto: number;
  realizado: number;
  /** Contribuição da etapa ao avanço da obra em cada semana. */
  semanal: PontoSemana[];
}

export interface AvancoObra {
  duracaoTotal: number;
  semanas: number;
  /** F3 por semana (fração da obra). */
  semanal: PontoSemana[];
  /** F4 acumulado por semana. */
  acumulado: PontoSemana[];
  /** Totais da obra (0–1). */
  previsto: number;
  realizado: number;
  etapas: AvancoEtapa[];
  servicos: Map<string, { peso: number; previsto: number; realizado: number }>;
}

export function calcularAvanco(etapas: EtapaFisico[], servicos: ServicoFisico[], nSemanas?: number): AvancoObra {
  const n = Math.max(nSemanas ?? 0, ultimaSemanaComDados(servicos));
  const p = pesos(servicos);
  const vazio = () => Array.from({ length: n }, (_, i) => ({ semana: i + 1, previsto: 0, realizado: 0 }));
  const semanal = vazio();
  const porEtapa = new Map(etapas.map((e) => [e.id, { peso: 0, durPrev: 0, durReal: 0, dur: 0, semanal: vazio() }]));
  const porServico = new Map<string, { peso: number; previsto: number; realizado: number }>();

  for (const s of servicos) {
    const w = p.get(s.id) ?? 0;
    const e = porEtapa.get(s.etapaId);
    const prev = concluido(s, "previsto");
    const real = concluido(s, "realizado");
    porServico.set(s.id, { peso: w, previsto: prev, realizado: real });
    if (e) { e.peso += w; e.dur += Math.max(s.duracao, 0); e.durPrev += Math.max(s.duracao, 0) * prev; e.durReal += Math.max(s.duracao, 0) * real; }
    for (const serie of ["previsto", "realizado"] as const) {
      for (const [k, v] of Object.entries(s[serie])) {
        const i = Number(k) - 1;
        if (i < 0 || i >= n || !v) continue;
        semanal[i]![serie] += w * v;
        if (e) e.semanal[i]![serie] += w * v;
      }
    }
  }

  const acumulado: PontoSemana[] = [];
  let ap = 0, ar = 0;
  for (const s of semanal) { ap += s.previsto; ar += s.realizado; acumulado.push({ semana: s.semana, previsto: ap, realizado: ar }); }

  return {
    duracaoTotal: servicos.reduce((t, s) => t + Math.max(s.duracao, 0), 0),
    semanas: n, semanal, acumulado, previsto: ap, realizado: ar,
    etapas: etapas.map((et) => {
      const e = porEtapa.get(et.id)!;
      return { etapaId: et.id, peso: e.peso, previsto: e.dur > 0 ? e.durPrev / e.dur : 0, realizado: e.dur > 0 ? e.durReal / e.dur : 0, semanal: e.semanal };
    }),
    servicos: porServico,
  };
}

/** F6: valor (preço ao cliente) correspondente ao avanço de cada semana. */
export function valorPorSemana(servicos: ServicoFisico[], serie: Serie, nSemanas: number): number[] {
  const v = Array.from({ length: nSemanas }, () => 0);
  for (const s of servicos) for (const [k, pct] of Object.entries(s[serie])) {
    const i = Number(k) - 1;
    if (i >= 0 && i < nSemanas) v[i] = v[i]! + s.valorCliente * pct;
  }
  return v;
}

// ───────────── Calendário das semanas da obra ─────────────

/** Início (segunda) e fim (domingo) da semana N da obra. Semana 1 = semana que contém a data de início. */
export function datasDaSemana(inicioObra: string, semana: number): { inicio: string; fim: string } {
  const inicio = somarDias(segundaDaSemana(inicioObra), (semana - 1) * 7);
  return { inicio, fim: somarDias(inicio, 6) };
}

/** Número da semana da obra que contém a data (pode ser ≤ 0 se a data é anterior ao início). */
export function semanaDaData(inicioObra: string, data: string): number {
  return Math.floor(diferencaDias(segundaDaSemana(inicioObra), data) / 7) + 1;
}

/** Número da medição a que a semana pertence (período de 1 a 4 semanas). */
export function medicaoDaSemana(semana: number, semanasPorMedicao: number): number {
  return Math.ceil(semana / Math.min(Math.max(Math.trunc(semanasPorMedicao) || 2, 1), 4));
}

// ───────────── Entrada e validação ─────────────

/**
 * Lê um percentual digitado: "25", "25%", "12,5" → 0.25 / 0.125. Vazio → null; inválido → NaN.
 * Valores colados do Excel com "%" também são aceitos.
 */
export function lerPercentual(texto: string | null | undefined): number | null {
  const v = lerNumero(texto);
  if (v == null || Number.isNaN(v)) return v;
  return v / 100;
}

/** Texto de exibição de uma fração como percentual editável ("25", "12,5"). */
export function percentualTexto(v: number | null | undefined): string {
  if (v == null || v === 0) return "";
  return String(Number((v * 100).toFixed(4))).replace(".", ",");
}

export interface ProblemaSerie { servicoId: string; total: number; tipo: "ACIMA_100" | "ABAIXO_0" | "PREVISTO_INCOMPLETO" }

/**
 * Realizado: o total de cada serviço deve ficar entre 0% e 100% (erro).
 * Previsto: acima de 100% é erro; serviço com valor e soma diferente de 100% gera aviso.
 */
export function validarSerie(servicos: Pick<ServicoFisico, "id" | Serie>[], serie: Serie): { erros: ProblemaSerie[]; avisos: ProblemaSerie[] } {
  const erros: ProblemaSerie[] = [];
  const avisos: ProblemaSerie[] = [];
  for (const s of servicos) {
    const total = concluido(s, serie);
    if (total > 1 + EPS) erros.push({ servicoId: s.id, total, tipo: "ACIMA_100" });
    else if (total < -EPS) erros.push({ servicoId: s.id, total, tipo: "ABAIXO_0" });
    else if (serie === "previsto" && Object.keys(s.previsto).length > 0 && Math.abs(total - 1) > 1e-6) avisos.push({ servicoId: s.id, total, tipo: "PREVISTO_INCOMPLETO" });
  }
  return { erros, avisos };
}

/**
 * Distribui 100% (ou o percentual informado) igualmente entre as semanas [de, ate], com 4 casas decimais
 * de percentual; o resíduo de arredondamento vai para a última semana, para fechar exatamente.
 */
export function distribuir(de: number, ate: number, total = 1): Record<number, number> {
  if (!(de >= 1) || ate < de) throw new RangeError("Intervalo de semanas inválido");
  const n = ate - de + 1;
  const parte = Math.floor((total / n) * 1e6) / 1e6;
  const r: Record<number, number> = {};
  for (let s = de; s <= ate; s++) r[s] = parte;
  r[ate] = Number((total - parte * (n - 1)).toFixed(10));
  return r;
}

// ───────────── Planilha da obra (colunas de valores) ─────────────

/** Meta de fechamento por classe ABC (planilha AO: A = 80% da verba, B = 90%, C = 95%). */
export const META_ABC = { A: 0.8, B: 0.9, C: 0.95 } as const;

export function metaFechamento(verba: number, classe: "A" | "B" | "C" | null): number | null {
  return classe ? verba * META_ABC[classe] : null;
}

/** Taxa de uso (TDU) = acertada ÷ verba. */
export function taxaDeUso(acertada: number | null, verba: number): number | null {
  return acertada == null || verba <= 0 ? null : acertada / verba;
}

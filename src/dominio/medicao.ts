/**
 * Medições, cobrança, reprojeção e fornecedores — abas "Realizado/Previsto medição", "CálculoGerencial", "Gerencial"
 * e "Realizado/Previsto fornecedores" da planilha de controle.
 *
 *  M1  Medido na semana      = Σ valor cliente × % da semana, separado em contrato e aditivos (faturamento direto fica fora)
 *  M2  Período de medição    = 1 a 4 semanas (padrão 2 = quinzenal); a medição soma as semanas do período
 *  M3  Cobrança              = contrato × (1 − % entrada) + aditivos + descontos/reembolsos (a entrada não abate aditivos)
 *  M4  Medição fechada       = valores congelados; mudanças posteriores no realizado das semanas fechadas entram como
 *                              "ajuste de períodos anteriores" na primeira medição aberta (nada se perde nem é cobrado 2×)
 *  M5  Reprojeção            = cobrança prevista dos períodos não fechados × coeficiente; coeficiente = o que falta cobrar
 *                              (real) ÷ o que faltava pelo previsto (regra "Previsão ajustada a partir do avanço da obra")
 *  M6  Saldo do cliente      = contrato − entrada + aditivos/descontos/reembolsos − medições quitadas − material faturado
 *                              direto em nome do cliente (Relatório Situação)
 *  F1  Custo apropriado      = MO acertada × % executado (por fornecedor e semana); previsto = acertada × % previsto
 *  F2  A pagar ao fornecedor = acertado − pago (pagamentos informados à mão, como no Gerencial)
 *
 * Correções em relação à planilha: "mês" deixa de ser 4 semanas fixas (o período é escolhido por obra); o previsto de
 * contrato não zera (erro 6, #DIV/0!); a reprojeção de fornecedores usa o realizado de fato (erro 2); a cobrança
 * prevista não lê descontos do realizado (erro 12); todas as medições entram no saldo (erro 14).
 */

import { datasDaSemana } from "./fisico";
import { somarDias } from "./calendario";

export type TipoEtapaMedicao = "CONTRATO" | "ADITIVO" | "FATURAMENTO_DIRETO";
export type SerieMedicao = "previsto" | "realizado";

export interface ServicoMedicao {
  tipo: TipoEtapaMedicao;
  valorCliente: number;
  previsto: Record<number, number>;
  realizado: Record<number, number>;
}

export interface Periodo { numero: number; semanaInicio: number; semanaFim: number }
export interface ValoresPeriodo { contrato: number; aditivo: number }

const k = (semanas: number) => Math.min(Math.max(Math.trunc(semanas) || 2, 1), 4);
const EPS = 0.005;

/** M2: períodos de medição cobrindo as semanas 1..n. */
export function periodosMedicao(nSemanas: number, semanasPorMedicao: number): Periodo[] {
  const p: Periodo[] = [];
  const t = k(semanasPorMedicao);
  for (let s = 1, n = 1; s <= nSemanas; s += t, n++) p.push({ numero: n, semanaInicio: s, semanaFim: Math.min(s + t - 1, nSemanas) });
  return p;
}

/** Data de referência da medição: sexta-feira da última semana do período (dia de emissão do relatório). */
export function dataDaMedicao(inicioObra: string, p: Periodo): string {
  return somarDias(datasDaSemana(inicioObra, p.semanaFim).inicio, 4);
}

/** M1 por semana. */
export function medidoPorSemana(servicos: ServicoMedicao[], serie: SerieMedicao, nSemanas: number): ValoresPeriodo[] {
  const v = Array.from({ length: nSemanas }, () => ({ contrato: 0, aditivo: 0 }));
  for (const s of servicos) {
    if (s.tipo === "FATURAMENTO_DIRETO") continue;
    for (const [sem, pct] of Object.entries(s[serie])) {
      const i = Number(sem) - 1;
      if (i < 0 || i >= nSemanas || !pct) continue;
      if (s.tipo === "ADITIVO") v[i]!.aditivo += s.valorCliente * pct; else v[i]!.contrato += s.valorCliente * pct;
    }
  }
  return v;
}

export function somarPeriodos(semanal: ValoresPeriodo[], periodos: Periodo[]): ValoresPeriodo[] {
  return periodos.map((p) => {
    const r = { contrato: 0, aditivo: 0 };
    for (let s = p.semanaInicio; s <= p.semanaFim; s++) { r.contrato += semanal[s - 1]?.contrato ?? 0; r.aditivo += semanal[s - 1]?.aditivo ?? 0; }
    return r;
  });
}

/** M3 */
export function cobranca(v: ValoresPeriodo, percentualEntrada: number, ajustes = 0) {
  const entrada = v.contrato * percentualEntrada;
  return { entrada, valor: v.contrato - entrada + v.aditivo + ajustes };
}

export interface MedicaoFechada {
  numero: number;
  valorContrato: number;
  valorAditivos: number;
  valorAjustes: number;
  entradaAbatida: number;
  valorCobranca: number;
  situacao: "PAGA" | "NAO_PAGA";
  pagaEm: string | null;
}

export type EstadoMedicao = "FECHADA" | "A_FECHAR" | "EM_ANDAMENTO" | "FUTURA";

export interface LinhaMedicao extends Periodo {
  estado: EstadoMedicao;
  contrato: number;
  aditivo: number;
  entrada: number;
  /** Descontos (−) e reembolsos (+) lançados para esta medição. */
  ajustes: number;
  /** M4: diferença das medições já fechadas, levada para a primeira medição aberta. */
  ajusteAnteriores: number;
  cobranca: number;
  previstoContrato: number;
  previstoAditivo: number;
  previstoCobranca: number;
  /** M5: cobrança reprojetada (realizado nos fechados/passados, previsão ajustada nos demais). */
  reprojetado: number;
  /** Diferença entre o realizado atual e o valor congelado (só medições fechadas). */
  divergencia: number;
  situacao: "PAGA" | "NAO_PAGA";
  pagaEm: string | null;
}

export interface EntradaMedicoes {
  periodos: Periodo[];
  previsto: ValoresPeriodo[];
  realizado: ValoresPeriodo[];
  percentualEntrada: number;
  semanaAtual: number;
  fechadas: Map<number, MedicaoFechada>;
  /** numero da medição → soma assinada de descontos/reembolsos. */
  ajustes: Map<number, number>;
}

export function montarMedicoes(e: EntradaMedicoes): { linhas: LinhaMedicao[]; coeficiente: number | null } {
  const pe = e.percentualEntrada;
  // M4: diferença acumulada das fechadas.
  let pendente = 0;
  for (const p of e.periodos) {
    const f = e.fechadas.get(p.numero);
    if (!f) continue;
    const r = e.realizado[p.numero - 1]!;
    pendente += (r.contrato - f.valorContrato) * (1 - pe) + (r.aditivo - f.valorAditivos);
  }
  let primeiraAberta = true;
  const linhas: LinhaMedicao[] = e.periodos.map((p, i) => {
    const r = e.realizado[i]!;
    const pv = e.previsto[i]!;
    const f = e.fechadas.get(p.numero);
    const previstoCobranca = cobranca(pv, pe).valor;
    const ajustes = e.ajustes.get(p.numero) ?? 0;
    if (f) {
      const div = (r.contrato - f.valorContrato) * (1 - pe) + (r.aditivo - f.valorAditivos);
      return {
        ...p, estado: "FECHADA", contrato: f.valorContrato, aditivo: f.valorAditivos, entrada: f.entradaAbatida, ajustes: f.valorAjustes, ajusteAnteriores: 0,
        cobranca: f.valorCobranca, previstoContrato: pv.contrato, previstoAditivo: pv.aditivo, previstoCobranca, reprojetado: f.valorCobranca,
        divergencia: Math.abs(div) < EPS ? 0 : div, situacao: f.situacao, pagaEm: f.pagaEm,
      };
    }
    const anteriores = primeiraAberta ? pendente : 0;
    primeiraAberta = false;
    const c = cobranca(r, pe, ajustes + anteriores);
    const estado: EstadoMedicao = p.semanaFim < e.semanaAtual ? "A_FECHAR" : p.semanaInicio <= e.semanaAtual ? "EM_ANDAMENTO" : "FUTURA";
    return {
      ...p, estado, contrato: r.contrato, aditivo: r.aditivo, entrada: c.entrada, ajustes, ajusteAnteriores: Math.abs(anteriores) < EPS ? 0 : anteriores,
      cobranca: c.valor, previstoContrato: pv.contrato, previstoAditivo: pv.aditivo, previstoCobranca, reprojetado: c.valor, divergencia: 0,
      situacao: "NAO_PAGA", pagaEm: null,
    };
  });

  // M5: reprojeção. Passados (fechados ou com período encerrado) = realizado; demais = previsto × coeficiente.
  const passado = (l: LinhaMedicao) => l.estado === "FECHADA" || l.estado === "A_FECHAR";
  const totalPrevisto = linhas.reduce((t, l) => t + l.previstoCobranca, 0);
  const realizadoPassado = linhas.filter(passado).reduce((t, l) => t + l.cobranca - l.ajustes - l.ajusteAnteriores, 0);
  const futuros = linhas.filter((l) => !passado(l));
  const previstoFuturo = futuros.reduce((t, l) => t + l.previstoCobranca, 0);
  const falta = Math.max(totalPrevisto - realizadoPassado, 0);
  let coeficiente: number | null = null;
  if (previstoFuturo > EPS) {
    coeficiente = falta / previstoFuturo;
    for (const l of futuros) l.reprojetado = l.previstoCobranca * coeficiente + l.ajustes + l.ajusteAnteriores;
  } else if (futuros.length) {
    futuros[0]!.reprojetado = falta + futuros[0]!.ajustes + futuros[0]!.ajusteAnteriores;
    for (const l of futuros.slice(1)) l.reprojetado = l.ajustes + l.ajusteAnteriores;
  }
  return { linhas, coeficiente };
}

// ───────────── Contrato (Relatório Situação / Gerencial) ─────────────

export type TipoAjuste = "ADITIVO" | "DESCONTO" | "REEMBOLSO";
/** Sinal no saldo do cliente: aditivo e reembolso aumentam; desconto diminui. */
export const sinalAjuste = (t: TipoAjuste) => (t === "DESCONTO" ? -1 : 1);

export interface ResumoContrato {
  contrato: number;
  entrada: number;
  ajustes: number;
  quitadas: number;
  faturamentoDireto: number;
  saldo: number;
  /** Cobrança total executada (todas as medições, inclusive a aberta) — "Valor total executado de cobrança". */
  executado: number;
  /** Executado − quitado — "Valor a cobrar". */
  aCobrar: number;
}

export function resumoContrato(d: { contrato: number; percentualEntrada: number; ajustes: number; faturamentoDireto: number; medicoes: LinhaMedicao[] }): ResumoContrato {
  const entrada = d.contrato * d.percentualEntrada;
  const quitadas = d.medicoes.filter((m) => m.situacao === "PAGA").reduce((t, m) => t + m.cobranca, 0);
  const executado = d.medicoes.reduce((t, m) => t + m.cobranca, 0);
  return {
    contrato: d.contrato, entrada, ajustes: d.ajustes, quitadas, faturamentoDireto: d.faturamentoDireto,
    saldo: d.contrato - entrada + d.ajustes - quitadas - d.faturamentoDireto, executado, aCobrar: executado - quitadas,
  };
}

// ───────────── Fornecedores ─────────────

export interface ServicoFornecedor { fornecedorId: string | null; acertada: number | null; previsto: Record<number, number>; realizado: Record<number, number> }
export interface Pagamento { fornecedorId: string; semana: number; valor: number }

export interface LinhaFornecedor {
  fornecedorId: string | null;
  acertado: number;
  /** F1 acumulado até hoje. */
  apropriado: number;
  pago: number;
  /** F2: acertado − pago. */
  aPagar: number;
  /** Apropriado − pago: serviço executado e ainda não pago (positivo) ou pago adiantado (negativo). */
  executadoNaoPago: number;
  apropriadoSemana: number[];
  previstoSemana: number[];
  pagoSemana: number[];
}

export function resumoFornecedores(servicos: ServicoFornecedor[], pagamentos: Pagamento[], nSemanas: number): LinhaFornecedor[] {
  const m = new Map<string | null, LinhaFornecedor>();
  const linha = (id: string | null) => {
    let l = m.get(id);
    if (!l) {
      l = { fornecedorId: id, acertado: 0, apropriado: 0, pago: 0, aPagar: 0, executadoNaoPago: 0, apropriadoSemana: Array<number>(nSemanas).fill(0), previstoSemana: Array<number>(nSemanas).fill(0), pagoSemana: Array<number>(nSemanas).fill(0) };
      m.set(id, l);
    }
    return l;
  };
  for (const s of servicos) {
    if (s.acertada == null || s.acertada === 0) continue;
    const l = linha(s.fornecedorId);
    l.acertado += s.acertada;
    for (const [sem, pct] of Object.entries(s.realizado)) { const i = Number(sem) - 1; if (i >= 0 && i < nSemanas) { l.apropriadoSemana[i] = l.apropriadoSemana[i]! + s.acertada * pct; l.apropriado += s.acertada * pct; } }
    for (const [sem, pct] of Object.entries(s.previsto)) { const i = Number(sem) - 1; if (i >= 0 && i < nSemanas) l.previstoSemana[i] = l.previstoSemana[i]! + s.acertada * pct; }
  }
  for (const p of pagamentos) {
    const l = linha(p.fornecedorId);
    l.pago += p.valor;
    if (p.semana >= 1 && p.semana <= nSemanas) l.pagoSemana[p.semana - 1] = l.pagoSemana[p.semana - 1]! + p.valor;
  }
  for (const l of m.values()) { l.aPagar = l.acertado - l.pago; l.executadoNaoPago = l.apropriado - l.pago; }
  return [...m.values()];
}

/** M5 aplicada aos pagamentos: previsão ajustada de desembolso por período a partir do apropriado real. */
export function reprojetarDesembolso(previsto: number[], realizado: number[], periodos: Periodo[], semanaAtual: number) {
  const soma = (v: number[], p: Periodo) => { let t = 0; for (let s = p.semanaInicio; s <= p.semanaFim; s++) t += v[s - 1] ?? 0; return t; };
  const prev = periodos.map((p) => soma(previsto, p));
  const real = periodos.map((p) => soma(realizado, p));
  const passado = periodos.map((p) => p.semanaFim < semanaAtual);
  const total = prev.reduce((a, b) => a + b, 0);
  const feito = real.reduce((t, v, i) => t + (passado[i] ? v : 0), 0);
  const prevFuturo = prev.reduce((t, v, i) => t + (passado[i] ? 0 : v), 0);
  const coef = prevFuturo > EPS ? Math.max(total - feito, 0) / prevFuturo : null;
  return periodos.map((p, i) => ({ ...p, previsto: prev[i]!, realizado: real[i]!, reprojetado: passado[i] ? real[i]! : coef == null ? 0 : prev[i]! * coef }));
}

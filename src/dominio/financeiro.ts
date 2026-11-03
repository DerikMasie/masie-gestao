/**
 * Regras financeiras puras.
 *
 * Decisão D12: empréstimos (ex.: Pronampe), aplicações financeiras, transferências entre contas e ajustes
 * (saldo inicial) afetam apenas o CAIXA — nunca o resultado. Isso corrige a inflação de ~R$ 456 mil
 * encontrada na planilha Financeiro 2026 (ponto F-1).
 */
import { diferencaDias, somarDias } from "./calendario";
import { arredondar } from "./orcamento";

export type Natureza = "RECEITA" | "CUSTO" | "DESPESA" | "IMPOSTO" | "RETIRADA" | "FINANCIAMENTO" | "INVESTIMENTO" | "TRANSFERENCIA" | "AJUSTE";

export const NATUREZAS: Record<Natureza, { rotulo: string; noResultado: boolean }> = {
  RECEITA: { rotulo: "Receitas", noResultado: true },
  CUSTO: { rotulo: "Custos", noResultado: true },
  DESPESA: { rotulo: "Despesas", noResultado: true },
  IMPOSTO: { rotulo: "Impostos", noResultado: true },
  RETIRADA: { rotulo: "Retiradas de sócios", noResultado: false },
  FINANCIAMENTO: { rotulo: "Empréstimos e financiamentos", noResultado: false },
  INVESTIMENTO: { rotulo: "Aplicações financeiras", noResultado: false },
  TRANSFERENCIA: { rotulo: "Transferências entre contas", noResultado: false },
  AJUSTE: { rotulo: "Ajustes (saldo inicial)", noResultado: false },
};

export interface Movimento { natureza: Natureza; valor: number }

export interface Resultado {
  receitas: number;
  custos: number;
  despesas: number;
  impostos: number;
  /** Receitas − custos − despesas − impostos. */
  resultadoOperacional: number;
  /** Margem operacional sobre as receitas. */
  margem: number | null;
  retiradas: number;
  /** Resultado operacional − retiradas. */
  resultadoAposRetiradas: number;
  /** Movimentos que só afetam o caixa (D12). */
  foraDoResultado: { financiamento: number; investimento: number; transferencia: number; ajuste: number };
  variacaoCaixa: number;
}

/** Saídas são negativas no razão; aqui custos/despesas/impostos/retiradas são apresentados como valores positivos. */
export function resultado(movs: Movimento[]): Resultado {
  const s = (n: Natureza) => arredondar(movs.filter((m) => m.natureza === n).reduce((t, m) => t + m.valor, 0));
  const receitas = s("RECEITA");
  const custos = -s("CUSTO");
  const despesas = -s("DESPESA");
  const impostos = -s("IMPOSTO");
  const resultadoOperacional = arredondar(receitas - custos - despesas - impostos);
  const retiradas = -s("RETIRADA");
  return {
    receitas, custos, despesas, impostos, resultadoOperacional,
    margem: receitas > 0 ? resultadoOperacional / receitas : null,
    retiradas, resultadoAposRetiradas: arredondar(resultadoOperacional - retiradas),
    foraDoResultado: { financiamento: s("FINANCIAMENTO"), investimento: s("INVESTIMENTO"), transferencia: s("TRANSFERENCIA"), ajuste: s("AJUSTE") },
    variacaoCaixa: arredondar(movs.reduce((t, m) => t + m.valor, 0)),
  };
}

/**
 * Divide o valor em parcelas iguais em centavos; a diferença de arredondamento vai na última.
 * Vencimentos a cada `intervaloDias` a partir do primeiro.
 */
export function gerarParcelas(valorTotal: number, quantidade: number, primeiroVencimento: string, intervaloDias = 30) {
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 120) throw new RangeError("Quantidade de parcelas deve estar entre 1 e 120");
  if (valorTotal <= 0) throw new RangeError("Valor deve ser positivo");
  const centavos = Math.round(valorTotal * 100);
  const base = Math.floor(centavos / quantidade);
  return Array.from({ length: quantidade }, (_, i) => ({
    numero: i + 1,
    vencimento: somarDias(primeiroVencimento, i * intervaloDias),
    valor: (i === quantidade - 1 ? centavos - base * (quantidade - 1) : base) / 100,
  }));
}

export type SituacaoParcela = "PAGA" | "VENCIDA" | "VENCE_HOJE" | "PROGRAMADA" | "A_VENCER";

export function situacaoParcela(p: { vencimento: string; pagoEm: string | null; programado: boolean }, hoje: string): SituacaoParcela {
  if (p.pagoEm) return "PAGA";
  const d = diferencaDias(hoje, p.vencimento);
  if (d < 0) return "VENCIDA";
  if (p.programado) return "PROGRAMADA";
  if (d === 0) return "VENCE_HOJE";
  return "A_VENCER";
}

export interface LinhaVerba {
  orcado: number;
  /** Custo incorrido: NFs lançadas (devolução abate) + pagamentos sem NF. */
  incorrido: number;
  pago: number;
  aPagar: number;
}

export type AlertaVerba = "NAO_PLANEJADO" | "ESTOURADA" | "ATENCAO" | null;

/**
 * Situação da verba de uma etapa. "NAO_PLANEJADO" reproduz o aviso da planilha de NF
 * ("VALOR NÃO PLANEJADO"): gasto em etapa sem verba orçada.
 */
export function avaliarVerba(l: LinhaVerba, limiteAtencao = 0.9) {
  const saldo = arredondar(l.orcado - l.incorrido);
  const consumo = l.orcado > 0 ? l.incorrido / l.orcado : null;
  let alerta: AlertaVerba = null;
  if (l.orcado <= 0 && l.incorrido > 0) alerta = "NAO_PLANEJADO";
  else if (consumo != null && consumo > 1) alerta = "ESTOURADA";
  else if (consumo != null && consumo >= limiteAtencao) alerta = "ATENCAO";
  return { ...l, saldo, consumo, alerta };
}

/** Impacto de uma nova compra na verba (para avisar antes de gravar a NF). */
export function impactoCompra(l: LinhaVerba, valorCompra: number) {
  const depois = avaliarVerba({ ...l, incorrido: l.incorrido + valorCompra });
  return { ...depois, excedente: depois.saldo < 0 ? -depois.saldo : 0 };
}

/** Agrupa movimentos por mês (AAAA-MM) separando entradas e saídas. */
export function porMes<T extends { data: string; valor: number }>(movs: T[]) {
  const m = new Map<string, { entradas: number; saidas: number }>();
  for (const x of movs) {
    const k = x.data.slice(0, 7);
    const v = m.get(k) ?? { entradas: 0, saidas: 0 };
    if (x.valor >= 0) v.entradas += x.valor; else v.saidas -= x.valor;
    m.set(k, v);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, v]) => ({
    mes, entradas: arredondar(v.entradas), saidas: arredondar(v.saidas), liquido: arredondar(v.entradas - v.saidas),
  }));
}

/** Natureza do grupo a partir da coluna "Tipo" da aba Aux.Listas. */
export function naturezaDoTipoPlanilha(tipo: string): Natureza {
  const t = tipo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (t.startsWith("receita")) return "RECEITA";
  if (t.startsWith("custo")) return "CUSTO";
  if (t.startsWith("despesa")) return "DESPESA";
  if (t.startsWith("imposto")) return "IMPOSTO";
  if (t.startsWith("retirada")) return "RETIRADA";
  if (t.startsWith("transfer")) return "TRANSFERENCIA";
  return "DESPESA";
}

/**
 * Reclassificações aplicadas na importação (D12 e achados F-1/F-2):
 * subitens que estavam como receita/despesa mas são operações de caixa.
 */
export const RECLASSIFICACOES: { grupoOrigem: string; subitem: string; grupo: string; natureza: Natureza }[] = [
  { grupoOrigem: "Receitas financeiras", subitem: "Pronampe", grupo: "Empréstimos e financiamentos", natureza: "FINANCIAMENTO" },
  { grupoOrigem: "Outras receitas", subitem: "Empréstimos contratados", grupo: "Empréstimos e financiamentos", natureza: "FINANCIAMENTO" },
  { grupoOrigem: "Outras despesas", subitem: "Pagamentos empréstimos", grupo: "Empréstimos e financiamentos", natureza: "FINANCIAMENTO" },
  { grupoOrigem: "Receitas financeiras", subitem: "Aplicações financeiras", grupo: "Aplicações financeiras", natureza: "INVESTIMENTO" },
  { grupoOrigem: "Outras receitas", subitem: "Saldo inicial", grupo: "Ajustes", natureza: "AJUSTE" },
];

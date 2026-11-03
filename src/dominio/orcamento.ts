/**
 * Parâmetros e fórmulas de preço de venda.
 *
 * Diagnóstico (Fase 1, regras R3/R4): a planilha calcula `preço = custo × (1 + %lucro + %imposto)`.
 * Os dados da obra Palco confirmam: MO = verba × 1,60 (lucro 50% + imposto 10%) e
 * material = verba × 1,22 (lucro 12% + imposto 10%).
 *
 * Essa fórmula aplica o imposto sobre o CUSTO, mas o imposto incide sobre o PREÇO.
 * A fórmula "por dentro" corrige isso: `preço = custo × (1 + %lucro) ÷ (1 − %imposto)`.
 * As duas ficam disponíveis; o padrão é a correta e a planilha pode ser reproduzida por obra.
 */

export type FormulaPreco = "POR_DENTRO" | "PLANILHA_LEGADA";

export interface ParametrosOrcamento {
  /** Ex.: 0.5 = 50% sobre o custo de mão de obra. */
  lucroMaoDeObra: number;
  lucroMaterial: number;
  /** Ex.: 0.10 = 10% de impostos sobre o faturamento. */
  impostos: number;
  formula: FormulaPreco;
}

export const PARAMETROS_PADRAO: ParametrosOrcamento = {
  lucroMaoDeObra: 0.5,
  lucroMaterial: 0.12,
  impostos: 0.1,
  formula: "POR_DENTRO",
};

export function fatorPreco(lucro: number, impostos: number, formula: FormulaPreco): number {
  if (lucro < 0 || impostos < 0 || impostos >= 1) throw new RangeError("Parâmetros de preço inválidos");
  return formula === "PLANILHA_LEGADA" ? 1 + lucro + impostos : (1 + lucro) / (1 - impostos);
}

export function precoVenda(custo: number, lucro: number, impostos: number, formula: FormulaPreco): number {
  return arredondar(custo * fatorPreco(lucro, impostos, formula));
}

/** Margem líquida após impostos sobre o preço: (preço − impostos − custo) ÷ preço. */
export function margemLiquida(custo: number, preco: number, impostos: number): number {
  if (preco <= 0) return 0;
  return (preco * (1 - impostos) - custo) / preco;
}

export function arredondar(valor: number, casas = 2): number {
  const f = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * f) / f;
}

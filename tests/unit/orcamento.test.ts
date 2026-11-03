import { describe, expect, it } from "vitest";
import { fatorPreco, margemLiquida, precoVenda } from "@/dominio/orcamento";

describe("fórmulas de preço", () => {
  it("reproduz a planilha legada: MO ×1,60 e material ×1,22 (obra Palco)", () => {
    expect(fatorPreco(0.5, 0.1, "PLANILHA_LEGADA")).toBeCloseTo(1.6, 10);
    expect(fatorPreco(0.12, 0.1, "PLANILHA_LEGADA")).toBeCloseTo(1.22, 10);
    // Material de hidráulica da obra Palco: verba 650 → cliente 793,08 na planilha (×1,22 = 793,00; os R$ 0,08 vêm de arredondamento na origem)
    expect(precoVenda(650, 0.12, 0.1, "PLANILHA_LEGADA")).toBe(793);
  });

  it("fórmula por dentro garante o imposto sobre o preço", () => {
    const preco = precoVenda(1000, 0.5, 0.1, "POR_DENTRO");
    expect(preco).toBeCloseTo(1666.67, 2);
    // após pagar 10% do preço em impostos, sobra custo × (1 + lucro)
    expect(preco * 0.9).toBeCloseTo(1500, 1);
  });

  it("evidencia a perda de margem da fórmula legada (erro 15 do diagnóstico)", () => {
    const legado = precoVenda(1000, 0.5, 0.1, "PLANILHA_LEGADA"); // 1600
    expect(margemLiquida(1000, legado, 0.1)).toBeCloseTo(0.275, 3); // esperado 33,3%
    const correto = precoVenda(1000, 0.5, 0.1, "POR_DENTRO");
    expect(margemLiquida(1000, correto, 0.1)).toBeCloseTo(0.3, 3);
  });

  it("rejeita parâmetros inválidos", () => {
    expect(() => fatorPreco(0.2, 1, "POR_DENTRO")).toThrow(RangeError);
    expect(() => fatorPreco(-0.1, 0.1, "POR_DENTRO")).toThrow(RangeError);
  });
});

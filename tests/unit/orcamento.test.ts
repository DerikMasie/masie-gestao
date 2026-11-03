import { describe, expect, it } from "vitest";
import { calcularItem, codigosItens, curvaABC, normalizarParametros, PARAMETROS_PADRAO, totalizar, validarParametros, type ParametrosOrcamento } from "@/dominio/orcamento";

const planilha: ParametrosOrcamento = { ...PARAMETROS_PADRAO, impostos: 0.1, formaImposto: "POR_FORA", arredondamento: "REAL_ACIMA", minimoMaoDeObra: 100 };
const item = (q: number, mo: number, mat: number, quebra = 1) => ({ quantidade: q, quebra, custoUnitarioMaoDeObra: mo, custoUnitarioMaterial: mat });

describe("padrões definidos pela Masie", () => {
  it("BDI MO 30%, material 10%, imposto 10,5% por dentro, arredondamento a centavos", () => {
    expect(PARAMETROS_PADRAO).toMatchObject({ bdiMaoDeObra: 0.3, bdiMaterial: 0.1, impostos: 0.105, formaImposto: "POR_DENTRO", arredondamento: "CENTAVOS" });
  });
  it("parâmetros antigos viram os padrões; campos faltantes são completados", () => {
    expect(normalizarParametros({ lucroMaoDeObra: 0.5, formula: "PLANILHA_LEGADA" })).toEqual(PARAMETROS_PADRAO);
    expect(normalizarParametros({ bdiMaoDeObra: 0.4 })).toMatchObject({ bdiMaoDeObra: 0.4, bdiMaterial: 0.1 });
  });
  it("valida limites", () => {
    expect(validarParametros({ ...PARAMETROS_PADRAO, impostos: 0.7 })).toMatch(/Alíquota/);
    expect(validarParametros(PARAMETROS_PADRAO)).toBeNull();
  });
});

describe("modo planilha (fiel ao Orçamento Padrão)", () => {
  it("Emissão de ART: material 264,71 → custo 265 → venda 292 (ARRED.CIMA)", () => {
    const r = calcularItem(item(1, 0, 233.94 + 30.77), planilha);
    expect(r).toMatchObject({ custoMaterial: 265, vendaMaterial: 292, custoMaoDeObra: 0 });
  });
  it("valor mínimo de MO substitui o cálculo sem adicionais (ponto O-2)", () => {
    const p = { ...planilha, adicionalHorario: 0.1 };
    expect(calcularItem(item(2, 20, 0), p)).toMatchObject({ custoMaoDeObra: 100, minimoAplicado: true, vendaMaoDeObra: 130 });
    expect(calcularItem(item(10, 20, 0), p)).toMatchObject({ custoMaoDeObra: 220, minimoAplicado: false });
  });
  it("quantidade zero não aplica mínimo; quebra multiplica o material", () => {
    expect(calcularItem(item(0, 20, 5), planilha)).toMatchObject({ custo: 0, minimoAplicado: false });
    expect(calcularItem(item(10, 0, 8, 1.1), planilha).custoMaterial).toBe(88);
  });
  it("imposto por fora com arredondamento para cima (aba PROPOSTA)", () => {
    const t = totalizar([calcularItem(item(1, 1000, 0), planilha)], planilha); // 1000 → 1300
    expect(t).toMatchObject({ venda: 1300, imposto: 130, total: 1430, custo: 1000, lucro: 300 });
  });
});

describe("modo sistema (padrão)", () => {
  it("imposto por dentro: o imposto é exatamente a alíquota sobre o total", () => {
    const t = totalizar([calcularItem(item(10, 100, 50), PARAMETROS_PADRAO)], PARAMETROS_PADRAO);
    // custo MO 1000 → 1300; material 500 → 550; venda 1850
    expect(t.venda).toBe(1850);
    expect(t.total).toBeCloseTo(1850 / 0.895, 2);
    expect(t.imposto / t.total).toBeCloseTo(0.105, 4);
    expect(t.lucro).toBe(350);
  });
  it("adicionais incidem também sobre o mínimo (correção do O-2)", () => {
    const p = { ...PARAMETROS_PADRAO, minimoMaoDeObra: 100, adicionalLocal: 0.2 };
    expect(calcularItem(item(1, 30, 0), p).custoMaoDeObra).toBe(120);
  });
  it("BDI do item sobrepõe o do orçamento", () => {
    const r = calcularItem({ ...item(1, 1000, 1000), bdiMaoDeObra: 0.5, bdiMaterial: 0 }, PARAMETROS_PADRAO);
    expect(r).toMatchObject({ vendaMaoDeObra: 1500, vendaMaterial: 1000 });
  });
  it("arredonda a centavos sem acumular erro", () => {
    const r = calcularItem(item(3, 33.333, 0.1), PARAMETROS_PADRAO);
    expect(r.custoMaoDeObra).toBe(100);
    expect(r.custoMaterial).toBe(0.3);
  });
});

describe("curva ABC", () => {
  it("maior item é sempre A; classes por acumulado 80/95", () => {
    const abc = curvaABC([{ v: 50 }, { v: 30 }, { v: 12 }, { v: 5 }, { v: 3 }, { v: 0 }], (x) => x.v);
    expect(abc.map((x) => x.classe)).toEqual(["A", "A", "B", "C", "C"]);
    expect(abc.at(-1)!.acumulado).toBeCloseTo(1);
    expect(curvaABC([{ v: 100 }], (x) => x.v)[0]!.classe).toBe("A");
  });
});

describe("códigos dos itens", () => {
  it("etapa.item e etapa.grupo.item", () => {
    const c = codigosItens([
      { etapaOrdem: 1, grupo: "Licenciamento" }, { etapaOrdem: 1, grupo: "Licenciamento" }, { etapaOrdem: 1, grupo: "Projetos" },
      { etapaOrdem: 2, grupo: null }, { etapaOrdem: 2, grupo: null },
    ]).map((x) => x.codigo);
    expect(c).toEqual(["1.1.1", "1.1.2", "1.2.1", "2.1", "2.2"]);
  });
});

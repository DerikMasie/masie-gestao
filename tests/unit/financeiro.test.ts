import { describe, expect, it } from "vitest";
import { avaliarVerba, gerarParcelas, impactoCompra, naturezaDoTipoPlanilha, porMes, resultado, situacaoParcela } from "@/dominio/financeiro";
import { chaveEtapa, EAP_UNICA, etapaDoSubitem } from "@/dominio/eap";

describe("resultado (D12)", () => {
  it("empréstimo, aplicação, transferência e saldo inicial não entram no resultado", () => {
    const r = resultado([
      { natureza: "RECEITA", valor: 100_000 }, { natureza: "CUSTO", valor: -60_000 }, { natureza: "DESPESA", valor: -10_000 }, { natureza: "IMPOSTO", valor: -5_000 },
      { natureza: "FINANCIAMENTO", valor: 391_571 }, { natureza: "INVESTIMENTO", valor: 20_000 }, { natureza: "TRANSFERENCIA", valor: 5_000 }, { natureza: "TRANSFERENCIA", valor: -5_000 },
      { natureza: "AJUSTE", valor: 1_000 }, { natureza: "RETIRADA", valor: -8_000 },
    ]);
    expect(r).toMatchObject({ receitas: 100_000, custos: 60_000, despesas: 10_000, impostos: 5_000, resultadoOperacional: 25_000, retiradas: 8_000, resultadoAposRetiradas: 17_000 });
    expect(r.margem).toBeCloseTo(0.25);
    expect(r.foraDoResultado).toEqual({ financiamento: 391_571, investimento: 20_000, transferencia: 0, ajuste: 1_000 });
    expect(r.variacaoCaixa).toBe(429_571);
  });
  it("natureza a partir da coluna Tipo da planilha", () => {
    expect(["Custos", "Despesas", "Impostos", "Receitas", "Retiradas sócios", "Transferências internas"].map(naturezaDoTipoPlanilha))
      .toEqual(["CUSTO", "DESPESA", "IMPOSTO", "RECEITA", "RETIRADA", "TRANSFERENCIA"]);
  });
});

describe("parcelas", () => {
  it("divide em centavos e joga a diferença na última", () => {
    const p = gerarParcelas(1000, 3, "2026-11-10");
    expect(p.map((x) => x.valor)).toEqual([333.33, 333.33, 333.34]);
    expect(p.map((x) => x.vencimento)).toEqual(["2026-11-10", "2026-12-10", "2027-01-09"]);
    expect(gerarParcelas(99.99, 1, "2026-01-01")[0]!.valor).toBe(99.99);
    expect(() => gerarParcelas(100, 0, "2026-01-01")).toThrow();
  });
  it("situação pelo vencimento", () => {
    const hoje = "2026-11-03";
    expect(situacaoParcela({ vencimento: "2026-11-01", pagoEm: null, programado: true }, hoje)).toBe("VENCIDA");
    expect(situacaoParcela({ vencimento: "2026-11-03", pagoEm: null, programado: false }, hoje)).toBe("VENCE_HOJE");
    expect(situacaoParcela({ vencimento: "2026-11-09", pagoEm: null, programado: true }, hoje)).toBe("PROGRAMADA");
    expect(situacaoParcela({ vencimento: "2026-11-09", pagoEm: null, programado: false }, hoje)).toBe("A_VENCER");
    expect(situacaoParcela({ vencimento: "2026-10-01", pagoEm: "2026-10-01", programado: false }, hoje)).toBe("PAGA");
  });
});

describe("verba por etapa", () => {
  it("saldo, consumo e alertas (inclui 'valor não planejado' da planilha de NF)", () => {
    expect(avaliarVerba({ orcado: 1000, incorrido: 500, pago: 300, aPagar: 200 })).toMatchObject({ saldo: 500, consumo: 0.5, alerta: null });
    expect(avaliarVerba({ orcado: 1000, incorrido: 950, pago: 0, aPagar: 0 }).alerta).toBe("ATENCAO");
    expect(avaliarVerba({ orcado: 1000, incorrido: 1200, pago: 0, aPagar: 0 })).toMatchObject({ saldo: -200, alerta: "ESTOURADA" });
    expect(avaliarVerba({ orcado: 0, incorrido: 10, pago: 0, aPagar: 0 }).alerta).toBe("NAO_PLANEJADO");
    expect(impactoCompra({ orcado: 1000, incorrido: 900, pago: 0, aPagar: 0 }, 300)).toMatchObject({ excedente: 200, alerta: "ESTOURADA" });
  });
  it("agrupa por mês", () => {
    expect(porMes([{ data: "2026-01-05", valor: 100 }, { data: "2026-01-20", valor: -30 }, { data: "2026-02-01", valor: -10 }]))
      .toEqual([{ mes: "2026-01", entradas: 100, saidas: 30, liquido: 70 }, { mes: "2026-02", entradas: 0, saidas: 10, liquido: -10 }]);
  });
});

describe("EAP única (D11)", () => {
  it("19 etapas com os nomes do Orçamento Padrão", () => {
    expect(EAP_UNICA).toHaveLength(19);
    expect(EAP_UNICA.slice(0, 4).map((e) => e.nome)).toEqual(["Serviços preliminares", "Proteções", "Remoções e demolições", "Reforço estrutural"]);
  });
  it("nomes antigos e da planilha caem na mesma etapa", () => {
    expect(chaveEtapa("Serviços iniciais")).toBe(chaveEtapa("SERVIÇOS PRELIMINARES"));
    expect(chaveEtapa("Estrutura")).toBe(chaveEtapa("REFORÇO ESTRUTURA"));
    expect(chaveEtapa("Instalações elétricas")).toBe(chaveEtapa("INSTALAÇÕES ELÉTRICAS/LÓGICAS"));
    expect(chaveEtapa("INSTALAÇÃO DE AR CONDICIONADO")).toBe(chaveEtapa("Instalação de ar-condicionado"));
  });
  it("de-para dos subitens de material e MO do Financeiro/NF", () => {
    expect(etapaDoSubitem("Elétrico")).toBe("Instalações elétricas/lógicas");
    expect(etapaDoSubitem("MO Terceirizada - Elétrica")).toBe("Instalações elétricas/lógicas");
    expect(etapaDoSubitem("Hidráulico/gás")).toBe("Instalações hidráulicas/gás");
    expect(etapaDoSubitem("Estrutural")).toBe("Reforço estrutural");
    expect(etapaDoSubitem("Aluguel")).toBeNull();
  });
});

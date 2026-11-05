import { describe, expect, it } from "vitest";
import palco from "../fixtures/palco-fisico.json";
import {
  cobranca, dataDaMedicao, medidoPorSemana, montarMedicoes, periodosMedicao, reprojetarDesembolso, resumoContrato, resumoFornecedores,
  somarPeriodos, type MedicaoFechada, type ServicoMedicao,
} from "@/dominio/medicao";

const num = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [Number(k), v as number]));
const servicos: ServicoMedicao[] = palco.servicos.map((s) => ({
  tipo: s.etapa === 17 ? "ADITIVO" : "CONTRATO", valorCliente: s.cliente, previsto: num(s.previsto), realizado: num(s.realizado),
}));

describe("medições — confere com o Gerencial do Palco (valores do Excel)", () => {
  const periodos = periodosMedicao(44, 2);
  const realizado = somarPeriodos(medidoPorSemana(servicos, "realizado", 44), periodos);
  const previsto = somarPeriodos(medidoPorSemana(servicos, "previsto", 44), periodos);
  const { linhas } = montarMedicoes({ periodos, previsto, realizado, percentualEntrada: 0.2, semanaAtual: 5, fechadas: new Map(), ajustes: new Map() });

  it("cobrança quinzenal = contrato × (1 − 20%) + aditivos", () => {
    expect(linhas[0]!.cobranca).toBeCloseTo(46987.7705, 4); // Gerencial!G7
    expect(linhas[1]!.cobranca).toBeCloseTo(30209.8761, 4); // Gerencial!I7
  });

  it("valor total executado de cobrança e saldo total a pagar", () => {
    const r = resumoContrato({ contrato: 128861.68, percentualEntrada: 0.2, ajustes: 0, faturamentoDireto: 0, medicoes: linhas });
    expect(r.executado).toBeCloseTo(77197.6466, 4); // Gerencial!D19
    expect(r.saldo).toBeCloseTo(103089.344, 6); // Gerencial!D22 (nada pago)
    expect(r.aCobrar).toBeCloseTo(r.executado, 6);
  });

  it("previsto total = valor cliente × (1 − entrada) (sem o #DIV/0! da planilha)", () => {
    const total = linhas.reduce((t, l) => t + l.previstoCobranca, 0);
    expect(total).toBeCloseTo(palco.esperado.totalCliente * 0.8, 4);
  });

  it("estados: passadas a fechar, em andamento e futuras", () => {
    expect(linhas.slice(0, 4).map((l) => l.estado)).toEqual(["A_FECHAR", "A_FECHAR", "EM_ANDAMENTO", "FUTURA"]);
  });
});

describe("medições — regras", () => {
  const sv: ServicoMedicao[] = [
    { tipo: "CONTRATO", valorCliente: 1000, previsto: { 1: 0.5, 2: 0.5 }, realizado: { 1: 0.4 } },
    { tipo: "ADITIVO", valorCliente: 200, previsto: { 2: 1 }, realizado: { 1: 1 } },
    { tipo: "FATURAMENTO_DIRETO", valorCliente: 999, previsto: { 1: 1 }, realizado: { 1: 1 } },
  ];

  it("entrada não abate aditivos; faturamento direto fica fora da medição", () => {
    const [s1] = medidoPorSemana(sv, "realizado", 2);
    expect(s1).toEqual({ contrato: 400, aditivo: 200 });
    expect(cobranca(s1!, 0.2)).toEqual({ entrada: 80, valor: 520 });
    expect(cobranca(s1!, 0.2, -50).valor).toBe(470);
  });

  it("períodos de 1 a 4 semanas e data de referência na sexta-feira", () => {
    expect(periodosMedicao(5, 2).map((p) => [p.semanaInicio, p.semanaFim])).toEqual([[1, 2], [3, 4], [5, 5]]);
    expect(periodosMedicao(9, 4)).toHaveLength(3);
    expect(periodosMedicao(3, 9)).toHaveLength(1); // limitado a 4 semanas
    expect(dataDaMedicao("2026-10-09", { numero: 1, semanaInicio: 1, semanaFim: 2 })).toBe("2026-10-16");
  });

  it("medição fechada congela valores e a diferença posterior vai para a primeira aberta", () => {
    const periodos = periodosMedicao(4, 1);
    const fechada: MedicaoFechada = { numero: 1, valorContrato: 400, valorAditivos: 200, valorAjustes: 0, entradaAbatida: 80, valorCobranca: 520, situacao: "PAGA", pagaEm: "2026-10-20" };
    // Depois de fechar, o realizado da semana 1 foi corrigido de 40% para 50% (+100 de contrato).
    const corrigido: ServicoMedicao[] = [{ ...sv[0]!, realizado: { 1: 0.5, 2: 0.2 } }, sv[1]!];
    const real = somarPeriodos(medidoPorSemana(corrigido, "realizado", 4), periodos);
    const prev = somarPeriodos(medidoPorSemana(corrigido, "previsto", 4), periodos);
    const { linhas } = montarMedicoes({ periodos, previsto: prev, realizado: real, percentualEntrada: 0.2, semanaAtual: 3, fechadas: new Map([[1, fechada]]), ajustes: new Map([[2, -30]]) });
    expect(linhas[0]!.cobranca).toBe(520);
    expect(linhas[0]!.divergencia).toBeCloseTo(80, 9); // 100 × (1 − 20%)
    expect(linhas[1]!.ajusteAnteriores).toBeCloseTo(80, 9);
    expect(linhas[1]!.cobranca).toBeCloseTo(200 * 0.8 - 30 + 80, 9);
    expect(linhas[2]!.ajusteAnteriores).toBe(0);
    // Soma das cobranças = tudo o que foi executado − entrada + ajustes (nada perdido nem duplicado).
    const total = linhas.reduce((t, l) => t + l.cobranca, 0);
    expect(total).toBeCloseTo(700 * 0.8 + 200 - 30, 9);
    const r = resumoContrato({ contrato: 1000, percentualEntrada: 0.2, ajustes: 200 - 30, faturamentoDireto: 0, medicoes: linhas });
    expect(r.quitadas).toBe(520);
    expect(r.saldo).toBeCloseTo(1000 - 200 + 170 - 520, 9);
  });

  it("reprojeção: o que falta cobrar é redistribuído pelo previsto restante", () => {
    const periodos = periodosMedicao(4, 1);
    const prev = [{ contrato: 250, aditivo: 0 }, { contrato: 250, aditivo: 0 }, { contrato: 250, aditivo: 0 }, { contrato: 250, aditivo: 0 }];
    const real = [{ contrato: 100, aditivo: 0 }, { contrato: 100, aditivo: 0 }, { contrato: 0, aditivo: 0 }, { contrato: 0, aditivo: 0 }];
    const { linhas, coeficiente } = montarMedicoes({ periodos, previsto: prev, realizado: real, percentualEntrada: 0, semanaAtual: 3, fechadas: new Map(), ajustes: new Map() });
    // Faltam 800 a cobrar contra 500 previstos nos períodos restantes → coeficiente 1,6.
    expect(coeficiente).toBeCloseTo(1.6, 12);
    expect(linhas.map((l) => l.reprojetado)).toEqual([100, 100, 400, 400]);
  });

  it("fornecedores: apropriado = acertada × %, a pagar = acertado − pago", () => {
    const f = resumoFornecedores([
      { fornecedorId: "ev", acertada: 1000, previsto: { 1: 0.5, 2: 0.5 }, realizado: { 1: 0.3 } },
      { fornecedorId: "ev", acertada: 500, previsto: { 2: 1 }, realizado: { 2: 1 } },
      { fornecedorId: null, acertada: null, previsto: {}, realizado: { 1: 1 } },
    ], [{ fornecedorId: "ev", semana: 2, valor: 600 }], 3);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ acertado: 1500, apropriado: 800, pago: 600, aPagar: 900, executadoNaoPago: 200 });
    expect(f[0]!.apropriadoSemana).toEqual([300, 500, 0]);
    const d = reprojetarDesembolso(f[0]!.previstoSemana, f[0]!.apropriadoSemana, periodosMedicao(3, 1), 2);
    expect(d[0]!.reprojetado).toBe(300); // passado = realizado
    expect(d[1]!.reprojetado).toBeCloseTo(1200, 9); // falta 1200 de 1500, todo o previsto restante está na semana 2
  });
});

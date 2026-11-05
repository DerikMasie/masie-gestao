import { describe, expect, it } from "vitest";
import palco from "../fixtures/palco-fisico.json";
import {
  calcularAvanco, concluido, datasDaSemana, distribuir, lerPercentual, medicaoDaSemana, metaFechamento, percentualTexto, pesos,
  semanaDaData, taxaDeUso, validarSerie, valorPorSemana, type ServicoFisico,
} from "@/dominio/fisico";

const etapas = palco.etapas.map((e) => ({ id: String(e.ordem) }));
const servicos: ServicoFisico[] = palco.servicos.map((s, i) => ({
  id: `s${i}`, etapaId: String(s.etapa), duracao: s.duracao, valorCliente: s.cliente,
  previsto: Object.fromEntries(Object.entries(s.previsto).map(([k, v]) => [Number(k), v as number])),
  realizado: Object.fromEntries(Object.entries(s.realizado).map(([k, v]) => [Number(k), v as number])),
}));

describe("físico — confere com a planilha do Palco (valores calculados pelo Excel)", () => {
  const a = calcularAvanco(etapas, servicos, 44);

  it("duração total e pesos (% Relativo)", () => {
    expect(a.duracaoTotal).toBe(palco.esperado.duracaoTotal);
    const soma = [...pesos(servicos).values()].reduce((x, y) => x + y, 0);
    expect(soma).toBeCloseTo(1, 12);
  });

  it("avanço realizado por semana e acumulado (linhas '% concluido' e '% acumulado')", () => {
    palco.esperado.realizadoSemanal.forEach((v, i) => expect(a.semanal[i]!.realizado).toBeCloseTo(v, 10));
    expect(a.acumulado[3]!.realizado).toBeCloseTo(palco.esperado.realizadoAcumulado, 10);
    expect(a.realizado).toBeCloseTo(0.645, 10);
  });

  it("avanço previsto por semana chega a 100% na semana 10", () => {
    palco.esperado.previstoSemanal.forEach((v, i) => expect(a.semanal[i]!.previsto).toBeCloseTo(v, 10));
    expect(a.acumulado[9]!.previsto).toBeCloseTo(1, 10);
    expect(a.previsto).toBeCloseTo(1, 10);
  });

  it("contribuição semanal de cada etapa (linhas de etapa da planilha)", () => {
    for (const e of palco.etapas) {
      const calc = a.etapas.find((x) => x.etapaId === String(e.ordem))!;
      e.semanal.forEach((v, i) => expect(calc.semanal[i]!.realizado).toBeCloseTo(v, 10));
    }
  });

  it("% concluído da etapa ponderado pela duração", () => {
    const eletrica = a.etapas.find((x) => x.etapaId === "9")!;
    const srv = servicos.filter((s) => s.etapaId === "9");
    const esperado = srv.reduce((t, s) => t + s.duracao * concluido(s, "realizado"), 0) / srv.reduce((t, s) => t + s.duracao, 0);
    expect(eletrica.realizado).toBeCloseTo(esperado, 12);
    expect(a.etapas.find((x) => x.etapaId === "4")!.realizado).toBe(0); // etapa sem serviços
  });

  it("totais de valores da planilha", () => {
    expect(palco.servicos.reduce((t, s) => t + s.cliente, 0)).toBeCloseTo(palco.esperado.totalCliente, 6);
    expect(palco.servicos.reduce((t, s) => t + (s.verba ?? 0), 0)).toBeCloseTo(palco.esperado.totalVerba, 2);
    expect(palco.servicos.reduce((t, s) => t + (s.acertada ?? 0), 0)).toBeCloseTo(palco.esperado.totalAcertada, 2);
  });

  it("valor medido por semana = valor cliente × % da semana", () => {
    const v = valorPorSemana(servicos, "realizado", 4);
    const manual = servicos.reduce((t, s) => t + s.valorCliente * (s.realizado[1] ?? 0), 0);
    expect(v[0]).toBeCloseTo(manual, 8);
    expect(valorPorSemana(servicos, "previsto", 44).reduce((x, y) => x + y, 0)).toBeCloseTo(
      servicos.reduce((t, s) => t + s.valorCliente * concluido(s, "previsto"), 0), 6);
  });
});

describe("físico — regras gerais", () => {
  it("ponderação pela duração quando os serviços têm durações diferentes (correção da média simples)", () => {
    const s: ServicoFisico[] = [
      { id: "a", etapaId: "e", duracao: 9, valorCliente: 0, previsto: {}, realizado: { 1: 1 } },
      { id: "b", etapaId: "e", duracao: 1, valorCliente: 0, previsto: {}, realizado: {} },
    ];
    const r = calcularAvanco([{ id: "e" }], s);
    expect(r.semanal[0]!.realizado).toBeCloseTo(0.9, 12); // a planilha daria 0,5 (média simples × peso 1)
    expect(r.etapas[0]!.realizado).toBeCloseTo(0.9, 12);
  });

  it("sem limite de semanas e duração zero não gera NaN", () => {
    const r = calcularAvanco([{ id: "e" }], [{ id: "a", etapaId: "e", duracao: 0, valorCliente: 0, previsto: { 120: 1 }, realizado: {} }]);
    expect(r.semanas).toBe(120);
    expect(r.previsto).toBe(0);
    expect(Number.isNaN(r.acumulado[119]!.previsto)).toBe(false);
  });

  it("validação: realizado acima de 100% é erro; previsto incompleto é aviso", () => {
    const v = validarSerie([{ id: "a", previsto: { 1: 0.5 }, realizado: { 1: 0.7, 2: 0.4 } }, { id: "b", previsto: { 1: 0.5, 2: 0.5 }, realizado: { 1: 1 } }], "realizado");
    expect(v.erros.map((e) => e.servicoId)).toEqual(["a"]);
    const p = validarSerie([{ id: "a", previsto: { 1: 0.5 }, realizado: {} }, { id: "b", previsto: { 1: 0.5, 2: 0.5 }, realizado: {} }], "previsto");
    expect(p.erros).toEqual([]);
    expect(p.avisos.map((e) => e.servicoId)).toEqual(["a"]);
  });

  it("distribuir 100% entre semanas fecha exatamente", () => {
    const d = distribuir(3, 5);
    expect(Object.keys(d).map(Number)).toEqual([3, 4, 5]);
    expect(Object.values(d).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(() => distribuir(4, 2)).toThrow();
  });

  it("leitura de percentuais digitados ou colados do Excel", () => {
    expect(lerPercentual("25")).toBeCloseTo(0.25);
    expect(lerPercentual("12,5")).toBeCloseTo(0.125);
    expect(lerPercentual("25%")).toBeCloseTo(0.25);
    expect(lerPercentual("")).toBeNull();
    expect(Number.isNaN(lerPercentual("abc"))).toBe(true);
    expect(percentualTexto(0.125)).toBe("12,5");
    expect(percentualTexto(0)).toBe("");
  });

  it("semanas da obra (segunda a domingo) e período de medição", () => {
    expect(datasDaSemana("2026-10-09", 1)).toEqual({ inicio: "2026-10-05", fim: "2026-10-11" });
    expect(datasDaSemana("2026-10-09", 3).inicio).toBe("2026-10-19");
    expect(semanaDaData("2026-10-09", "2026-10-16")).toBe(2);
    expect(semanaDaData("2026-10-09", "2026-10-01")).toBe(0);
    expect(medicaoDaSemana(1, 2)).toBe(1);
    expect(medicaoDaSemana(4, 2)).toBe(2);
    expect(medicaoDaSemana(5, 4)).toBe(2);
    expect(medicaoDaSemana(3, 1)).toBe(3);
  });

  it("meta de fechamento pela curva ABC e taxa de uso", () => {
    expect(metaFechamento(1000, "A")).toBe(800);
    expect(metaFechamento(1000, "C")).toBe(950);
    expect(metaFechamento(1000, null)).toBeNull();
    expect(taxaDeUso(450, 600)).toBeCloseTo(0.75);
    expect(taxaDeUso(null, 600)).toBeNull();
  });
});

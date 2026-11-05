import { describe, expect, it } from "vitest";
import { paginarFotos, sugerirPrazo, sugerirProximaSemana, sugerirRealizadas, type ServicoTexto } from "@/dominio/relatorio";

describe("relatório fotográfico — páginas simétricas", () => {
  it("regras de 1 a 6 fotos", () => {
    expect(paginarFotos(0)).toEqual([]);
    expect(paginarFotos(1)).toEqual([[{ colunas: 1, fotos: [0] }]]);
    expect(paginarFotos(2)).toEqual([[{ colunas: 2, fotos: [0, 1] }]]);
    expect(paginarFotos(3)).toEqual([[{ colunas: 1, fotos: [0] }, { colunas: 2, fotos: [1, 2] }]]);
    expect(paginarFotos(4)[0]!.map((l) => l.fotos)).toEqual([[0, 1], [2, 3]]);
    expect(paginarFotos(5)[0]!.map((l) => l.fotos)).toEqual([[0, 1], [2, 3], [4]]);
    expect(paginarFotos(6)[0]!.map((l) => l.fotos)).toEqual([[0, 1], [2, 3], [4, 5]]);
  });

  it("12 fotos = 2 páginas de 6; 9 fotos = 6 + 3; todas as fotos aparecem uma vez", () => {
    expect(paginarFotos(12)).toHaveLength(2);
    const nove = paginarFotos(9);
    expect(nove[1]).toEqual([{ colunas: 1, fotos: [6] }, { colunas: 2, fotos: [7, 8] }]);
    for (let n = 1; n <= 20; n++) {
      const todas = paginarFotos(n).flat().flatMap((l) => l.fotos);
      expect(todas).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });
});

describe("relatório — textos sugeridos", () => {
  const s: ServicoTexto[] = [
    { descricao: "Forro", etapa: "Gesso", previsto: { 1: 0.5, 2: 0.5 }, realizado: { 1: 0.5, 2: 0.5 } },
    { descricao: "Pintura paredes", etapa: "Pintura", previsto: { 2: 0.5, 3: 0.5 }, realizado: { 2: 0.3 } },
    { descricao: "Limpeza", etapa: "Serviços finais", previsto: { 3: 1 }, realizado: {} },
  ];
  it("tarefas da semana e da próxima semana", () => {
    expect(sugerirRealizadas(s, 2)).toBe("• Gesso — Forro: concluído\n• Pintura — Pintura paredes: em andamento (30% executado)");
    expect(sugerirProximaSemana(s, 2)).toBe("• Pintura — Pintura paredes\n• Serviços finais — Limpeza");
  });
  it("prazo", () => {
    expect(sugerirPrazo({ realizado: 0.645, previsto: 0.67, semanaFimPrevisto: 10, dataFimPrevisto: "2026-12-11", dataFimContratual: "2027-01-15" }))
      .toBe("Avanço físico de 64,5% (previsto 67%), 2,5 pontos atrás do previsto. Término previsto pelo cronograma: 11/12/2026; término contratual: 15/01/2027.");
  });
});

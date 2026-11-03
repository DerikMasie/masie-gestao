import { describe, expect, it } from "vitest";
import { diferencaDias, gerarSemanas, mesDaSemana, quinzenaDaSemana, segundaDaSemana, semanasFaltantes } from "@/dominio/calendario";

describe("calendário semanal", () => {
  it("alinha à segunda-feira", () => {
    expect(segundaDaSemana("2023-11-06")).toBe("2023-11-06"); // segunda
    expect(segundaDaSemana("2023-11-12")).toBe("2023-11-06"); // domingo
    expect(segundaDaSemana("2026-10-09")).toBe("2026-10-05"); // sexta (obra Palco)
  });

  it("gera semanas cobrindo todo o prazo, sem limite fixo de colunas", () => {
    const s = gerarSemanas("2023-11-06", "2025-05-12");
    expect(s[0]).toEqual({ numero: 1, inicio: "2023-11-06", fim: "2023-11-12" });
    expect(s.at(-1)!.inicio).toBe("2025-05-12");
    expect(s).toHaveLength(80); // a planilha tinha 80 colunas, mas somava só 36–47
    const longa = gerarSemanas("2026-01-01", "2028-12-31");
    expect(longa.length).toBeGreaterThan(150);
  });

  it("numeração contínua e sem rótulos repetidos (erro 10)", () => {
    const s = gerarSemanas("2023-11-06", "2025-05-12");
    expect(new Set(s.map((x) => x.numero)).size).toBe(s.length);
    s.forEach((x, i) => expect(x.numero).toBe(i + 1));
  });

  it("prorrogação só acrescenta semanas", () => {
    const atuais = gerarSemanas("2026-01-05", "2026-02-01");
    const novas = semanasFaltantes(atuais, "2026-01-05", "2026-02-15");
    expect(novas.map((n) => n.numero)).toEqual([5, 6]);
    expect(semanasFaltantes(atuais, "2026-01-05", "2026-01-20")).toEqual([]);
  });

  it("deriva quinzena e mês de calendário", () => {
    expect([1, 2, 3, 4].map(quinzenaDaSemana)).toEqual([1, 1, 2, 2]);
    expect(mesDaSemana({ inicio: "2026-03-30" })).toBe("2026-03");
  });

  it("valida datas", () => {
    expect(() => gerarSemanas("2026-02-30", "2026-03-10")).toThrow();
    expect(() => gerarSemanas("2026-03-10", "2026-03-01")).toThrow();
    expect(diferencaDias("2026-02-28", "2026-03-01")).toBe(1);
  });
});

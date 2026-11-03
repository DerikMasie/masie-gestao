import { describe, expect, it } from "vitest";
import { gradeDoMes, iniciais, mesVizinho, nomeDoMes, posicaoEntre, precisaRenumerar, situacaoCartao } from "@/dominio/quadro";

describe("posição fracionária", () => {
  it("insere no início, no meio e no fim", () => {
    expect(posicaoEntre(null, null)).toBe(1000);
    expect(posicaoEntre(1000, null)).toBe(2000);
    expect(posicaoEntre(null, 1000)).toBe(500);
    expect(posicaoEntre(1000, 2000)).toBe(1500);
    expect(() => posicaoEntre(2000, 1000)).toThrow();
  });
  it("detecta quando renumerar", () => {
    expect(precisaRenumerar(1, 1 + 1e-7)).toBe(true);
    expect(precisaRenumerar(1, 2)).toBe(false);
    expect(precisaRenumerar(null, 1e-5)).toBe(true); // topo da coluna após muitas inserções
    expect(precisaRenumerar(null, 500)).toBe(false);
    expect(precisaRenumerar(2000, null)).toBe(false);
  });
});

describe("situação do cartão", () => {
  const hoje = "2026-11-03";
  it.each([
    [{ dataEntrega: "2026-11-02", concluido: false }, "ATRASADO"],
    [{ dataEntrega: "2026-11-03", concluido: false }, "HOJE"],
    [{ dataEntrega: "2026-11-05", concluido: false }, "PROXIMO"],
    [{ dataEntrega: "2026-11-20", concluido: false }, "NO_PRAZO"],
    [{ dataEntrega: null, concluido: false }, "SEM_DATA"],
    [{ dataEntrega: "2026-10-01", concluido: true }, "CONCLUIDO"],
  ] as const)("%o → %s", (c, s) => expect(situacaoCartao(c, hoje)).toBe(s));
});

describe("calendário mensal", () => {
  it("novembro/2026: começa na segunda 26/10 e termina no domingo 06/12", () => {
    const g = gradeDoMes("2026-11", "2026-11-03");
    expect(g[0]![0]!.data).toBe("2026-10-26");
    expect(g.at(-1)!.at(-1)!.data).toBe("2026-12-06");
    expect(g.every((s) => s.length === 7)).toBe(true);
    expect(g.flat().filter((d) => d.doMes)).toHaveLength(30);
    expect(g.flat().find((d) => d.hoje)!.data).toBe("2026-11-03");
    expect(g.flat().filter((d) => d.fimDeSemana && d.doMes).map((d) => d.data)).toContain("2026-11-01");
  });
  it("fevereiro bissexto e virada de ano", () => {
    expect(gradeDoMes("2028-02", "2028-02-01").flat().filter((d) => d.doMes)).toHaveLength(29);
    expect(mesVizinho("2026-12", 1)).toBe("2027-01");
    expect(mesVizinho("2026-01", -1)).toBe("2025-12");
    expect(nomeDoMes("2026-11")).toBe("novembro de 2026");
    expect(() => gradeDoMes("2026-13", "2026-01-01")).toThrow();
  });
  it("iniciais", () => {
    expect(iniciais("Ana Paula Souza")).toBe("AS");
    expect(iniciais("Derik")).toBe("D");
  });
});

import { describe, expect, it } from "vitest";
import { acumular, lembretesDaSemana, situacaoAtividade } from "@/dominio/painel-obra";

describe("painel da obra", () => {
  it("situação das atividades previstas na semana", () => {
    expect(situacaoAtividade({ previsto: { 4: 1 }, realizado: { 3: 0.5, 4: 0.5 } }, 4)).toBe("CONCLUIDA");
    expect(situacaoAtividade({ previsto: { 3: 0.5, 4: 0.5 }, realizado: { 3: 0.2 } }, 4)).toBe("ATRASADA");
    expect(situacaoAtividade({ previsto: { 3: 0.5, 4: 0.5 }, realizado: { 3: 0.5, 4: 0.2 } }, 4)).toBe("EM_ANDAMENTO");
    expect(situacaoAtividade({ previsto: { 4: 0.5, 5: 0.5 }, realizado: {} }, 4)).toBe("NAO_INICIADA");
  });
  it("lembretes: os da semana e os pendentes de semanas anteriores", () => {
    const l = [
      { id: "a", semana: 3, feitoEm: null }, { id: "b", semana: 3, feitoEm: "2026-10-20" },
      { id: "c", semana: 5, feitoEm: "2026-11-04" }, { id: "d", semana: 6, feitoEm: null },
    ];
    expect(lembretesDaSemana(l, 5).map((x) => x.id)).toEqual(["a", "c"]);
  });
  it("acumula séries", () => expect(acumular([1, 2, 3])).toEqual([1, 3, 6]));
});

import { describe, expect, it } from "vitest";
import { classificarRitmo, pendenciasObra, type EntradaPendencias } from "@/dominio/painel-obras";

describe("painel de obras — ritmo (limites aprovados: 2 e 5 pontos)", () => {
  it("classifica pela diferença em pontos", () => {
    expect(classificarRitmo(0.645, 0.67)).toBe("ATENCAO"); // −2,5 p.p. (Palco)
    expect(classificarRitmo(0.65, 0.67)).toBe("NO_RITMO"); // −2,0
    expect(classificarRitmo(0.70, 0.67)).toBe("ADIANTADA"); // +3,0
    expect(classificarRitmo(0.62, 0.67)).toBe("ATENCAO"); // −5,0
    expect(classificarRitmo(0.61, 0.67)).toBe("ATRASADA"); // −6,0
    expect(classificarRitmo(null, 0.5)).toBe("SEM_CRONOGRAMA");
  });
});

const base = (x: Partial<EntradaPendencias> = {}): EntradaPendencias => ({
  hoje: "2026-11-06", diaSemana: 5, semanaAtual: 5, temServicos: true, temPrevisto: true,
  semanasComPrevisto: new Set([1, 2, 3, 4, 5, 6]), semanasComRealizado: new Set([1, 2, 3, 4]), relatoriosEmitidos: new Set([1, 2, 3, 4]),
  inicioObra: "2026-10-09", medicoes: [], fornecedoresExecutadoNaoPago: [], acimaDaVerba: { quantidade: 0, excesso: 0 },
  prazo: { status: "NO_PRAZO", prazoDecorrido: 0.3, diasAtraso: 0, dataFim: "2027-01-15" }, realizado: 0.645, ...x,
});

describe("painel de obras — pendências da rotina", () => {
  it("obra em dia na sexta: lançar realizado e emitir o relatório da semana", () => {
    expect(pendenciasObra(base()).map((p) => [p.tipo, p.gravidade])).toEqual([
      ["REALIZADO_NAO_LANCADO", "MEDIA"], ["RELATORIO_NAO_EMITIDO", "MEDIA"],
    ]);
    // Na terça ainda não cobra a semana atual.
    expect(pendenciasObra(base({ diaSemana: 2 }))).toEqual([]);
  });

  it("semana passada sem realizado e sem relatório = alta", () => {
    const p = pendenciasObra(base({ diaSemana: 2, semanasComRealizado: new Set([1, 2, 3]), relatoriosEmitidos: new Set([1, 2]) }));
    expect(p.map((x) => x.texto)).toEqual(["Realizado da semana 4 não lançado", "Relatório da semana 4 não emitido"]);
    expect(p.every((x) => x.gravidade === "ALTA")).toBe(true);
  });

  it("medições, fornecedores, verba e prazo", () => {
    const p = pendenciasObra(base({
      diaSemana: 2,
      medicoes: [
        { numero: 1, estado: "FECHADA", cobranca: 46987.77, situacao: "NAO_PAGA", data: "2026-10-16" },
        { numero: 2, estado: "A_FECHAR", cobranca: 30209.88, situacao: "NAO_PAGA", data: "2026-10-30" },
        { numero: 3, estado: "EM_ANDAMENTO", cobranca: 0, situacao: "NAO_PAGA", data: "2026-11-13" },
      ],
      fornecedoresExecutadoNaoPago: [{ nome: "Danilo", valor: 6000 }, { nome: "Everton", valor: -513 }],
      acimaDaVerba: { quantidade: 2, excesso: 4917.31 },
      prazo: { status: "NO_PRAZO", prazoDecorrido: 0.85, diasAtraso: 0, dataFim: "2027-01-15" }, realizado: 0.6,
    }));
    expect(p.map((x) => x.tipo)).toEqual(["MEDICAO_NAO_PAGA", "MEDICAO_A_FECHAR", "PRAZO", "FORNECEDOR_A_PAGAR", "ACERTADO_ACIMA_VERBA"]);
    expect(p[0]!.texto).toContain("há 21 dia(s)");
    expect(p[3]!.texto).toContain("1 fornecedor(es)");
  });

  it("obra sem planilha ou sem previsto", () => {
    expect(pendenciasObra(base({ temServicos: false })).map((x) => x.tipo)).toEqual(["SEM_PLANILHA"]);
    // Prazo vencido aparece mesmo sem planilha.
    const vencida = pendenciasObra(base({ temServicos: false, prazo: { status: "ATRASADA", prazoDecorrido: 1.03, diasAtraso: 6, dataFim: "2026-10-30" } }));
    expect(vencida.map((x) => [x.tipo, x.gravidade])).toEqual([["PRAZO", "ALTA"], ["SEM_PLANILHA", "INFO"]]);
    expect(pendenciasObra(base({ temPrevisto: false, diaSemana: 2 })).map((x) => x.tipo)).toEqual(["SEM_PREVISTO"]);
  });
});

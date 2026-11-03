import { describe, expect, it } from "vitest";
import { calcularPrazo, ETAPAS_PADRAO, margemPrevista, proximoCodigoObra } from "@/dominio/obra";

describe("código da obra", () => {
  it("segue o padrão AAAA-NNNN sequencial por ano", () => {
    expect(proximoCodigoObra(2026, [])).toBe("2026-0001");
    expect(proximoCodigoObra(2026, ["2026-0001", "2026-0007", "2025-0030", "PALCO"])).toBe("2026-0008");
  });
});

describe("prazo", () => {
  const base = { dataInicio: "2026-01-01", dataFimContratual: "2026-03-01", dataConclusao: null };
  it("identifica atraso de obra ativa", () => {
    const p = calcularPrazo({ ...base, situacao: "EM_ANDAMENTO" }, "2026-03-11");
    expect(p.status).toBe("ATRASADA");
    expect(p.diasAtraso).toBe(10);
  });
  it("no prazo e % decorrido", () => {
    const p = calcularPrazo({ ...base, situacao: "EM_ANDAMENTO" }, "2026-01-30");
    expect(p.status).toBe("NO_PRAZO");
    expect(p.prazoDecorrido).toBeCloseTo(29 / 59, 5);
  });
  it("não iniciada", () => {
    expect(calcularPrazo({ ...base, situacao: "CONTRATADA" }, "2025-12-15").status).toBe("NAO_INICIADA");
  });
  it("concluída usa a data de conclusão", () => {
    expect(calcularPrazo({ ...base, situacao: "CONCLUIDA", dataConclusao: "2026-02-20" }, "2026-06-01").status).toBe("CONCLUIDA_NO_PRAZO");
    expect(calcularPrazo({ ...base, situacao: "CONCLUIDA", dataConclusao: "2026-03-05" }, "2026-06-01").status).toBe("CONCLUIDA_COM_ATRASO");
  });
  it("orçamento/prospecção não contam prazo", () => {
    expect(calcularPrazo({ ...base, situacao: "EM_ORCAMENTO" }, "2026-06-01").status).toBe("NAO_APLICAVEL");
  });
});

describe("margem e etapas", () => {
  it("margem prevista da obra Palco (verba sobre contrato)", () => {
    expect(margemPrevista(128861.68, 81857.03)).toBeCloseTo(0.3648, 4);
    expect(margemPrevista(0, 10)).toBeNull();
  });
  it("19 etapas padrão, com aditivos e faturamento direto separados", () => {
    expect(ETAPAS_PADRAO).toHaveLength(19);
    expect(ETAPAS_PADRAO[17]).toEqual({ nome: "Aditivos", tipo: "ADITIVO" });
    expect(ETAPAS_PADRAO[18]!.tipo).toBe("FATURAMENTO_DIRETO");
  });
});

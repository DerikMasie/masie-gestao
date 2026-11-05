import { describe, expect, it } from "vitest";
import { agruparPorEngenheiro, resumoEmpresa, zonaCarga, type ObraPainel } from "@/dominio/painel-engenheiros";

const o = (codigo: string, situacao: ObraPainel["situacao"], valor: number, eng: string | null): ObraPainel =>
  ({ id: codigo, codigo, nome: codigo, situacao, valor, engenheiroId: eng, engenheiro: eng ? `Eng ${eng}` : null });
const obras = [
  o("A", "EM_ANDAMENTO", 100, "1"), o("B", "CONTRATADA", 300, "1"), o("C", "CONCLUIDA", 50, "1"),
  o("D", "EM_ANDAMENTO", 200, "2"), o("E", "CANCELADA", 999, "2"), o("F", "PARALISADA", 150, null),
];

describe("painel por engenheiro", () => {
  it("resumo da empresa: execução, aguardando, total e receitas (sem canceladas)", () => {
    expect(resumoEmpresa(obras)).toEqual({ emExecucao: 2, aguardando: 2, total: 5, receitaTotal: 800, receitaAguardando: 450, receitaAndamento: 300 });
  });
  it("agrupa por engenheiro com carga, situação e % da carteira", () => {
    const g = agruparPorEngenheiro(obras);
    expect(g.map((x) => x.nome)).toEqual(["Eng 1", "Eng 2", "Sem responsável"]);
    expect(g[0]).toMatchObject({ iniciais: "E1", ativas: 2, zona: "VERDE", valorTotal: 450, percentual: 450 / 800 });
    expect(g[0]!.porSituacao).toEqual([0, 0, 1, 1, 0, 1]);
    expect(g[0]!.obras.map((x) => x.codigo)).toEqual(["B", "A", "C"]);
    expect(g[1]!.obras.map((x) => x.codigo)).toEqual(["D"]); // cancelada fora
  });
  it("zonas do medidor de carga", () => {
    expect([0, 3, 4, 6, 7, 12].map(zonaCarga)).toEqual(["VERDE", "VERDE", "AMARELO", "AMARELO", "VERMELHO", "VERMELHO"]);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { auditoria, obraEtapa, orcamento } from "@/db/schema";
import { esquemaObra } from "@/lib/validacao";
import { criarObra } from "@/servicos/obras";
import { avancarFluxo, salvarItem } from "@/servicos/orcamentos";
import {
  alterarEtapaRelatorio, carregarFisico, criarEtapaObra, excluirServico, gerarDoOrcamentoBase, importarFisico, salvarPeriodoMedicao,
  salvarSemanas, salvarServico, type DadosServico,
} from "@/servicos/fisico";
import palco from "../fixtures/palco-fisico.json";
import { db, prepararEmpresa } from "./ajuda";

let base: Awaited<ReturnType<typeof prepararEmpresa>>;
beforeEach(async () => { base = await prepararEmpresa(); });

async function novaObra(inicio = "2026-10-09", fim = "2026-12-18") {
  const { obra } = await criarObra(db, base.ctx, esquemaObra.parse({ nome: "Palco", clienteId: base.clienteId, dataInicio: inicio, dataFimContratual: fim, valorContratoOriginal: "128861,68" }));
  const etapas = await db.select().from(obraEtapa).where(eq(obraEtapa.obraId, obra.id));
  return { obra, etapa: (nome: string) => etapas.find((e) => e.nome === nome)!.id };
}

/** Monta uma planilha no layout do ControlePalco (colunas F–M e semanas a partir da N) com os dados reais do Palco. */
async function planilhaPalco(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const datas = Array.from({ length: 44 }, (_, i) => new Date(Date.UTC(2026, 9, 9 + i * 7)));
  for (const aba of ["Realizado-Físico", "Previsto fisico"]) {
    const ws = wb.addWorksheet(aba);
    const cab = ws.getRow(5);
    ["Aux1", "Aux2", "Inserir manualmente", "Nome da Tarefa", "Fornecedor", "Mão de obra acertada", "Mão de obra verba", "Valor cliente", "Duração (dias)", "% Relativo", "% Concluído"]
      .forEach((t, i) => { cab.getCell(3 + i).value = t; });
    datas.forEach((d, i) => { cab.getCell(14 + i).value = d; });
    let r = 6;
    for (const e of palco.etapas) {
      ws.getRow(r).getCell(5).value = e.ordem; ws.getRow(r).getCell(6).value = e.nome; r++;
      for (const s of palco.servicos.filter((x) => x.etapa === e.ordem)) {
        const row = ws.getRow(r++);
        row.getCell(6).value = s.nome;
        if (s.fornecedor) row.getCell(7).value = s.fornecedor;
        if (s.acertada != null) row.getCell(8).value = s.acertada;
        row.getCell(9).value = s.verba ?? "Não preencher";
        row.getCell(10).value = s.cliente;
        row.getCell(11).value = s.duracao;
        const valores = aba.startsWith("Realizado") ? s.realizado : s.previsto;
        for (const [k, v] of Object.entries(valores)) row.getCell(13 + Number(k)).value = v as number;
      }
    }
    ws.getRow(r + 1).getCell(6).value = "Duração total";
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const servico = (etapaId: string, extra: Partial<DadosServico> = {}): DadosServico => ({
  etapaId, descricao: "Serviço", fornecedorId: null, maoDeObraAcertada: null, maoDeObraVerba: 100, valorCliente: 160, duracaoDias: 1, curvaAbc: null, observacao: null, ...extra,
});

describe("gestão da obra — físico", () => {
  it("importa a planilha do Palco e reproduz o avanço calculado pelo Excel", async () => {
    const o = await novaObra();
    const rel = await importarFisico(db, base.ctx, o.obra.id, await planilhaPalco(), "ControlePalco.xlsm", { substituir: false });
    expect(rel.servicos).toBe(palco.servicos.length);
    expect(rel.previsto).toBe(true);
    expect(rel.primeiraSemana).toBe(1);
    expect(rel.etapasCriadas).toEqual([]);
    expect(rel.totalCliente).toBeCloseTo(palco.esperado.totalCliente, 6);

    const f = await carregarFisico(db, base.empresaId, o.obra.id, "2026-11-04");
    expect(f.semanaAtual).toBe(5);
    palco.esperado.realizadoSemanal.forEach((v, i) => expect(f.avanco.semanal[i]!.realizado).toBeCloseTo(v, 10));
    palco.esperado.previstoSemanal.forEach((v, i) => expect(f.avanco.semanal[i]!.previsto).toBeCloseTo(v, 10));
    expect(f.avanco.realizado).toBeCloseTo(0.645, 10);
    expect(f.totais.verba).toBeCloseTo(palco.esperado.totalVerba, 2);
    expect(f.totais.acertada).toBeCloseTo(palco.esperado.totalAcertada, 2);

    // Reimportar exige confirmação explícita de substituição.
    await expect(importarFisico(db, base.ctx, o.obra.id, await planilhaPalco(), "x.xlsx", { substituir: false })).rejects.toThrow("Substituir");
    const r2 = await importarFisico(db, base.ctx, o.obra.id, await planilhaPalco(), "x.xlsx", { substituir: true });
    expect(r2.servicos).toBe(palco.servicos.length);
    expect((await carregarFisico(db, base.empresaId, o.obra.id)).servicos).toHaveLength(palco.servicos.length);
  });

  it("recusa planilha que começa antes do início da obra", async () => {
    const o = await novaObra("2026-11-02", "2027-02-01");
    await expect(importarFisico(db, base.ctx, o.obra.id, await planilhaPalco(), "p.xlsx", { substituir: false })).rejects.toThrow("antes do início da obra");
  });

  it("realizado: grava, audita e bloqueia total acima de 100% (tudo ou nada)", async () => {
    const o = await novaObra();
    const a = await salvarServico(db, base.ctx, o.obra.id, servico(o.etapa("Pintura"), { descricao: "Pintura paredes", duracaoDias: 3 }));
    const b = await salvarServico(db, base.ctx, o.obra.id, servico(o.etapa("Gesso"), { descricao: "Forro", duracaoDias: 1 }));
    expect((await salvarSemanas(db, base.ctx, o.obra.id, "realizado", [{ servicoId: a.id, semana: 1, valor: 0.5 }, { servicoId: b.id, semana: 1, valor: 1 }])).alteradas).toBe(2);
    let f = await carregarFisico(db, base.empresaId, o.obra.id);
    expect(f.avanco.semanal[0]!.realizado).toBeCloseTo(0.75 * 0.5 + 0.25 * 1, 12);

    await expect(salvarSemanas(db, base.ctx, o.obra.id, "realizado", [{ servicoId: a.id, semana: 2, valor: 0.3 }, { servicoId: b.id, semana: 2, valor: 0.2 }]))
      .rejects.toThrow("Forro");
    f = await carregarFisico(db, base.empresaId, o.obra.id);
    expect(f.servicos.find((s) => s.id === a.id)!.realizado).toEqual({ 1: 0.5 }); // nada foi salvo

    // Apagar a célula (null) remove o valor.
    await salvarSemanas(db, base.ctx, o.obra.id, "realizado", [{ servicoId: a.id, semana: 1, valor: null }]);
    f = await carregarFisico(db, base.empresaId, o.obra.id);
    expect(f.servicos.find((s) => s.id === a.id)!.realizado).toEqual({});
    const aud = await db.select().from(auditoria).where(eq(auditoria.entidade, "realizado_fisico"));
    expect(aud).toHaveLength(2);
  });

  it("previsto independe do realizado e não permite serviço de outra obra", async () => {
    const o = await novaObra();
    const outra = await novaObra();
    const a = await salvarServico(db, base.ctx, o.obra.id, servico(o.etapa("Pintura")));
    await salvarSemanas(db, base.ctx, o.obra.id, "previsto", [{ servicoId: a.id, semana: 1, valor: 0.6 }, { servicoId: a.id, semana: 2, valor: 0.4 }]);
    await salvarSemanas(db, base.ctx, o.obra.id, "realizado", [{ servicoId: a.id, semana: 1, valor: 0.2 }]);
    const s = (await carregarFisico(db, base.empresaId, o.obra.id)).servicos[0]!;
    expect(s.previsto).toEqual({ 1: 0.6, 2: 0.4 });
    expect(s.realizado).toEqual({ 1: 0.2 });
    await expect(salvarSemanas(db, base.ctx, outra.obra.id, "previsto", [{ servicoId: a.id, semana: 1, valor: 0.1 }])).rejects.toThrow("não pertencem");
  });

  it("não exclui serviço com realizado lançado", async () => {
    const o = await novaObra();
    const a = await salvarServico(db, base.ctx, o.obra.id, servico(o.etapa("Pintura")));
    await salvarSemanas(db, base.ctx, o.obra.id, "realizado", [{ servicoId: a.id, semana: 1, valor: 0.2 }]);
    await expect(excluirServico(db, base.ctx, o.obra.id, a.id)).rejects.toThrow("Zere o realizado");
    await salvarSemanas(db, base.ctx, o.obra.id, "realizado", [{ servicoId: a.id, semana: 1, valor: null }]);
    await excluirServico(db, base.ctx, o.obra.id, a.id);
    expect((await carregarFisico(db, base.empresaId, o.obra.id)).servicos).toHaveLength(0);
  });

  it("gera a planilha do orçamento-base com material por etapa e valor cliente igual ao total da proposta", async () => {
    const o = await novaObra();
    await expect(gerarDoOrcamentoBase(db, base.ctx, o.obra.id)).rejects.toThrow("orçamento-base");
    const [orc] = await db.select().from(orcamento).where(eq(orcamento.obraId, o.obra.id));
    const item = { grupo: null, unidade: "m²", memoriaCalculo: null, quebra: 1, bdiMaoDeObra: null, bdiMaterial: null, observacao: null };
    await salvarItem(db, base.ctx, orc!.id, { ...item, etapaId: o.etapa("Pintura"), descricao: "Pintura de paredes", quantidade: 10, custoUnitarioMaoDeObra: 100, custoUnitarioMaterial: 50 });
    await salvarItem(db, base.ctx, orc!.id, { ...item, etapaId: o.etapa("Pintura"), descricao: "Massa corrida", quantidade: 10, custoUnitarioMaoDeObra: 20, custoUnitarioMaterial: 10 });
    await salvarItem(db, base.ctx, orc!.id, { ...item, etapaId: o.etapa("Gesso"), descricao: "Forro", quantidade: 5, custoUnitarioMaoDeObra: 100, custoUnitarioMaterial: 0 });
    for (const a of ["ENVIAR", "APROVAR", "DEFINIR_BASE"] as const) await avancarFluxo(db, base.ctx, orc!.id, a);

    const r = await gerarDoOrcamentoBase(db, base.ctx, o.obra.id);
    const f = await carregarFisico(db, base.empresaId, o.obra.id);
    expect(f.servicos.map((s) => s.descricao)).toEqual(["Forro", "Pintura de paredes", "Massa corrida", "Material de pintura"]);
    // venda sem imposto: MO 1700×1,3 = 2210; material 600×1,1 = 660 → 2870 ÷ (1 − 10,5%) = 3.206,70
    expect(r.totalCliente).toBeCloseTo(3206.7, 6); // = total da proposta, arredondado em centavos
    expect(f.totais.verba).toBeCloseTo(1700 + 600, 6);
    await expect(gerarDoOrcamentoBase(db, base.ctx, o.obra.id)).rejects.toThrow("já tem serviços");
  });

  it("categorias novas, relatório e período de medição", async () => {
    const o = await novaObra();
    let f = await carregarFisico(db, base.empresaId, o.obra.id);
    const nomes = (filtro: (e: (typeof f.etapas)[number]) => boolean) => f.etapas.filter(filtro).map((e) => e.nome);
    expect(nomes((e) => !e.exibirNoRelatorio)).toEqual(["Aluguel de equipamentos", "Serviços adicionais", "Faturamento direto"]);
    expect(f.etapas.at(-2)!.nome).toBe("Aditivos");

    const nova = await criarEtapaObra(db, base.ctx, o.obra.id, "Marcenaria");
    await expect(criarEtapaObra(db, base.ctx, o.obra.id, "marcenaria")).rejects.toThrow("Já existe");
    await alterarEtapaRelatorio(db, base.ctx, o.obra.id, o.etapa("Serviços adicionais"), true);
    f = await carregarFisico(db, base.empresaId, o.obra.id);
    expect(f.etapas.find((e) => e.id === nova.id)!.exibirNoRelatorio).toBe(true);
    // Categoria nova entra no grupo de contrato, antes de Aditivos.
    expect(f.etapas.findIndex((e) => e.id === nova.id)).toBeLessThan(f.etapas.findIndex((e) => e.nome === "Aditivos"));
    expect(nomes((e) => !e.exibirNoRelatorio)).toEqual(["Aluguel de equipamentos", "Faturamento direto"]);

    await salvarPeriodoMedicao(db, base.ctx, o.obra.id, 4);
    await expect(salvarPeriodoMedicao(db, base.ctx, o.obra.id, 5)).rejects.toThrow("1 a 4");
    expect((await carregarFisico(db, base.empresaId, o.obra.id)).obra.semanasPorMedicao).toBe(4);
  });
});

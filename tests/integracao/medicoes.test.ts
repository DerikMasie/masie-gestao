import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditoria, fornecedor } from "@/db/schema";
import { esquemaObra } from "@/lib/validacao";
import { criarObra } from "@/servicos/obras";
import { importarFisico, salvarPeriodoMedicao, salvarSemanas } from "@/servicos/fisico";
import { alterarSituacaoMedicao, carregarMedicoes, excluirAjuste, fecharMedicao, reabrirMedicao, salvarAjuste, salvarPagamentos } from "@/servicos/medicoes";
import { db, prepararEmpresa } from "./ajuda";
import { planilhaPalco } from "./palco";

let base: Awaited<ReturnType<typeof prepararEmpresa>>;
const HOJE = "2026-11-05"; // semana 5 da obra Palco
beforeEach(async () => { base = await prepararEmpresa(); });

async function obraPalco() {
  const { obra } = await criarObra(db, base.ctx, esquemaObra.parse({
    nome: "Palco", clienteId: base.clienteId, dataInicio: "2026-10-09", dataFimContratual: "2027-01-15", valorContratoOriginal: "128861,68", percentualEntrada: "20",
  }));
  await importarFisico(db, base.ctx, obra.id, await planilhaPalco(), "ControlePalco.xlsm", { substituir: false });
  return obra;
}

describe("medições da obra (Palco)", () => {
  it("cobrança quinzenal, saldo e resumo batem com o Gerencial da planilha", async () => {
    const o = await obraPalco();
    const m = await carregarMedicoes(db, base.empresaId, o.id, HOJE);
    expect(m.linhas[0]!.cobranca).toBeCloseTo(46987.7705, 4);
    expect(m.linhas[1]!.cobranca).toBeCloseTo(30209.8761, 4);
    expect(m.linhas[0]!.data).toBe("2026-10-16");
    expect(m.resumo.executado).toBeCloseTo(77197.6466, 4);
    expect(m.resumo.saldo).toBeCloseTo(103089.344, 4);
    expect(m.linhas.slice(0, 3).map((l) => l.estado)).toEqual(["A_FECHAR", "A_FECHAR", "EM_ANDAMENTO"]);
  });

  it("fechar em ordem, pagar, reabrir e levar correções para a medição aberta", async () => {
    const o = await obraPalco();
    await expect(fecharMedicao(db, base.ctx, o.id, 2, HOJE)).rejects.toThrow("Feche antes a medição 1");
    await expect(fecharMedicao(db, base.ctx, o.id, 3, "2026-10-20")).rejects.toThrow();
    await fecharMedicao(db, base.ctx, o.id, 1, HOJE);
    await expect(fecharMedicao(db, base.ctx, o.id, 1, HOJE)).rejects.toThrow("já está fechada");
    await expect(alterarSituacaoMedicao(db, base.ctx, o.id, 1, "PAGA", null)).rejects.toThrow("data");
    await alterarSituacaoMedicao(db, base.ctx, o.id, 1, "PAGA", "2026-10-20");
    await expect(reabrirMedicao(db, base.ctx, o.id, 1)).rejects.toThrow("paga");

    let m = await carregarMedicoes(db, base.empresaId, o.id, HOJE);
    expect(m.resumo.quitadas).toBeCloseTo(46987.7705, 4);
    expect(m.resumo.saldo).toBeCloseTo(103089.344 - 46987.7705, 4);

    // Correção no realizado da semana 1, já medida: Gerenciamento de obra passa de 10% para 20% na semana.
    const ger = m.fisico.servicos.find((s) => s.descricao.startsWith("Gerenciamento de obra"))!;
    await salvarSemanas(db, base.ctx, o.id, "realizado", [{ servicoId: ger.id, semana: 1, valor: 0.2 }]);
    m = await carregarMedicoes(db, base.empresaId, o.id, HOJE);
    const extra = ger.valorCliente * 0.1 * 0.8;
    expect(m.linhas[0]!.cobranca).toBeCloseTo(46987.7705, 4); // congelada
    expect(m.linhas[0]!.divergencia).toBeCloseTo(extra, 6);
    expect(m.linhas[1]!.ajusteAnteriores).toBeCloseTo(extra, 6);
    expect(m.linhas[1]!.cobranca).toBeCloseTo(30209.8761 + extra, 4);

    // Período não pode mudar com medição fechada.
    await expect(salvarPeriodoMedicao(db, base.ctx, o.id, 4)).rejects.toThrow("não pode mais ser alterado");

    // Reabrir a última (não paga).
    await fecharMedicao(db, base.ctx, o.id, 2, HOJE);
    await reabrirMedicao(db, base.ctx, o.id, 2);
    await expect(reabrirMedicao(db, base.ctx, o.id, 1)).rejects.toThrow("paga");
    expect(await db.select().from(auditoria).where(eq(auditoria.entidade, "medicao"))).toHaveLength(4);
  });

  it("aditivos, descontos e reembolsos", async () => {
    const o = await obraPalco();
    await salvarAjuste(db, base.ctx, o.id, { tipo: "ADITIVO", data: "2026-10-20", valor: 5000, descricao: "Marcenaria extra", medicaoNumero: null });
    const d = await salvarAjuste(db, base.ctx, o.id, { tipo: "DESCONTO", data: "2026-10-20", valor: 300, descricao: "Desconto comercial", medicaoNumero: 3 });
    await salvarAjuste(db, base.ctx, o.id, { tipo: "REEMBOLSO", data: "2026-10-20", valor: 120, descricao: "Taxa paga pela Masie", medicaoNumero: 3 });
    await expect(salvarAjuste(db, base.ctx, o.id, { tipo: "DESCONTO", data: "2026-10-20", valor: 10, descricao: "x", medicaoNumero: null })).rejects.toThrow("medição");
    let m = await carregarMedicoes(db, base.empresaId, o.id, HOJE);
    expect(m.linhas[2]!.ajustes).toBeCloseTo(-180, 9);
    expect(m.resumo.ajustes).toBeCloseTo(5000 - 300 + 120, 9);
    expect(m.aditivosLancados).toBe(5000);
    expect(m.aditivosPlanilha).toBe(0); // aviso na tela: aditivo sem serviço na etapa Aditivos

    await fecharMedicao(db, base.ctx, o.id, 1, HOJE);
    await fecharMedicao(db, base.ctx, o.id, 2, HOJE);
    await expect(salvarAjuste(db, base.ctx, o.id, { tipo: "DESCONTO", data: "2026-10-20", valor: 10, descricao: "x", medicaoNumero: 2 })).rejects.toThrow("já está fechada");
    await excluirAjuste(db, base.ctx, o.id, d.id);
    m = await carregarMedicoes(db, base.empresaId, o.id, HOJE);
    expect(m.linhas[2]!.ajustes).toBeCloseTo(120, 9);
  });

  it("fornecedores: apropriado pela MO acertada × % e pagamentos manuais", async () => {
    const o = await obraPalco();
    const [ev] = await db.select().from(fornecedor).where(eq(fornecedor.nome, "Everton"));
    await salvarPagamentos(db, base.ctx, o.id, [{ fornecedorId: ev!.id, semana: 2, valor: 12000 }, { fornecedorId: ev!.id, semana: 3, valor: null }]);
    await expect(salvarPagamentos(db, base.ctx, o.id, [{ fornecedorId: ev!.id, semana: 2, valor: -5 }])).rejects.toThrow("positivo");
    const m = await carregarMedicoes(db, base.empresaId, o.id, HOJE);
    const linha = m.fornecedores.find((f) => f.nome === "Everton")!;
    expect(linha.apropriadoSemana[0]).toBeCloseTo(5282.2806036892125, 6); // Gerencial!E36
    expect(linha.apropriadoSemana[1]).toBeCloseTo(6204.583566238121, 6); // Gerencial!F36
    expect(linha.apropriado).toBeCloseTo(11486.864169927334, 6); // Gerencial!D36
    expect(linha.pago).toBe(12000);
    expect(linha.aPagar).toBeCloseTo(linha.acertado - 12000, 6);
    const frigelar = m.fornecedores.find((f) => f.nome === "Frigelar")!;
    expect(frigelar.apropriado).toBeCloseTo(11117.31, 6); // Gerencial!D38
  });
});

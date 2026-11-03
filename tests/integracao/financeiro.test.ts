import { beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import { centroCusto, contaFinanceira, fornecedor, lancamento, obraEtapa, orcamento, planoConta, tituloParcela, titulo } from "@/db/schema";
import { esquemaFornecedor, esquemaObra } from "@/lib/validacao";
import { criarObra } from "@/servicos/obras";
import { avancarFluxo, salvarItem } from "@/servicos/orcamentos";
import { salvarFornecedor } from "@/servicos/cadastros";
import {
  baixarParcela, cancelarNota, criarLancamento, criarTitulo, lancarNota, listarParcelas, notaDuplicada, painelFinanceiro, resultadoPorCentro, verbaDaObra,
} from "@/servicos/financeiro";
import { desfazerImportacao, importarFinanceiro } from "@/servicos/importacao-financeiro";
import { db, prepararEmpresa } from "./ajuda";

let base: Awaited<ReturnType<typeof prepararEmpresa>>;
beforeEach(async () => { base = await prepararEmpresa(); });

async function cenario() {
  const { obra } = await criarObra(db, base.ctx, esquemaObra.parse({ nome: "Palco", clienteId: base.clienteId, dataInicio: "2026-10-05", dataFimContratual: "2026-12-18" }));
  const [cc] = await db.select().from(centroCusto).where(eq(centroCusto.obraId, obra.id));
  const etapas = await db.select().from(obraEtapa).where(eq(obraEtapa.obraId, obra.id));
  const etapa = (n: string) => etapas.find((e) => e.nome === n)!.id;
  const [orc] = await db.select().from(orcamento).where(eq(orcamento.obraId, obra.id));
  // orçamento-base: elétrica com custo 10.000 (MO 6.000 + material 4.000)
  await salvarItem(db, base.ctx, orc!.id, { etapaId: etapa("Instalações elétricas/lógicas"), grupo: null, descricao: "Pontos elétricos", unidade: "pt", quantidade: 100, memoriaCalculo: null, quebra: 1, custoUnitarioMaoDeObra: 60, custoUnitarioMaterial: 40, bdiMaoDeObra: null, bdiMaterial: null, observacao: null });
  await avancarFluxo(db, base.ctx, orc!.id, "APROVAR");
  await avancarFluxo(db, base.ctx, orc!.id, "DEFINIR_BASE");
  const f = await salvarFornecedor(db, base.ctx, esquemaFornecedor.parse({ nome: "Loja Elétrica", tipoPessoa: "PJ" }), undefined);
  const plano = async (sub: string) => (await db.select().from(planoConta).where(and(eq(planoConta.empresaId, base.empresaId), eq(planoConta.subitem, sub))))[0]!;
  const [caixa] = await db.select().from(contaFinanceira).where(eq(contaFinanceira.empresaId, base.empresaId));
  return { obra, cc: cc!, etapa, fornecedorId: f.id, plano, caixa: caixa! };
}

const nota = (c: Awaited<ReturnType<typeof cenario>>, planoContaId: string, extra: Record<string, unknown> = {}) => ({
  fornecedorId: c.fornecedorId, numero: "1001", serie: "1", chaveNfe: null, emissao: "2026-11-01", tipo: "A_PRAZO" as const, valorTotal: 3000,
  centroCustoId: c.cc.id, obraEtapaId: null, planoContaId, faturadoAoCliente: false, descricao: null, xml: null,
  parcelas: 3, primeiroVencimento: "2026-11-15", intervaloDias: 30, pagaNaConta: null, ...extra,
});

describe("notas fiscais e verba", () => {
  it("NF gera título com parcelas, etapa pelo de-para e consome a verba; pagamento não conta duas vezes", async () => {
    const c = await cenario();
    const material = await c.plano("Elétrico");
    const { nota: nf, tituloId } = await lancarNota(db, base.ctx, nota(c, material.id));
    expect(nf.obraEtapaId).toBe(c.etapa("Instalações elétricas/lógicas"));
    const parcelas = await db.select().from(tituloParcela).where(eq(tituloParcela.tituloId, tituloId!));
    expect(parcelas.map((p) => Number(p.valor))).toEqual([1000, 1000, 1000]);

    let v = await verbaDaObra(db, base.empresaId, c.obra.id);
    let el = v.linhas.find((l) => l.etapa.nome === "Instalações elétricas/lógicas")!;
    expect(el).toMatchObject({ orcado: 10000, incorrido: 3000, pago: 0, aPagar: 3000, saldo: 7000 });

    await baixarParcela(db, base.ctx, parcelas[0]!.id, { data: "2026-11-15", contaId: c.caixa.id });
    v = await verbaDaObra(db, base.empresaId, c.obra.id);
    el = v.linhas.find((l) => l.etapa.nome === "Instalações elétricas/lógicas")!;
    expect(el).toMatchObject({ incorrido: 3000, pago: 1000, aPagar: 2000 });
    await expect(baixarParcela(db, base.ctx, parcelas[0]!.id, { data: "2026-11-15", contaId: c.caixa.id })).rejects.toThrow("já foi baixada");

    // pagamento direto de MO sem NF entra no incorrido
    await criarLancamento(db, base.ctx, { data: "2026-11-20", tipo: "SAIDA", valor: 8000, contaId: c.caixa.id, centroCustoId: c.cc.id, planoContaId: (await c.plano("MO Terceirizada - Elétrica")).id, obraEtapaId: null, descricao: "Eletricista", observacao: null });
    v = await verbaDaObra(db, base.empresaId, c.obra.id);
    el = v.linhas.find((l) => l.etapa.nome === "Instalações elétricas/lógicas")!;
    expect(el).toMatchObject({ incorrido: 11000, pago: 9000, alerta: "ESTOURADA", saldo: -1000 });
  });

  it("impede NF duplicada (fornecedor+número+série e chave), devolução abate, faturado ao cliente não é custo", async () => {
    const c = await cenario();
    const material = await c.plano("Elétrico");
    await lancarNota(db, base.ctx, nota(c, material.id, { chaveNfe: "4".repeat(44) }));
    expect(await notaDuplicada(db, base.empresaId, { fornecedorId: c.fornecedorId, numero: " 1001 ", serie: "1" })).toBe(true);
    await expect(lancarNota(db, base.ctx, nota(c, material.id))).rejects.toThrow("já foi lançada");
    await expect(lancarNota(db, base.ctx, nota(c, material.id, { numero: "999", chaveNfe: "4".repeat(44) }))).rejects.toThrow("chave");
    const dev = await lancarNota(db, base.ctx, nota(c, material.id, { numero: "D1", tipo: "DEVOLUCAO", valorTotal: 500 }));
    expect(dev.tituloId).toBeNull();
    const fd = await lancarNota(db, base.ctx, nota(c, material.id, { numero: "FD1", faturadoAoCliente: true, valorTotal: 7000 }));
    expect(fd.tituloId).toBeNull();
    const el = (await verbaDaObra(db, base.empresaId, c.obra.id)).linhas.find((l) => l.etapa.nome === "Instalações elétricas/lógicas")!;
    expect(el.incorrido).toBe(2500);
  });

  it("à vista paga na hora gera o lançamento; cancelamento bloqueado se houver pagamento", async () => {
    const c = await cenario();
    const r = await lancarNota(db, base.ctx, nota(c, (await c.plano("Elétrico")).id, { numero: "AV1", tipo: "A_VISTA", valorTotal: 250, pagaNaConta: c.caixa.id }));
    const ls = await db.select().from(lancamento).where(eq(lancamento.notaFiscalId, r.nota.id));
    expect(ls.map((l) => Number(l.valor))).toEqual([-250]);
    await expect(cancelarNota(db, base.ctx, r.nota.id)).rejects.toThrow("parcelas pagas");
    const r2 = await lancarNota(db, base.ctx, nota(c, (await c.plano("Elétrico")).id, { numero: "AP2" }));
    await cancelarNota(db, base.ctx, r2.nota.id);
    expect((await listarParcelas(db, base.empresaId, { tipo: "PAGAR" })).length).toBe(0);
    // após cancelar, o mesmo número pode ser relançado
    await lancarNota(db, base.ctx, nota(c, (await c.plano("Elétrico")).id, { numero: "AP2" }));
  });

  it("contas a receber, resultado por centro e painel", async () => {
    const c = await cenario();
    const receita = await c.plano("Obras");
    await criarTitulo(db, base.ctx, { tipo: "RECEBER", fornecedorId: null, clienteId: base.clienteId, centroCustoId: c.cc.id, planoContaId: receita.id, obraEtapaId: null, descricao: "Medição 1", documento: null, emissao: "2026-11-01", valorTotal: 20000, parcelas: 1, primeiroVencimento: "2026-11-10", intervaloDias: 30 });
    const [p] = await listarParcelas(db, base.empresaId, { tipo: "RECEBER" });
    await baixarParcela(db, base.ctx, p!.id, { data: "2026-11-10", contaId: c.caixa.id });
    await lancarNota(db, base.ctx, nota(c, (await c.plano("Elétrico")).id, { tipo: "A_VISTA", valorTotal: 4000, pagaNaConta: c.caixa.id }));
    const pron = await db.select().from(planoConta).where(and(eq(planoConta.empresaId, base.empresaId), eq(planoConta.subitem, "Pronampe")));
    expect(pron[0]!.natureza).toBe("FINANCIAMENTO");
    const adm = (await db.select().from(centroCusto).where(eq(centroCusto.codigo, "ADM")))[0]!;
    await criarLancamento(db, base.ctx, { data: "2026-11-02", tipo: "ENTRADA", valor: 391571, contaId: c.caixa.id, centroCustoId: adm.id, planoContaId: pron[0]!.id, obraEtapaId: null, descricao: "Pronampe", observacao: null });
    const rc = (await resultadoPorCentro(db, base.empresaId)).find((x) => x.id === c.cc.id)!;
    expect(rc).toMatchObject({ receitas: 20000, custos: 4000, resultadoOperacional: 16000 });
    const pAdm = (await resultadoPorCentro(db, base.empresaId)).find((x) => x.id === adm.id)!;
    expect(pAdm.resultadoOperacional).toBe(0);
    expect(pAdm.foraDoResultado.financiamento).toBe(391571);
    const painel = await painelFinanceiro(db, base.empresaId, "2026-11-15");
    expect(painel.saldoTotal).toBe(20000 - 4000 + 391571);
    expect(painel.resultadoMes.resultadoOperacional).toBe(16000);
  });
});

async function planilhaSintetica() {
  const wb = new ExcelJS.Workbook();
  const listas = wb.addWorksheet("Aux.Listas");
  listas.getCell("B4").value = "ItemReferencia"; listas.getCell("C4").value = "Tipo";
  [["Custos_de_material", "Custos"], ["Receitas_com_serviços", "Receitas"], ["Receitas_financeiras", "Receitas"], ["Impostos", "Impostos"]].forEach(([a, b], i) => { listas.getCell(`B${5 + i}`).value = a; listas.getCell(`C${5 + i}`).value = b; });
  const bancos = wb.addWorksheet("Aux.Bancos"); bancos.getCell("B4").value = "Bancos"; bancos.getCell("B5").value = "Sicoob"; bancos.getCell("B6").value = "Conta PF Sócio";
  const cc = wb.addWorksheet("Centros de Custo");
  const linhaCC = (r: number, n: string | number, nome: string, tipo: string, valor: number) => { cc.getCell(`C${r}`).value = n; cc.getCell(`D${r}`).value = nome; cc.getCell(`E${r}`).value = tipo; cc.getCell(`F${r}`).value = valor; cc.getCell(`H${r}`).value = `${n} - ${nome}`; };
  linhaCC(20, "2024-0001", "Reforma A", "Obra", 100000); linhaCC(21, 7, "Escritório", "Interno", 0);
  const f = wb.addWorksheet("Fluxo De Caixa");
  ["Ano", "Mês", "Data Caixa", "ItemReferencia", "SubItem", "Centro de Custo", "Descrição", "Banco", "Crédito", "Débito"].forEach((h, i) => { f.getRow(27).getCell(2 + i).value = h; });
  const lin = (r: number, data: Date, item: string, sub: string | null, cc: string | null, banco: string, cred: number | string | null, deb: number | null) => {
    const row = f.getRow(r); row.getCell(4).value = data; row.getCell(5).value = item; row.getCell(6).value = sub; row.getCell(7).value = cc; row.getCell(8).value = "descr"; row.getCell(9).value = banco; row.getCell(10).value = cred; row.getCell(11).value = deb;
  };
  lin(28, new Date("2025-03-10"), "Receitas_com_serviços", "Obras", "2024-0001 - Reforma A", "Sicoob", 50000, null);
  lin(29, new Date("2025-03-12"), "Custos_de_material", "Elétrico", "2024-0001 - Reforma A", "Sicoob", null, 12000);
  lin(30, new Date("2025-03-15"), "Custos_de_material", null, "2024-0001 - Reforma A", "Sicoob", null, 1000);
  lin(31, new Date("2025-04-01"), "Receitas_financeiras", "Pronampe", "7 - Escritório", "Sicoob", 391571, null);
  lin(32, new Date("2025-04-02"), "Impostos", "DAS", "7 - Escritório", "Conta PF Sócio", null, 2500);
  lin(33, new Date("2025-04-03"), "Receitas_com_serviços", "Obras", null, "Sicoob", "1.234,56", null);
  lin(34, new Date("2025-04-04"), "Custos_de_material", "Elétrico", "2024-0001 - Reforma A", "Sicoob", null, null);
  const cap = wb.addWorksheet("Contas a Pagar");
  const lc = (r: number, parc: number, venc: Date) => { const row = cap.getRow(r); row.getCell(2).value = "555"; row.getCell(3).value = new Date("2026-10-01"); row.getCell(4).value = "Loja X"; row.getCell(5).value = "A prazo"; row.getCell(6).value = 900; row.getCell(7).value = 2; row.getCell(8).value = parc; row.getCell(9).value = 450; row.getCell(10).value = venc; row.getCell(11).value = "Custos_de_material"; row.getCell(12).value = "Elétrico"; row.getCell(13).value = "2024-0001 - Reforma A"; row.getCell(14).value = parc === 1 ? "Sim" : "Não"; };
  lc(7, 1, new Date("2026-11-20")); lc(8, 2, new Date("2026-12-20"));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("importação do histórico do Financeiro (D13)", () => {
  it("importa plano, contas, centros, razão e contas a pagar, com D12 e pendências", async () => {
    const r = await importarFinanceiro(db, base.ctx, await planilhaSintetica(), "Financeiro.xlsx");
    expect(r.lancamentos).toBe(6);
    expect(r.centrosCriados).toBe(2);
    expect(r.contasAPagar).toBe(1);
    expect(r.porAno[0]).toMatchObject({ ano: "2025", receitas: 51234.56, custos: 13000, impostos: 2500, resultadoOperacional: 35734.56, foraDoResultado: 391571 });
    expect(r.reclassificados).toEqual([{ subitem: "Pronampe", para: "Empréstimos e financiamentos", quantidade: 1, valor: 391571 }]);
    const tipos = Object.fromEntries(r.pendencias.map((p) => [p.tipo.split(" (")[0], p.quantidade]));
    expect(tipos).toMatchObject({ "Lançamentos sem SubItem": 1, "Valores digitados como texto": 1, "Lançamentos sem centro de custo": 1, "Linhas sem valor": 1 });
    const [pf] = await db.select().from(contaFinanceira).where(eq(contaFinanceira.nome, "Conta PF Sócio"));
    expect(pf!.contaDeSocio).toBe(true);
    const parcelas = await listarParcelas(db, base.empresaId, { tipo: "PAGAR" });
    expect(parcelas.map((p) => [Number(p.valor), p.programado])).toEqual([[450, true], [450, false]]);
    expect((await db.select().from(fornecedor).where(eq(fornecedor.nome, "Loja X"))).length).toBe(1);
    await expect(importarFinanceiro(db, base.ctx, await planilhaSintetica(), "de novo.xlsx")).rejects.toThrow("já foi importado");

    const removidos = await desfazerImportacao(db, base.ctx, r.importacaoId);
    expect(removidos).toBe(6);
    expect((await db.select().from(lancamento)).length).toBe(0);
    expect((await db.select().from(titulo)).length).toBe(0);
    const r2 = await importarFinanceiro(db, base.ctx, await planilhaSintetica(), "de novo.xlsx");
    expect(r2.lancamentos).toBe(6);
  });
});

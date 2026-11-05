import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { esquemaObra } from "@/lib/validacao";
import { RelatorioSemanalPdf } from "@/pdf/relatorio-semanal";
import { criarObra } from "@/servicos/obras";
import { importarFisico, salvarSemanas } from "@/servicos/fisico";
import { fecharMedicao, alterarSituacaoMedicao } from "@/servicos/medicoes";
import {
  adicionarFoto, carregarRelatorio, conteudoFotos, criarRelatorio, emitirRelatorio, excluirRelatorio, moverFoto, reabrirRelatorio, removerFoto,
  salvarCoresRelatorio, salvarFoto, salvarTextos,
} from "@/servicos/relatorios";
import { db, prepararEmpresa } from "./ajuda";
import { planilhaPalco } from "./palco";

let base: Awaited<ReturnType<typeof prepararEmpresa>>;
beforeEach(async () => { base = await prepararEmpresa(); });
const png = readFileSync(path.join(import.meta.dirname, "../../public/logo-masie.png"));

async function obraPalco() {
  const { obra } = await criarObra(db, base.ctx, esquemaObra.parse({
    nome: "Palco", clienteId: base.clienteId, dataInicio: "2026-10-09", dataFimContratual: "2027-01-15", valorContratoOriginal: "128861,68", percentualEntrada: "20",
  }));
  await importarFisico(db, base.ctx, obra.id, await planilhaPalco(), "ControlePalco.xlsm", { substituir: false });
  return obra;
}
const paginas = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

describe("relatório semanal", () => {
  it("cria com textos sugeridos, emite congelando os dados e reabre em nova versão", async () => {
    const o = await obraPalco();
    const r = await criarRelatorio(db, base.ctx, o.id, 4);
    expect(r.tarefasRealizadas).toContain("Gerenciamento de obra");
    expect(r.acompanhamentoPrazo).toContain("Avanço físico de 64,5%");
    await expect(criarRelatorio(db, base.ctx, o.id, 4)).rejects.toThrow("Já existe");

    await salvarTextos(db, base.ctx, o.id, r.id, { tarefasRealizadas: "Elétrica concluída", tarefasProximaSemana: "Pintura", anomalias: "Chuva na terça", acompanhamentoPrazo: "No prazo" });
    let c = await carregarRelatorio(db, base.empresaId, o.id, r.id);
    expect(c.dados.avanco.realizado).toBeCloseTo(0.645, 9);
    expect(c.dados.data).toBe("2026-10-30"); // sexta da semana 4
    expect(c.dados.contrato.saldo).toBeCloseTo(103089.344, 4);
    expect(c.dados.medicoes[0]!.valor).toBeCloseTo(46987.7705, 4);
    expect(c.dados.avanco.etapas.map((e) => e.nome)).not.toContain("Aluguel de equipamentos");

    const e = await emitirRelatorio(db, base.ctx, o.id, r.id);
    expect(e.versao).toBe(1);
    await expect(salvarTextos(db, base.ctx, o.id, r.id, { tarefasRealizadas: "x", tarefasProximaSemana: "", anomalias: "", acompanhamentoPrazo: "" })).rejects.toThrow("Reabra");

    // Mudanças depois da emissão não alteram o relatório emitido.
    await fecharMedicao(db, base.ctx, o.id, 1, "2026-10-30");
    await alterarSituacaoMedicao(db, base.ctx, o.id, 1, "PAGA", "2026-11-03");
    const ger = c.dados && (await carregarRelatorio(db, base.empresaId, o.id, r.id));
    expect(ger.dados.contrato.quitadas).toBe(0);
    await reabrirRelatorio(db, base.ctx, o.id, r.id);
    c = await carregarRelatorio(db, base.empresaId, o.id, r.id);
    expect(c.dados.contrato.quitadas).toBeCloseTo(46987.7705, 4);
    expect(c.dados.medicoes[0]!.situacao).toBe("PAGA");
    expect((await emitirRelatorio(db, base.ctx, o.id, r.id)).versao).toBe(2);
    await expect(excluirRelatorio(db, base.ctx, o.id, r.id)).rejects.toThrow("não pode ser excluído");
  });

  it("fotos: ordem, foco, legenda, limite de tipo; PDF com páginas de fotos simétricas", async () => {
    const o = await obraPalco();
    const r = await criarRelatorio(db, base.ctx, o.id, 5);
    await expect(adicionarFoto(db, base.ctx, o.id, r.id, { nome: "a.webp", tipo: "image/webp", dados: png })).rejects.toThrow("JPG ou PNG");
    const fotos = [];
    for (let i = 0; i < 7; i++) fotos.push(await adicionarFoto(db, base.ctx, o.id, r.id, { nome: `foto${i}.png`, tipo: "image/png", dados: png }));
    await moverFoto(db, base.ctx, o.id, r.id, fotos[6]!.id, -1);
    await salvarFoto(db, base.ctx, o.id, r.id, fotos[0]!.id, { legenda: "Quadro elétrico", focoX: 130, focoY: 20 });
    await removerFoto(db, base.ctx, o.id, r.id, fotos[1]!.id);
    const c = await carregarRelatorio(db, base.empresaId, o.id, r.id);
    expect(c.fotos.map((f) => f.id)).toEqual([fotos[0]!.id, fotos[2]!.id, fotos[3]!.id, fotos[4]!.id, fotos[6]!.id, fotos[5]!.id]);
    expect(c.fotos[0]).toMatchObject({ legenda: "Quadro elétrico", focoX: 100, focoY: 20 });

    const conteudos = await conteudoFotos(db, c.fotos);
    const rel = c.relatorio;
    const pdf = await renderToBuffer(RelatorioSemanalPdf({
      d: c.dados, versao: "PRÉVIA", fotos: c.fotos.map((f, i) => ({ dados: conteudos[i]!, legenda: f.legenda, focoX: f.focoX, focoY: f.focoY })),
      textos: { tarefasRealizadas: rel.tarefasRealizadas, tarefasProximaSemana: rel.tarefasProximaSemana, anomalias: "", acompanhamentoPrazo: rel.acompanhamentoPrazo },
    }));
    if (process.env.PDF_SAIDA) (await import("node:fs")).writeFileSync(process.env.PDF_SAIDA, pdf);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(paginas(pdf)).toBe(3); // situação + financeiro + 1 página com 6 fotos
    await expect(excluirRelatorio(db, base.ctx, o.id, r.id)).resolves.toBeUndefined();
  });

  it("realizado lançado depois aparece na prévia (rascunho usa dados atuais)", async () => {
    const o = await obraPalco();
    const r = await criarRelatorio(db, base.ctx, o.id, 5);
    const antes = (await carregarRelatorio(db, base.empresaId, o.id, r.id)).dados.avanco.realizado;
    const c0 = await carregarRelatorio(db, base.empresaId, o.id, r.id);
    void c0;
    const { carregarFisico } = await import("@/servicos/fisico");
    const ger = (await carregarFisico(db, base.empresaId, o.id)).servicos.find((s) => s.descricao.startsWith("Gerenciamento"))!;
    await salvarSemanas(db, base.ctx, o.id, "realizado", [{ servicoId: ger.id, semana: 5, valor: 0.1 }]);
    expect((await carregarRelatorio(db, base.empresaId, o.id, r.id)).dados.avanco.realizado).toBeCloseTo(antes + 0.1 / 50, 9);
  });

  it("cores por obra: entram na prévia, ficam congeladas na emissão e o PDF usa a paleta", async () => {
    const o = await obraPalco();
    const r = await criarRelatorio(db, base.ctx, o.id, 4);
    expect((await carregarRelatorio(db, base.empresaId, o.id, r.id)).dados.cores).toEqual({ principal: "#161616", destaque: "#f2d468", fundo: "#fbf3d3" });
    const azul = { principal: "#1f2937", destaque: "#3b82f6", fundo: "#e3edfd" };
    expect((await salvarCoresRelatorio(db, base.ctx, o.id, azul)).avisos).toEqual([]);
    await expect(salvarCoresRelatorio(db, base.ctx, o.id, { ...azul, destaque: "azul" })).rejects.toThrow("Cor inválida");
    expect((await salvarCoresRelatorio(db, base.ctx, o.id, { principal: "#f2d468", destaque: "#000000", fundo: "#333333" })).avisos).toHaveLength(2);
    await salvarCoresRelatorio(db, base.ctx, o.id, azul);
    await emitirRelatorio(db, base.ctx, o.id, r.id);
    await salvarCoresRelatorio(db, base.ctx, o.id, null); // volta ao padrão
    const c = await carregarRelatorio(db, base.empresaId, o.id, r.id);
    expect(c.dados.cores).toEqual(azul); // emitido mantém as cores da emissão
    const rel = c.relatorio;
    const pdf = await renderToBuffer(RelatorioSemanalPdf({ d: c.dados, versao: "v1", fotos: [], textos: { tarefasRealizadas: "Texto curto", tarefasProximaSemana: "", anomalias: "", acompanhamentoPrazo: "" } }));
    void rel;
    if (process.env.PDF_CORES) (await import("node:fs")).writeFileSync(process.env.PDF_CORES, pdf);
    expect(paginas(pdf)).toBe(2);
  });
});

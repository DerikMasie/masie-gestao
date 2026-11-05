import { beforeEach, describe, expect, it } from "vitest";
import { esquemaObra } from "@/lib/validacao";
import { criarObra } from "@/servicos/obras";
import { importarFisico } from "@/servicos/fisico";
import { criarLembrete, dadosPainelObra, excluirLembrete, marcarLembrete } from "@/servicos/painel-obra";
import { db, prepararEmpresa } from "./ajuda";
import { planilhaPalco } from "./palco";

let base: Awaited<ReturnType<typeof prepararEmpresa>>;
beforeEach(async () => { base = await prepararEmpresa(); });

describe("painel da obra", () => {
  it("indicadores, atividades, medições, saldos e lembretes da semana", async () => {
    const { obra } = await criarObra(db, base.ctx, esquemaObra.parse({ nome: "Palco", clienteId: base.clienteId, dataInicio: "2026-10-09", dataFimContratual: "2027-01-15", valorContratoOriginal: "128861,68", percentualEntrada: "20", situacao: "EM_ANDAMENTO" }));
    await importarFisico(db, base.ctx, obra.id, await planilhaPalco(), "p.xlsm", { substituir: false });
    const u = { id: base.admin.id, empresaId: base.empresaId, acessoTodasObras: true };

    const d = await dadosPainelObra(db, u, obra.id, 2);
    expect(d.semana).toBe(2);
    expect(d.kpis.avanco.realizado).toBeCloseTo(0.406, 9);
    expect(d.kpis.avanco.semanaRealizado).toBeCloseTo(0.259, 9);
    expect(d.executadas.length).toBeGreaterThan(0);
    expect(d.executadas[0]!.contribuicao).toBeGreaterThanOrEqual(d.executadas.at(-1)!.contribuicao);
    expect(d.daSemana.every((x) => ["CONCLUIDA", "ATRASADA", "EM_ANDAMENTO", "NAO_INICIADA"].includes(x.situacao))).toBe(true);
    expect(d.medicoes[0]!.realizado).toBeCloseTo(46987.7705, 4);
    expect(d.kpis.saldoMedir.valor).toBeCloseTo(128861.68 * 0.8 - d.kpis.executado.total, 4);

    const l1 = await criarLembrete(db, base.ctx, obra.id, { texto: "Confirmar entrega do vidro", importante: true, semana: 2 });
    await criarLembrete(db, base.ctx, obra.id, { texto: "Ligar para o síndico", importante: false, semana: 2 });
    await expect(criarLembrete(db, base.ctx, obra.id, { texto: " ", importante: false })).rejects.toThrow("Escreva");
    await marcarLembrete(db, base.ctx, obra.id, l1.id, true);
    let s3 = await dadosPainelObra(db, u, obra.id, 3);
    expect(s3.lembretes.map((x) => x.texto)).toEqual(["Ligar para o síndico"]); // pendente passa para a semana seguinte
    const s2 = await dadosPainelObra(db, u, obra.id, 2);
    expect(s2.lembretes.map((x) => [x.texto, x.feito])).toEqual([["Ligar para o síndico", false], ["Confirmar entrega do vidro", true]]);
    await excluirLembrete(db, base.ctx, obra.id, s3.lembretes[0]!.id);
    s3 = await dadosPainelObra(db, u, obra.id, 3);
    expect(s3.lembretes).toEqual([]);
  });
});

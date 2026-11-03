import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { obra, obraEtapa, orcamento } from "@/db/schema";
import { PARAMETROS_PADRAO } from "@/dominio/orcamento";
import { esquemaObra } from "@/lib/validacao";
import { criarObra } from "@/servicos/obras";
import {
  avancarFluxo, carregarOrcamento, copiarDeOutroOrcamento, excluirItem, importarPlanilha, listarOrcamentosObra, novaRevisao,
  salvarItem, salvarParametros, type DadosItem,
} from "@/servicos/orcamentos";
import { db, prepararEmpresa } from "./ajuda";

let base: Awaited<ReturnType<typeof prepararEmpresa>>;
const fixture = readFileSync(path.join(import.meta.dirname, "../fixtures/orcamento-padrao-preenchido.xlsx"));

async function novaObra(nome = "Palco", valor = "") {
  const { obra: o } = await criarObra(db, base.ctx, esquemaObra.parse({ nome, clienteId: base.clienteId, dataInicio: "2026-10-05", dataFimContratual: "2026-12-18", valorContratoOriginal: valor }));
  const [orc] = await db.select().from(orcamento).where(eq(orcamento.obraId, o.id));
  const etapas = await db.select().from(obraEtapa).where(eq(obraEtapa.obraId, o.id));
  return { obra: o, orcamentoId: orc!.id, etapa: (nome: string) => etapas.find((e) => e.nome === nome)!.id };
}
const item = (etapaId: string, extra: Partial<DadosItem> = {}): DadosItem => ({
  etapaId, grupo: null, descricao: "Item", unidade: "m²", quantidade: 10, memoriaCalculo: null, quebra: 1,
  custoUnitarioMaoDeObra: 100, custoUnitarioMaterial: 50, bdiMaoDeObra: null, bdiMaterial: null, observacao: null, ...extra,
});

beforeEach(async () => { base = await prepararEmpresa(); });

describe("orçamento", () => {
  it("nasce com os padrões Masie e calcula itens e totais", async () => {
    const o = await novaObra();
    await salvarItem(db, base.ctx, o.orcamentoId, item(o.etapa("Pintura"), { descricao: "Pintura de paredes" }));
    await salvarItem(db, base.ctx, o.orcamentoId, item(o.etapa("Gesso"), { descricao: "Forro", quantidade: 5, custoUnitarioMaterial: 0, bdiMaoDeObra: 0.5 }));
    const c = await carregarOrcamento(db, base.empresaId, o.orcamentoId);
    expect(c.parametros).toEqual(PARAMETROS_PADRAO);
    // Pintura: MO 1000×1,3 + mat 500×1,1 = 1850; Forro: MO 500×1,5 = 750 → venda 2600
    expect(c.totais.venda).toBe(2600);
    expect(c.totais.custo).toBe(2000);
    expect(c.totais.total).toBeCloseTo(2600 / 0.895, 2);
    expect(c.itens.map((i) => i.codigo)).toEqual(["12.1", "14.1"]);
  });

  it("parâmetros editáveis por orçamento recalculam tudo", async () => {
    const o = await novaObra();
    await salvarItem(db, base.ctx, o.orcamentoId, item(o.etapa("Pintura")));
    await salvarParametros(db, base.ctx, o.orcamentoId, { titulo: "Proposta A", observacoes: null, parametros: { ...PARAMETROS_PADRAO, bdiMaoDeObra: 0.35, impostos: 0.12 } });
    const c = await carregarOrcamento(db, base.empresaId, o.orcamentoId);
    expect(c.totais.venda).toBe(1350 + 550);
    expect(c.totais.imposto / c.totais.total).toBeCloseTo(0.12, 4);
    await expect(salvarParametros(db, base.ctx, o.orcamentoId, { titulo: "x", observacoes: null, parametros: { ...PARAMETROS_PADRAO, impostos: 0.9 } })).rejects.toThrow("Alíquota");
  });

  it("fluxo: enviar congela, bloqueia edição; aprovar e definir base atualiza a obra; nova revisão preserva a anterior", async () => {
    const o = await novaObra();
    const it = await salvarItem(db, base.ctx, o.orcamentoId, item(o.etapa("Pintura")));
    await expect(avancarFluxo(db, base.ctx, o.orcamentoId, "DEFINIR_BASE")).rejects.toThrow("não permitida");
    await avancarFluxo(db, base.ctx, o.orcamentoId, "ENVIAR");
    await expect(salvarItem(db, base.ctx, o.orcamentoId, item(o.etapa("Pintura")), it.id)).rejects.toThrow("rascunho");
    await expect(excluirItem(db, base.ctx, o.orcamentoId, it.id)).rejects.toThrow("rascunho");
    await avancarFluxo(db, base.ctx, o.orcamentoId, "APROVAR");
    await avancarFluxo(db, base.ctx, o.orcamentoId, "DEFINIR_BASE");
    const [ob] = await db.select().from(obra).where(eq(obra.id, o.obra.id));
    expect(Number(ob!.orcamentoCustoAprovado)).toBe(1500);
    expect(Number(ob!.valorContratoOriginal)).toBeCloseTo(1850 / 0.895, 2); // contrato estava zerado

    const rev1 = await novaRevisao(db, base.ctx, o.orcamentoId);
    expect(rev1).toMatchObject({ revisao: 1, status: "RASCUNHO" });
    await salvarItem(db, base.ctx, rev1.id, item(o.etapa("Gesso"), { descricao: "Novo forro" }));
    const lista = await listarOrcamentosObra(db, base.empresaId, o.obra.id);
    const [r0, r1] = [lista.find((x) => x.revisao === 0)!, lista.find((x) => x.revisao === 1)!];
    expect(r0.status).toBe("BASE");
    expect(r0.custo).toBe(1500);          // valores congelados da proposta original
    expect(r1.custo).toBe(3000);
    await avancarFluxo(db, base.ctx, rev1.id, "APROVAR");
    await avancarFluxo(db, base.ctx, rev1.id, "DEFINIR_BASE");
    const bases = await db.select().from(orcamento).where(and(eq(orcamento.obraId, o.obra.id), eq(orcamento.status, "BASE")));
    expect(bases.map((b) => b.revisao)).toEqual([1]);
    const [ob2] = await db.select().from(obra).where(eq(obra.id, o.obra.id));
    expect(Number(ob2!.orcamentoCustoAprovado)).toBe(3000);
    expect(Number(ob2!.valorContratoOriginal)).toBeCloseTo(1850 / 0.895, 2); // contrato já informado não é sobrescrito
  });

  it("importa o Orçamento Padrão e o total confere com a planilha", async () => {
    const o = await novaObra();
    const r = await importarPlanilha(db, base.ctx, o.obra.id, 1, fixture, "Orçamento Padrão Masie.xlsx", { ignorarSemQuantidade: false });
    expect(r).toMatchObject({ revisao: 1, itens: 207, confere: true, etapasCriadas: [] });
    expect(r.totalPropostaSistema).toBe(1956993);
    const c = await carregarOrcamento(db, base.empresaId, r.orcamentoId);
    expect(c.parametros).toMatchObject({ bdiMaoDeObra: 0.3, bdiMaterial: 0.1, impostos: 0.105, minimoMaoDeObra: 100, formaImposto: "POR_FORA", arredondamento: "REAL_ACIMA" });
    expect(c.itens.some((i) => i.grupo && i.codigo.split(".").length === 3)).toBe(true);
    expect(c.porEtapa.find((p) => p.etapa.nome === "Serviços iniciais")!.itens.length).toBeGreaterThan(0);

    // Ao trocar para o padrão do sistema (imposto por dentro, centavos), o total sobe pela correção do imposto.
    await salvarParametros(db, base.ctx, r.orcamentoId, { titulo: "x", observacoes: null, parametros: { ...c.parametros, formaImposto: "POR_DENTRO", arredondamento: "CENTAVOS" } });
    const c2 = await carregarOrcamento(db, base.empresaId, r.orcamentoId);
    expect(c2.totais.total).toBeGreaterThan(r.totalPropostaSistema);

    const sem = await importarPlanilha(db, base.ctx, o.obra.id, 1, fixture, "x.xlsx", { ignorarSemQuantidade: true });
    expect(sem.itens).toBeLessThan(207);
    await expect(importarPlanilha(db, base.ctx, o.obra.id, 1, Buffer.from("lixo"), "x.xlsx", { ignorarSemQuantidade: false })).rejects.toThrow("Não foi possível ler");
  });

  it("copia itens entre obras mapeando etapas por nome", async () => {
    const a = await novaObra("Obra A");
    const b = await novaObra("Obra B");
    await salvarItem(db, base.ctx, a.orcamentoId, item(a.etapa("Pintura"), { descricao: "Massa corrida" }));
    const r = await copiarDeOutroOrcamento(db, base.ctx, b.orcamentoId, a.orcamentoId);
    expect(r.itens).toBe(1);
    const c = await carregarOrcamento(db, base.empresaId, b.orcamentoId);
    expect(c.itens[0]).toMatchObject({ descricao: "Massa corrida", etapaId: b.etapa("Pintura") });
  });

  it("impede item em etapa de outra obra", async () => {
    const a = await novaObra("Obra A");
    const b = await novaObra("Obra B");
    await expect(salvarItem(db, base.ctx, a.orcamentoId, item(b.etapa("Pintura")))).rejects.toThrow("Etapa inválida");
  });
});

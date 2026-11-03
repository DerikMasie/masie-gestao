import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditoria, cartao, quadro, quadroColuna } from "@/db/schema";
import {
  adicionarItemChecklist, alternarItemChecklist, cartoesDoPeriodo, comentar, criarCartao, criarQuadro, detalheCartao,
  excluirColuna, listarQuadros, minhasTarefas, moverCartao, obterQuadroCompleto, salvarColuna,
} from "@/servicos/quadros";
import { ErroNegocio } from "@/servicos/contexto";
import { db, prepararEmpresa } from "./ajuda";

let base: Awaited<ReturnType<typeof prepararEmpresa>>;
const novo = (titulo: string, extra: Record<string, unknown> = {}) => ({ titulo, descricao: null, responsavelId: null, obraId: null, dataInicio: null, dataEntrega: null, ...extra });
beforeEach(async () => { base = await prepararEmpresa(); });

describe("quadro de atividades", () => {
  it("seed cria o quadro Escritório com o fluxo padrão", async () => {
    const [q] = await db.select().from(quadro).where(eq(quadro.empresaId, base.empresaId));
    const { colunas, etiquetas } = await obterQuadroCompleto(db, base.empresaId, q!.id);
    expect(q!.nome).toBe("Escritório");
    expect(colunas.map((c) => c.nome)).toEqual(["A fazer", "Em andamento", "Aguardando terceiros", "Em revisão", "Concluído"]);
    expect(colunas.at(-1)!.concluida).toBe(true);
    expect(etiquetas.length).toBe(7);
    await criarCartao(db, base.ctx, q!.id, novo("Atrasado", { dataEntrega: "2020-01-01" }));
    const lista = await listarQuadros(db, base.empresaId);
    expect(lista[0]).toMatchObject({ nome: "Escritório", abertos: 1, atrasados: 1 });
  });

  it("cria cartões no fim da primeira coluna e move entre colunas mantendo a ordem", async () => {
    const q = await criarQuadro(db, base.ctx, { nome: "Compras", descricao: null });
    const a = await criarCartao(db, base.ctx, q.id, novo("A"));
    const b = await criarCartao(db, base.ctx, q.id, novo("B"));
    const c = await criarCartao(db, base.ctx, q.id, novo("C"));
    let { colunas, cartoes } = await obterQuadroCompleto(db, base.empresaId, q.id);
    expect(cartoes.filter((x) => x.colunaId === colunas[0]!.id).map((x) => x.titulo)).toEqual(["A", "B", "C"]);

    await moverCartao(db, base.ctx, c.id, colunas[0]!.id, a.id); // C antes de A
    ({ cartoes } = await obterQuadroCompleto(db, base.empresaId, q.id));
    expect(cartoes.filter((x) => x.colunaId === colunas[0]!.id).map((x) => x.titulo)).toEqual(["C", "A", "B"]);

    const concluido = await moverCartao(db, base.ctx, b.id, colunas.at(-1)!.id, null);
    expect(concluido.concluidoEm).not.toBeNull();
    const voltou = await moverCartao(db, base.ctx, b.id, colunas[1]!.id, null);
    expect(voltou.concluidoEm).toBeNull();

    const movs = await db.select().from(auditoria).where(eq(auditoria.acao, "MOVER"));
    expect(movs.map((m) => m.descricao)).toEqual(['"B": A fazer → Concluído', '"B": Concluído → Em andamento']);
  });

  it("muitas inserções no mesmo ponto renumeram sem perder a ordem", async () => {
    const q = await criarQuadro(db, base.ctx, { nome: "Teste", descricao: null });
    const col = (await obterQuadroCompleto(db, base.empresaId, q.id)).colunas[0]!;
    const primeiro = await criarCartao(db, base.ctx, q.id, novo("fim"));
    let alvo = primeiro.id;
    for (let i = 0; i < 45; i++) { const x = await criarCartao(db, base.ctx, q.id, novo(`n${i}`)); await moverCartao(db, base.ctx, x.id, col.id, alvo); alvo = x.id; }
    const { cartoes } = await obterQuadroCompleto(db, base.empresaId, q.id);
    expect(cartoes.at(-1)!.titulo).toBe("fim");
    expect(cartoes[0]!.titulo).toBe("n44");
    expect(new Set(cartoes.map((x) => x.posicao)).size).toBe(cartoes.length);
  });

  it("respeita o limite de cartões da coluna e não exclui coluna com cartões", async () => {
    const q = await criarQuadro(db, base.ctx, { nome: "WIP", descricao: null });
    const cols = (await obterQuadroCompleto(db, base.empresaId, q.id)).colunas;
    await salvarColuna(db, base.ctx, q.id, { nome: "Em andamento", concluida: false, limite: 1 }, cols[1]!.id);
    const a = await criarCartao(db, base.ctx, q.id, novo("A"));
    const b = await criarCartao(db, base.ctx, q.id, novo("B"));
    await moverCartao(db, base.ctx, a.id, cols[1]!.id, null);
    await expect(moverCartao(db, base.ctx, b.id, cols[1]!.id, null)).rejects.toThrow("limite");
    await expect(excluirColuna(db, base.ctx, q.id, cols[1]!.id)).rejects.toThrow(ErroNegocio);
  });

  it("checklist, comentários, calendário e minhas tarefas", async () => {
    const [q] = await db.select().from(quadro).where(eq(quadro.empresaId, base.empresaId));
    const c = await criarCartao(db, base.ctx, q!.id, novo("Pagar contabilidade", { responsavelId: base.admin.id, dataEntrega: "2026-11-10" }));
    await criarCartao(db, base.ctx, q!.id, novo("Fora do mês", { dataEntrega: "2026-12-10" }));
    await adicionarItemChecklist(db, base.ctx, c.id, "Conferir boleto");
    const d1 = await detalheCartao(db, base.empresaId, c.id);
    await alternarItemChecklist(db, base.ctx, d1.checklist[0]!.id);
    await comentar(db, base.ctx, c.id, "Boleto chegou por e-mail");
    const d = await detalheCartao(db, base.empresaId, c.id);
    expect(d.checklist[0]!.feito).toBe(true);
    expect(d.comentarios[0]!.texto).toContain("Boleto");
    const nov = await cartoesDoPeriodo(db, base.empresaId, { de: "2026-10-26", ate: "2026-12-06" });
    expect(nov.map((x) => x.titulo)).toEqual(["Pagar contabilidade"]);
    expect((await minhasTarefas(db, base.empresaId, base.admin.id)).map((x) => x.titulo)).toEqual(["Pagar contabilidade"]);
  });

  it("isola empresas: não move cartão para coluna de outro quadro", async () => {
    const q1 = await criarQuadro(db, base.ctx, { nome: "Q1", descricao: null });
    const q2 = await criarQuadro(db, base.ctx, { nome: "Q2", descricao: null });
    const c = await criarCartao(db, base.ctx, q1.id, novo("X"));
    const [colQ2] = await db.select().from(quadroColuna).where(eq(quadroColuna.quadroId, q2.id));
    await expect(moverCartao(db, base.ctx, c.id, colQ2!.id, null)).rejects.toThrow("Coluna não encontrada");
    await expect(moverCartao(db, { ...base.ctx, empresaId: "00000000-0000-0000-0000-000000000000" }, c.id, colQ2!.id, null)).rejects.toThrow("Cartão não encontrado");
    expect((await db.select().from(cartao).where(eq(cartao.id, c.id)))[0]!.quadroId).toBe(q1.id);
  });
});

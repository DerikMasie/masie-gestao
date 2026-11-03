import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditoria, centroCusto, etapaPadrao, obraEtapa, obraSemana, orcamento, usuarioObra } from "@/db/schema";
import { esquemaObra } from "@/lib/validacao";
import { atualizarObra, criarObra, excluirObra, listarObras } from "@/servicos/obras";
import { indicadoresPainel } from "@/servicos/painel";
import { ErroNegocio } from "@/servicos/contexto";
import { criarUsuarioComPerfil, db, prepararEmpresa } from "./ajuda";

let base: Awaited<ReturnType<typeof prepararEmpresa>>;
const dadosObra = (extra: Record<string, unknown> = {}) =>
  esquemaObra.parse({
    nome: "Palco", clienteId: base.clienteId, dataInicio: "2026-10-09", dataFimContratual: "2026-12-18",
    valorContratoOriginal: "128.861,68", percentualEntrada: "20", orcamentoCustoAprovado: "81.857,03", situacao: "EM_ANDAMENTO", ...extra,
  });

beforeEach(async () => { base = await prepararEmpresa(); });

describe("cadastro de obra gera a estrutura operacional", () => {
  it("cria centro de custo, 19 etapas, calendário, orçamento rev. 0, vínculo e auditoria", async () => {
    const { obra, resumo } = await criarObra(db, base.ctx, dadosObra());
    expect(obra.codigo).toBe("2026-0001");
    expect(resumo).toMatchObject({ centroCusto: "OBR-2026-0001", etapas: 19, semanas: 11 });

    const [cc] = await db.select().from(centroCusto).where(eq(centroCusto.obraId, obra.id));
    expect(cc).toMatchObject({ tipo: "OBRA", codigo: "OBR-2026-0001", ativo: true });

    const etapas = await db.select().from(obraEtapa).where(eq(obraEtapa.obraId, obra.id));
    expect(etapas.map((e) => e.tipo).filter((t) => t !== "CONTRATO")).toEqual(["ADITIVO", "FATURAMENTO_DIRETO"]);

    const semanas = await db.select().from(obraSemana).where(eq(obraSemana.obraId, obra.id));
    expect(semanas.find((s) => s.numero === 1)!.inicio).toBe("2026-10-05");

    const [orc] = await db.select().from(orcamento).where(eq(orcamento.obraId, obra.id));
    expect(orc).toMatchObject({ numero: 1, revisao: 0, status: "RASCUNHO" });
    expect(orc!.parametros).toMatchObject({ bdiMaoDeObra: 0.3, bdiMaterial: 0.1, impostos: 0.105, formaImposto: "POR_DENTRO" });

    const vinc = await db.select().from(usuarioObra).where(eq(usuarioObra.obraId, obra.id));
    expect(vinc).toHaveLength(1);

    const log = await db.select().from(auditoria).where(eq(auditoria.obraId, obra.id));
    expect(log.map((l) => l.acao).sort()).toEqual(["CRIAR", "GERAR_ESTRUTURA"]);
  });

  it("numera sequencialmente, inclusive em cadastros simultâneos", async () => {
    const resultados = await Promise.all([1, 2, 3, 4].map((i) => criarObra(db, base.ctx, dadosObra({ nome: `Obra ${i}` }))));
    expect(resultados.map((r) => r.obra.codigo).sort()).toEqual(["2026-0001", "2026-0002", "2026-0003", "2026-0004"]);
  });

  it("impede código duplicado", async () => {
    await criarObra(db, base.ctx, dadosObra({ codigo: "PALCO-01" }));
    await expect(criarObra(db, base.ctx, dadosObra({ codigo: "PALCO-01" }))).rejects.toThrow(ErroNegocio);
  });

  it("usa apenas etapas padrão ativas", async () => {
    await db.update(etapaPadrao).set({ ativo: false }).where(and(eq(etapaPadrao.empresaId, base.empresaId), eq(etapaPadrao.nome, "Cobertura/funilaria")));
    const { resumo } = await criarObra(db, base.ctx, dadosObra());
    expect(resumo.etapas).toBe(18);
  });

  it("rejeita cliente de outra empresa / inexistente sem gravar nada", async () => {
    await expect(criarObra(db, base.ctx, dadosObra({ clienteId: "8d6c1f9e-0c7e-4e7c-9b62-2b8a3f0a1a11" }))).rejects.toThrow("Cliente não encontrado");
    expect((await db.select().from(centroCusto)).filter((c) => c.tipo === "OBRA")).toHaveLength(0);
  });
});

describe("edição de obra", () => {
  it("prorrogação acrescenta semanas e audita só o que mudou", async () => {
    const { obra } = await criarObra(db, base.ctx, dadosObra());
    await atualizarObra(db, base.ctx, obra.id, dadosObra({ dataFimContratual: "2027-01-15", nome: "Palco – fase 1" }));
    const semanas = await db.select().from(obraSemana).where(eq(obraSemana.obraId, obra.id));
    expect(semanas).toHaveLength(15);
    const [cc] = await db.select().from(centroCusto).where(eq(centroCusto.obraId, obra.id));
    expect(cc!.nome).toBe("2026-0001 · Palco – fase 1");
    const [ed] = await db.select().from(auditoria).where(and(eq(auditoria.obraId, obra.id), eq(auditoria.acao, "EDITAR")));
    expect(Object.keys(ed!.depois as object).sort()).toEqual(["dataFimContratual", "nome"]);
  });

  it("exclusão lógica inativa o centro de custo", async () => {
    const { obra } = await criarObra(db, base.ctx, dadosObra());
    await excluirObra(db, base.ctx, obra.id);
    const lista = await listarObras(db, { id: base.admin.id, empresaId: base.empresaId, acessoTodasObras: true });
    expect(lista).toHaveLength(0);
    const [cc] = await db.select().from(centroCusto).where(eq(centroCusto.obraId, obra.id));
    expect(cc!.ativo).toBe(false);
  });
});

describe("acesso por obra", () => {
  it("engenharia só enxerga obras vinculadas; gestor é vinculado automaticamente", async () => {
    const eng = await criarUsuarioComPerfil(base.empresaId, "eng@teste.com", "Engenharia");
    await criarObra(db, base.ctx, dadosObra({ nome: "Sem vínculo" }));
    await criarObra(db, base.ctx, dadosObra({ nome: "Com vínculo", gestorId: eng.usuario.id }));
    const visiveis = await listarObras(db, { id: eng.usuario.id, empresaId: base.empresaId, acessoTodasObras: eng.perfil.acessoTodasObras });
    expect(visiveis.map((o) => o.nome)).toEqual(["Com vínculo"]);
  });
});

describe("dashboard", () => {
  it("conta ativas, atrasadas e carteira", async () => {
    await criarObra(db, base.ctx, dadosObra());
    await criarObra(db, base.ctx, dadosObra({ nome: "Atrasada", dataInicio: "2026-01-05", dataFimContratual: "2026-06-30", valorContratoOriginal: "50.000,00", orcamentoCustoAprovado: "" }));
    await criarObra(db, base.ctx, dadosObra({ nome: "Orçando", situacao: "EM_ORCAMENTO" }));
    const i = await indicadoresPainel(db, { id: base.admin.id, empresaId: base.empresaId, acessoTodasObras: true }, {}, "2026-11-03");
    expect(i).toMatchObject({ total: 3, ativas: 2, atrasadas: 1, noPrazo: 1, carteiraContratada: 178861.68 });
    expect(i.margemPrevistaPonderada).toBeCloseTo(0.3648, 4); // só obras com orçamento informado
    expect(i.alertas.map((a) => a.tipo).sort()).toEqual(["ATRASO", "SEM_ORCAMENTO"]);
  });
});

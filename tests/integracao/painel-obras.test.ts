import { beforeEach, describe, expect, it } from "vitest";
import { esquemaObra } from "@/lib/validacao";
import { atualizarObra, criarObra } from "@/servicos/obras";
import { importarFisico } from "@/servicos/fisico";
import { fecharMedicao } from "@/servicos/medicoes";
import { painelObras } from "@/servicos/painel-obras";
import { criarUsuarioComPerfil, db, prepararEmpresa } from "./ajuda";
import { planilhaPalco } from "./palco";

let base: Awaited<ReturnType<typeof prepararEmpresa>>;
beforeEach(async () => { base = await prepararEmpresa(); });
const dados = (x: Record<string, string>) => esquemaObra.parse({ clienteId: base.clienteId, valorContratoOriginal: "128861,68", percentualEntrada: "20", situacao: "EM_ANDAMENTO", ...x });

describe("painel de obras", () => {
  it("cartões das obras ativas com ritmo, medições e pendências; respeita o acesso por obra", async () => {
    const { obra: palco } = await criarObra(db, base.ctx, dados({ nome: "Palco", dataInicio: "2026-10-09", dataFimContratual: "2027-01-15" }));
    await importarFisico(db, base.ctx, palco.id, await planilhaPalco(), "p.xlsm", { substituir: false });
    await fecharMedicao(db, base.ctx, palco.id, 1, "2026-11-06");
    const { obra: nova } = await criarObra(db, base.ctx, dados({ nome: "Sem planilha", dataInicio: "2026-11-02", dataFimContratual: "2027-03-01" }));
    const { obra: concluida } = await criarObra(db, base.ctx, dados({ nome: "Concluída", dataInicio: "2026-01-05", dataFimContratual: "2026-06-30" }));
    await atualizarObra(db, base.ctx, concluida.id, dados({ nome: "Concluída", dataInicio: "2026-01-05", dataFimContratual: "2026-06-30", situacao: "CONCLUIDA", dataConclusao: "2026-06-30" }));

    const u = { id: base.admin.id, empresaId: base.empresaId, acessoTodasObras: true };
    const c = await painelObras(db, u, "2026-11-06"); // sexta da semana 5
    expect(c.map((x) => x.nome)).toEqual(["Palco", "Sem planilha"]);
    const p = c[0]!;
    expect(p.realizado).toBeCloseTo(0.645, 9);
    expect(p.previsto).toBeCloseTo(0.67, 9);
    expect(p.ritmo).toBe("ATENCAO");
    expect(p.medicaoAberta!.numero).toBe(2);
    expect(p.executado).toBeCloseTo(77197.6466, 4);
    expect(p.pendencias.map((x) => x.tipo)).toEqual(expect.arrayContaining(["MEDICAO_A_FECHAR", "MEDICAO_NAO_PAGA", "RELATORIO_NAO_EMITIDO", "ACERTADO_ACIMA_VERBA", "FORNECEDOR_A_PAGAR"]));
    expect(c[1]!.ritmo).toBe("SEM_CRONOGRAMA");
    expect(c[1]!.pendencias.map((x) => x.tipo)).toEqual(["SEM_PLANILHA"]);

    const ana = await criarUsuarioComPerfil(base.empresaId, "ana@teste.com", "Engenharia");
    expect(await painelObras(db, { id: ana.usuario.id, empresaId: base.empresaId, acessoTodasObras: false }, "2026-11-06")).toEqual([]);
    void nova;
  });
});

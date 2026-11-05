import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { cliente } from "@/db/schema";
import { esquemaObra } from "@/lib/validacao";
import { atualizarObra, criarObra } from "@/servicos/obras";
import { db, prepararEmpresa } from "./ajuda";

let base: Awaited<ReturnType<typeof prepararEmpresa>>;
beforeEach(async () => { base = await prepararEmpresa(); });
const obra = (x: Record<string, string>) => esquemaObra.parse({ nome: "Obra", dataInicio: "2026-11-09", dataFimContratual: "2027-02-26", ...x });

describe("cliente digitado no cadastro da obra", () => {
  it("cadastra o cliente novo junto com a obra e reaproveita o existente pelo nome", async () => {
    const a = await criarObra(db, base.ctx, obra({ nome: "Loja Centro", clienteNome: "  Construtora Horizonte  LTDA " }));
    const [novo] = await db.select().from(cliente).where(eq(cliente.id, a.obra.clienteId));
    expect(novo).toMatchObject({ nome: "Construtora Horizonte LTDA", tipoPessoa: "PJ" });

    const b = await criarObra(db, base.ctx, obra({ nome: "Galpão", clienteNome: "construtora horizonte ltda" }));
    expect(b.obra.clienteId).toBe(a.obra.clienteId);
    const c = await criarObra(db, base.ctx, obra({ nome: "Casa", clienteNome: "Maria Souza" }));
    expect((await db.select().from(cliente).where(eq(cliente.id, c.obra.clienteId)))[0]!.tipoPessoa).toBe("PF");
    expect((await db.select().from(cliente).where(eq(cliente.empresaId, base.empresaId))).length).toBe(3); // Cliente Palco + 2 novos

    expect(() => obra({ nome: "Sem cliente" })).toThrow("Informe o cliente");
  });

  it("na edição mantém o cliente atual e troca quando outro nome é digitado", async () => {
    const a = await criarObra(db, base.ctx, obra({ clienteId: base.clienteId }));
    const mesma = await atualizarObra(db, base.ctx, a.obra.id, obra({ clienteId: base.clienteId, clienteNome: "cliente palco" }));
    expect(mesma.clienteId).toBe(base.clienteId);
    const outra = await atualizarObra(db, base.ctx, a.obra.id, obra({ clienteId: base.clienteId, clienteNome: "Outro Cliente" }));
    expect(outra.clienteId).not.toBe(base.clienteId);
  });
});

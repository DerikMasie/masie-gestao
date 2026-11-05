import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { arquivoConteudo } from "@/db/schema";
import { anexarArquivo, lerConteudo } from "@/servicos/anexos";
import { db, prepararEmpresa } from "./ajuda";

let base: Awaited<ReturnType<typeof prepararEmpresa>>;
beforeEach(async () => { base = await prepararEmpresa(); process.env.ARMAZENAMENTO = "banco"; });
afterEach(() => { delete process.env.ARMAZENAMENTO; });

describe("anexos guardados no banco (hospedagem sem disco, ex.: Vercel)", () => {
  it("grava e lê o conteúdo pela tabela arquivo_conteudo", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const a = await anexarArquivo(db, base.ctx, { entidade: "obra", entidadeId: base.clienteId }, { nome: "foto.png", tipo: "image/png", dados: png });
    expect(a.caminho.startsWith("db:")).toBe(true);
    expect((await lerConteudo(a.caminho, db)).equals(png)).toBe(true);
    expect(await db.select().from(arquivoConteudo).where(eq(arquivoConteudo.chave, a.caminho))).toHaveLength(1);
  });
});

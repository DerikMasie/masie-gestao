import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { fornecedor, sessao } from "@/db/schema";
import { esquemaFornecedor } from "@/lib/validacao";
import { lerDadosBancarios, listarFornecedores, salvarFornecedor } from "@/servicos/cadastros";
import { autenticar, MAX_TENTATIVAS, validarSessao } from "@/servicos/sessoes";
import { atualizarUsuario, trocarPropriaSenha } from "@/servicos/usuarios";
import { db, prepararEmpresa } from "./ajuda";

let base: Awaited<ReturnType<typeof prepararEmpresa>>;
beforeEach(async () => { base = await prepararEmpresa(); });

describe("login e sessão", () => {
  it("autentica, cria sessão com token só em hash e valida", async () => {
    const r = await autenticar(db, "ADMIN@teste.com ", "Senha123", { ip: "1.1.1.1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.deveTrocarSenha).toBe(true);
    const sessoes = await db.select().from(sessao);
    expect(sessoes[0]!.id).not.toBe(r.token);
    const v = await validarSessao(db, r.token);
    expect(v?.usuario.perfil.nome).toBe("Administrador");
    expect(await validarSessao(db, "token-falso")).toBeNull();
  });

  it(`bloqueia após ${MAX_TENTATIVAS} falhas`, async () => {
    for (let i = 0; i < MAX_TENTATIVAS; i++) expect((await autenticar(db, "admin@teste.com", "errada1", {})).ok).toBe(false);
    const r = await autenticar(db, "admin@teste.com", "Senha123", {});
    expect(r).toEqual({ ok: false, motivo: "BLOQUEADO" });
  });

  it("troca de senha derruba as outras sessões", async () => {
    const a = await autenticar(db, "admin@teste.com", "Senha123", {});
    const b = await autenticar(db, "admin@teste.com", "Senha123", {});
    if (!a.ok || !b.ok) throw new Error();
    await trocarPropriaSenha(db, base.ctx, "Senha123", "NovaSenha9", a.token);
    expect(await validarSessao(db, a.token)).not.toBeNull();
    expect(await validarSessao(db, b.token)).toBeNull();
    expect((await autenticar(db, "admin@teste.com", "NovaSenha9", {})).ok).toBe(true);
  });

  it("não permite remover o último administrador", async () => {
    const perfis = await db.query.perfil.findMany();
    const eng = perfis.find((p) => p.nome === "Engenharia")!;
    await expect(atualizarUsuario(db, { ...base.ctx, usuarioId: "00000000-0000-0000-0000-000000000000" }, base.admin.id,
      { nome: "Admin", email: "admin@teste.com", perfilId: eng.id, ativo: true, cargo: null, telefone: null })).rejects.toThrow("Administrador");
  });
});

describe("fornecedores (LGPD)", () => {
  it("guarda dados bancários cifrados e registra quem visualizou", async () => {
    const f = await salvarFornecedor(db, base.ctx, esquemaFornecedor.parse({ nome: "Everton", especialidade: "Eletricista" }),
      { nomeDeposito: "Everton S.", banco: null, agencia: null, conta: null, pix: "everton@pix.com" });
    const [bruto] = await db.select().from(fornecedor).where(eq(fornecedor.id, f.id));
    expect(bruto!.dadosBancariosCifrado).not.toContain("everton@pix.com");
    const lista = await listarFornecedores(db, base.empresaId);
    expect(lista[0]).not.toHaveProperty("dadosBancariosCifrado");
    expect(lista[0]!.temDadosBancarios).toBe(true);
    expect((await lerDadosBancarios(db, base.ctx, f.id))?.pix).toBe("everton@pix.com");
    const log = await db.query.auditoria.findMany({ where: (a, { eq }) => eq(a.acao, "VER_DADOS_SENSIVEIS") });
    expect(log).toHaveLength(1);
  });

  it("impede fornecedor duplicado por nome (\"Emerson\" × \"emerson\" — erro 18)", async () => {
    await salvarFornecedor(db, base.ctx, esquemaFornecedor.parse({ nome: "Emerson" }), undefined);
    await expect(salvarFornecedor(db, base.ctx, esquemaFornecedor.parse({ nome: "emerson" }), undefined)).rejects.toThrow("nome conhecido");
  });
});

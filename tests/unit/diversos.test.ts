import { describe, expect, it } from "vitest";
import { diferencas, limparParaAuditoria } from "@/dominio/auditoria";
import { cnpjValido, cpfValido, formatarDocumento } from "@/dominio/documentos";
import { lerNumero } from "@/dominio/formato";
import { normalizarMatriz, pode, PERFIS_PADRAO } from "@/dominio/permissoes";
import { cifrar, cifrarJson, decifrar, decifrarJson } from "@/lib/cripto";
import { esquemaObra } from "@/lib/validacao";

describe("documentos", () => {
  it("valida CNPJ da Masie e CPF", () => {
    expect(cnpjValido("27.527.577/0001-02")).toBe(true);
    expect(cnpjValido("27.527.577/0001-03")).toBe(false);
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(formatarDocumento("27527577000102")).toBe("27.527.577/0001-02");
  });
});

describe("leitura de números digitados", () => {
  it.each([["1.234,56", 1234.56], ["1234,56", 1234.56], ["1234.56", 1234.56], ["R$ 128.861,68", 128861.68], ["20%", 20], ["1.000", 1000], ["", null]])("%s", (t, v) => {
    expect(lerNumero(t)).toBe(v);
  });
  it("inválido vira NaN", () => expect(lerNumero("abc")).toBeNaN());
});

describe("permissões", () => {
  const [admin, diretoria, engenharia, , colaborador] = PERFIS_PADRAO;
  it("perfis padrão do briefing", () => {
    expect(pode(admin!.permissoes, "usuarios", "excluir")).toBe(true);
    expect(pode(diretoria!.permissoes, "financeiro", "aprovar")).toBe(true);
    expect(pode(diretoria!.permissoes, "financeiro", "criar")).toBe(false);
    expect(pode(engenharia!.permissoes, "financeiro")).toBe(false);
    expect(engenharia!.acessoTodasObras).toBe(false);
    expect(pode(colaborador!.permissoes, "fornecedores_bancarios")).toBe(false);
  });
  it("normaliza matriz vinda de formulário", () => {
    expect(normalizarMatriz({ obras: ["editar", "hackear"], dashboard: ["excluir"], inexistente: ["ver"] }))
      .toEqual({ obras: ["ver", "editar"] });
  });
});

describe("criptografia de dados sensíveis", () => {
  it("cifra e decifra com autenticação", () => {
    const c = cifrar("PIX 123");
    expect(c).not.toContain("PIX");
    expect(decifrar(c)).toBe("PIX 123");
    const adulterado = c.slice(0, -4) + (c.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => decifrar(adulterado)).toThrow();
  });
  it("JSON vazio não gera cifra", () => {
    expect(cifrarJson({ pix: "", banco: null })).toBeNull();
    expect(decifrarJson<{ pix: string }>(cifrarJson({ pix: "x@y.com" }))).toEqual({ pix: "x@y.com" });
  });
});

describe("auditoria", () => {
  it("grava só campos alterados e nunca segredos", () => {
    const d = diferencas({ nome: "A", senhaHash: "x", valor: "10.00" }, { nome: "B", senhaHash: "y", valor: "10.00" });
    expect(d).toEqual({ antes: { nome: "A" }, depois: { nome: "B" } });
    expect(diferencas({ nome: "A" }, { nome: "A" })).toBeNull();
    expect(limparParaAuditoria({ senhaHash: "s", dadosBancariosCifrado: "c", nome: "N" })).toEqual({ dadosBancarios: "[protegido]", nome: "N" });
  });
});

describe("validação de obra", () => {
  const base = { nome: "Palco", clienteId: "8d6c1f9e-0c7e-4e7c-9b62-2b8a3f0a1a11", dataInicio: "2026-10-05", dataFimContratual: "2026-12-18" };
  it("converte valores em formato brasileiro", () => {
    const r = esquemaObra.parse({ ...base, valorContratoOriginal: "128.861,68", percentualEntrada: "20", margemPrevista: "" });
    expect(r.valorContratoOriginal).toBe("128861.68");
    expect(r.percentualEntrada).toBe("0.2000");
    expect(r.margemPrevista).toBeNull();
    expect(r.situacao).toBe("EM_ORCAMENTO");
  });
  it("rejeita término antes do início e entrada acima de 100%", () => {
    const r = esquemaObra.safeParse({ ...base, dataFimContratual: "2026-01-01", percentualEntrada: "120" });
    expect(r.success).toBe(false);
    const campos = r.error!.issues.map((i) => i.path[0]);
    expect(campos).toContain("percentualEntrada");
  });
});

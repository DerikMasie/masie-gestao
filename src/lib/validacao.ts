import { z } from "zod";
import { paraData } from "@/dominio/calendario";
import { documentoValido, somenteDigitos } from "@/dominio/documentos";
import { lerNumero } from "@/dominio/formato";
import { CODIGO_OBRA_REGEX, SITUACOES_OBRA } from "@/dominio/obra";

const vazioParaNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v);

export const textoOpcional = (max = 500) => z.preprocess(vazioParaNull, z.string().max(max, `Máximo de ${max} caracteres`).nullable().default(null));
export const textoObrigatorio = (rotulo: string, max = 200) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string({ error: `${rotulo} é obrigatório` }).min(1, `${rotulo} é obrigatório`).max(max, `Máximo de ${max} caracteres`));

export const dataIso = (rotulo: string) =>
  z.string({ error: `${rotulo} é obrigatória` }).refine((v) => {
    try { paraData(v); return true; } catch { return false; }
  }, `${rotulo} inválida`);

export const dataIsoOpcional = (rotulo: string) => z.preprocess(vazioParaNull, dataIso(rotulo).nullable().default(null));

/** Valor monetário digitado ("1.234,56") → string numérica "1234.56" para o banco. */
export const dinheiro = (rotulo: string, { obrigatorio = false } = {}) =>
  z.preprocess((v) => {
    const n = lerNumero(typeof v === "string" ? v : v == null ? null : String(v));
    return n == null ? (obrigatorio ? undefined : 0) : n;
  }, z.number({ error: `${rotulo} inválido` }).finite(`${rotulo} inválido`).min(0, `${rotulo} não pode ser negativo`).max(999_999_999_999, `${rotulo} muito alto`))
    .transform((n) => n.toFixed(2));

/** Percentual digitado em % ("20" ou "20,5") → fração string "0.2050". */
export const percentualDigitado = (rotulo: string, { obrigatorio = false, max = 100 } = {}) =>
  z.preprocess((v) => {
    const n = lerNumero(typeof v === "string" ? v : v == null ? null : String(v));
    return n == null ? (obrigatorio ? undefined : null) : n;
  }, z.number({ error: `${rotulo} inválido` }).finite().min(0, `${rotulo} não pode ser negativo`).max(max, `${rotulo} deve ser no máximo ${max}%`).nullable())
    .transform((n) => (n == null ? null : (n / 100).toFixed(4)));

const uuidOpcional = z.preprocess(vazioParaNull, z.uuid("Seleção inválida").nullable().default(null));

const documento = z.preprocess(vazioParaNull, z.string().nullable().default(null)).transform((v) => (v ? somenteDigitos(v) : null));

export const esquemaCliente = z.object({
  tipoPessoa: z.enum(["PF", "PJ"]).default("PF"),
  nome: textoObrigatorio("Nome"),
  documento,
  email: z.preprocess(vazioParaNull, z.email("E-mail inválido").nullable().default(null)),
  telefone: textoOpcional(40),
  endereco: textoOpcional(300),
  observacoes: textoOpcional(2000),
}).superRefine((d, ctx) => {
  if (d.documento && !documentoValido(d.documento, d.tipoPessoa)) {
    ctx.addIssue({ code: "custom", path: ["documento"], message: d.tipoPessoa === "PF" ? "CPF inválido" : "CNPJ inválido" });
  }
});
export type DadosCliente = z.infer<typeof esquemaCliente>;

export const esquemaFornecedor = z.object({
  nome: textoObrigatorio("Nome conhecido"),
  razaoSocial: textoOpcional(200),
  tipoPessoa: z.enum(["PF", "PJ"]).default("PF"),
  documento,
  especialidade: textoOpcional(100),
  telefone: textoOpcional(40),
  email: z.preprocess(vazioParaNull, z.email("E-mail inválido").nullable().default(null)),
  observacoes: textoOpcional(2000),
  ativo: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()).default(true),
}).superRefine((d, ctx) => {
  if (d.documento && !documentoValido(d.documento, d.tipoPessoa)) {
    ctx.addIssue({ code: "custom", path: ["documento"], message: d.tipoPessoa === "PF" ? "CPF inválido" : "CNPJ inválido" });
  }
});
export type DadosFornecedor = z.infer<typeof esquemaFornecedor>;

export const esquemaDadosBancarios = z.object({
  nomeDeposito: textoOpcional(200),
  banco: textoOpcional(100),
  agencia: textoOpcional(20),
  conta: textoOpcional(30),
  pix: textoOpcional(200),
});
export type DadosBancarios = z.infer<typeof esquemaDadosBancarios>;

export const esquemaObra = z.object({
  codigo: z.preprocess(vazioParaNull, z.string().regex(CODIGO_OBRA_REGEX, "Código inválido (use letras, números, ponto, hífen)").nullable().default(null)),
  nome: textoObrigatorio("Nome da obra"),
  clienteId: z.uuid("Selecione o cliente"),
  endereco: textoOpcional(300),
  cidade: textoOpcional(100),
  uf: z.preprocess(vazioParaNull, z.string().regex(/^[A-Za-z]{2}$/, "UF inválida").transform((v) => v.toUpperCase()).nullable().default(null)),
  tipoObra: textoOpcional(100),
  responsavelTecnicoId: uuidOpcional,
  gestorId: uuidOpcional,
  dataInicio: dataIso("Data de início"),
  dataFimContratual: dataIso("Data de término contratual"),
  dataConclusao: dataIsoOpcional("Data de conclusão"),
  valorContratoOriginal: dinheiro("Valor do contrato"),
  percentualEntrada: percentualDigitado("% de entrada").transform((v) => v ?? "0"),
  orcamentoCustoAprovado: dinheiro("Orçamento de custos"),
  margemPrevista: percentualDigitado("Margem prevista"),
  situacao: z.enum(Object.keys(SITUACOES_OBRA) as [keyof typeof SITUACOES_OBRA, ...(keyof typeof SITUACOES_OBRA)[]]).default("EM_ORCAMENTO"),
  observacoes: textoOpcional(5000),
}).superRefine((d, ctx) => {
  if (d.dataFimContratual < d.dataInicio) ctx.addIssue({ code: "custom", path: ["dataFimContratual"], message: "O término deve ser posterior ao início" });
  if (d.situacao === "CONCLUIDA" && !d.dataConclusao) ctx.addIssue({ code: "custom", path: ["dataConclusao"], message: "Informe a data de conclusão" });
  if (d.dataConclusao && d.dataConclusao < d.dataInicio) ctx.addIssue({ code: "custom", path: ["dataConclusao"], message: "A conclusão deve ser posterior ao início" });
});
export type DadosObra = z.infer<typeof esquemaObra>;

export const esquemaUsuario = z.object({
  nome: textoObrigatorio("Nome"),
  email: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.email("E-mail inválido")),
  perfilId: z.uuid("Selecione o perfil"),
  cargo: textoOpcional(100),
  telefone: textoOpcional(40),
  ativo: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()).default(true),
});
export type DadosUsuario = z.infer<typeof esquemaUsuario>;

export const esquemaEmpresa = z.object({
  razaoSocial: textoObrigatorio("Razão social"),
  nomeFantasia: textoObrigatorio("Nome fantasia"),
  cnpj: documento.refine((v) => !v || documentoValido(v, "PJ"), "CNPJ inválido"),
  endereco: textoOpcional(300),
  telefone: textoOpcional(40),
  email: z.preprocess(vazioParaNull, z.email("E-mail inválido").nullable().default(null)),
  banco: textoOpcional(100),
  agencia: textoOpcional(20),
  conta: textoOpcional(30),
  pix: textoOpcional(200),
  corPrimaria: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida"),
}).and(esquemaParametrosOrcamento());

/** Parâmetros de orçamento digitados em % (usados na empresa e em cada orçamento). */
export function esquemaParametrosOrcamento() {
  const pct = (r: string, max = 1000) => percentualDigitado(r, { obrigatorio: true, max }).transform((v) => Number(v));
  return z.object({
    bdiMaoDeObra: pct("BDI de mão de obra"),
    bdiMaterial: pct("BDI de material"),
    impostos: pct("Impostos", 59),
    formaImposto: z.enum(["POR_DENTRO", "POR_FORA"]).default("POR_DENTRO"),
    adicionalHorario: percentualDigitado("Adicional de horário", { max: 1000 }).transform((v) => Number(v ?? 0)),
    adicionalLocal: percentualDigitado("Adicional de local", { max: 1000 }).transform((v) => Number(v ?? 0)),
    minimoMaoDeObra: dinheiro("Valor mínimo de MO").transform((v) => Number(v)),
    arredondamento: z.enum(["CENTAVOS", "REAL_ACIMA"]).default("CENTAVOS"),
  });
}

/** Converte FormData em objeto simples (checkbox ausente = campo ausente). */
export function formParaObjeto(fd: FormData): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v === "string") o[k] = v;
  }
  return o;
}

export type ErrosCampo = Record<string, string>;

export function errosDoZod(e: z.ZodError): ErrosCampo {
  const r: ErrosCampo = {};
  for (const i of e.issues) {
    const k = i.path.join(".") || "_";
    r[k] ??= i.message;
  }
  return r;
}

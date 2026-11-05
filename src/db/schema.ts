/**
 * Esquema do banco MASIE GESTÃO — Fase 2 (núcleo, segurança, cadastros, obras).
 * Convenções: snake_case no banco, valores monetários numeric(14,2), percentuais numeric(7,4)
 * (0.2000 = 20%), exclusão lógica por `excluido_em`, `empresa_id` em todas as tabelas de negócio.
 */
import { sql } from "drizzle-orm";
import {
  bigserial, boolean, customType, date, doublePrecision, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey,
  text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import type { MatrizPermissoes } from "@/dominio/permissoes";
import type { ParametrosOrcamento } from "@/dominio/orcamento";

const id = () => uuid().primaryKey().defaultRandom();
const criadoEm = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const atualizadoEm = () => timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());
const dinheiro = () => numeric({ precision: 14, scale: 2 });
const percentual = () => numeric({ precision: 7, scale: 4 });

// ───────────────────────────── Empresa e segurança ─────────────────────────────

export const empresa = pgTable("empresa", {
  id: id(),
  razaoSocial: text().notNull(),
  nomeFantasia: text().notNull(),
  cnpj: text(),
  endereco: text(),
  telefone: text(),
  email: text(),
  banco: text(),
  agencia: text(),
  conta: text(),
  pix: text(),
  corPrimaria: text().notNull().default("#111111"),
  parametrosOrcamento: jsonb().$type<ParametrosOrcamento>().notNull(),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

export const perfil = pgTable("perfil", {
  id: id(),
  empresaId: uuid().notNull().references(() => empresa.id),
  nome: text().notNull(),
  descricao: text(),
  /** Se verdadeiro, o perfil enxerga todas as obras; senão só as obras às quais o usuário foi vinculado. */
  acessoTodasObras: boolean().notNull().default(false),
  /** Perfis de sistema não podem ser excluídos (podem ter permissões ajustadas, exceto Administrador). */
  sistema: boolean().notNull().default(false),
  permissoes: jsonb().$type<MatrizPermissoes>().notNull(),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
}, (t) => [uniqueIndex("perfil_empresa_nome_uq").on(t.empresaId, t.nome)]);

export const usuario = pgTable("usuario", {
  id: id(),
  empresaId: uuid().notNull().references(() => empresa.id),
  nome: text().notNull(),
  email: text().notNull(),
  senhaHash: text().notNull(),
  perfilId: uuid().notNull().references(() => perfil.id),
  cargo: text(),
  telefone: text(),
  ativo: boolean().notNull().default(true),
  deveTrocarSenha: boolean().notNull().default(true),
  ultimoLoginEm: timestamp({ withTimezone: true }),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
}, (t) => [uniqueIndex("usuario_email_uq").on(sql`lower(${t.email})`)]);

export const sessao = pgTable("sessao", {
  /** SHA-256 do token do cookie — o token em si nunca é armazenado. */
  id: text().primaryKey(),
  usuarioId: uuid().notNull().references(() => usuario.id, { onDelete: "cascade" }),
  expiraEm: timestamp({ withTimezone: true }).notNull(),
  ip: text(),
  userAgent: text(),
  criadoEm: criadoEm(),
}, (t) => [index("sessao_usuario_idx").on(t.usuarioId)]);

export const tentativaLogin = pgTable("tentativa_login", {
  id: bigserial({ mode: "number" }).primaryKey(),
  email: text().notNull(),
  ip: text(),
  sucesso: boolean().notNull(),
  criadoEm: criadoEm(),
}, (t) => [index("tentativa_login_email_idx").on(t.email, t.criadoEm), index("tentativa_login_ip_idx").on(t.ip, t.criadoEm)]);

export const acaoAuditoria = pgEnum("acao_auditoria", [
  "CRIAR", "EDITAR", "EXCLUIR", "RESTAURAR", "LOGIN", "LOGIN_FALHOU", "LOGOUT", "TROCAR_SENHA",
  "VER_DADOS_SENSIVEIS", "ANEXAR", "REMOVER_ANEXO", "GERAR_ESTRUTURA", "MOVER", "COMENTAR",
]);

export const auditoria = pgTable("auditoria", {
  id: bigserial({ mode: "number" }).primaryKey(),
  empresaId: uuid().references(() => empresa.id),
  usuarioId: uuid().references(() => usuario.id),
  acao: acaoAuditoria().notNull(),
  entidade: text().notNull(),
  entidadeId: text(),
  obraId: uuid(),
  descricao: text(),
  antes: jsonb(),
  depois: jsonb(),
  ip: text(),
  criadoEm: criadoEm(),
}, (t) => [
  index("auditoria_entidade_idx").on(t.entidade, t.entidadeId),
  index("auditoria_obra_idx").on(t.obraId, t.criadoEm),
  index("auditoria_data_idx").on(t.empresaId, t.criadoEm),
]);

// ───────────────────────────── Cadastros ─────────────────────────────

export const tipoPessoa = pgEnum("tipo_pessoa", ["PF", "PJ"]);

export const cliente = pgTable("cliente", {
  id: id(),
  empresaId: uuid().notNull().references(() => empresa.id),
  tipoPessoa: tipoPessoa().notNull().default("PF"),
  nome: text().notNull(),
  documento: text(),
  email: text(),
  telefone: text(),
  endereco: text(),
  observacoes: text(),
  ativo: boolean().notNull().default(true),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
  excluidoEm: timestamp({ withTimezone: true }),
}, (t) => [uniqueIndex("cliente_documento_uq").on(t.empresaId, t.documento).where(sql`${t.documento} is not null and ${t.excluidoEm} is null`)]);

export const fornecedor = pgTable("fornecedor", {
  id: id(),
  empresaId: uuid().notNull().references(() => empresa.id),
  /** "Nome conhecido" — como a equipe chama o prestador (ex.: "Everton"). */
  nome: text().notNull(),
  razaoSocial: text(),
  tipoPessoa: tipoPessoa().notNull().default("PF"),
  documento: text(),
  especialidade: text(),
  telefone: text(),
  email: text(),
  /** JSON cifrado (AES-256-GCM) com nome para depósito, banco, agência, conta e PIX. */
  dadosBancariosCifrado: text(),
  observacoes: text(),
  ativo: boolean().notNull().default(true),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
  excluidoEm: timestamp({ withTimezone: true }),
}, (t) => [
  uniqueIndex("fornecedor_documento_uq").on(t.empresaId, t.documento).where(sql`${t.documento} is not null and ${t.excluidoEm} is null`),
  uniqueIndex("fornecedor_nome_uq").on(t.empresaId, sql`lower(${t.nome})`).where(sql`${t.excluidoEm} is null`),
]);

export const tipoEtapa = pgEnum("tipo_etapa", ["CONTRATO", "ADITIVO", "FATURAMENTO_DIRETO"]);

/** Etapas padrão da EAP (as 19 etapas da planilha AO), copiadas para cada nova obra. */
export const etapaPadrao = pgTable("etapa_padrao", {
  id: id(),
  empresaId: uuid().notNull().references(() => empresa.id),
  ordem: integer().notNull(),
  nome: text().notNull(),
  tipo: tipoEtapa().notNull().default("CONTRATO"),
  ativo: boolean().notNull().default(true),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

// ───────────────────────────── Obras ─────────────────────────────

export const situacaoObra = pgEnum("situacao_obra", [
  "PROSPECCAO", "EM_ORCAMENTO", "CONTRATADA", "EM_ANDAMENTO", "PARALISADA", "CONCLUIDA", "CANCELADA",
]);

export const obra = pgTable("obra", {
  id: id(),
  empresaId: uuid().notNull().references(() => empresa.id),
  codigo: text().notNull(),
  nome: text().notNull(),
  clienteId: uuid().notNull().references(() => cliente.id),
  endereco: text(),
  cidade: text(),
  uf: text(),
  tipoObra: text(),
  responsavelTecnicoId: uuid().references(() => usuario.id),
  gestorId: uuid().references(() => usuario.id),
  dataInicio: date({ mode: "string" }).notNull(),
  dataFimContratual: date({ mode: "string" }).notNull(),
  dataConclusao: date({ mode: "string" }),
  valorContratoOriginal: dinheiro().notNull().default("0"),
  percentualEntrada: percentual().notNull().default("0"),
  /** Período de fechamento da medição, em semanas (1 a 4). Padrão: quinzenal (2). */
  semanasPorMedicao: integer().notNull().default(2),
  /** Provisório na Fase 2: na Fase 3 passa a ser derivado do orçamento-base aprovado. */
  orcamentoCustoAprovado: dinheiro().notNull().default("0"),
  margemPrevista: percentual(),
  situacao: situacaoObra().notNull().default("EM_ORCAMENTO"),
  observacoes: text(),
  criadoPor: uuid().references(() => usuario.id),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
  excluidoEm: timestamp({ withTimezone: true }),
}, (t) => [uniqueIndex("obra_codigo_uq").on(t.empresaId, t.codigo)]);

export const tipoCentroCusto = pgEnum("tipo_centro_custo", ["OBRA", "ADMINISTRATIVO", "PROJETO", "CONSULTORIA"]);

export const centroCusto = pgTable("centro_custo", {
  id: id(),
  empresaId: uuid().notNull().references(() => empresa.id),
  codigo: text().notNull(),
  nome: text().notNull(),
  tipo: tipoCentroCusto().notNull(),
  obraId: uuid().references(() => obra.id),
  /** Para centros sem obra (projetos, consultorias, contratos históricos importados). */
  valorContrato: dinheiro(),
  valorAditivos: dinheiro(),
  /** Rótulo original na planilha (ex.: "2024-0003 - Reforma X"), usado na importação. */
  rotuloOrigem: text(),
  ativo: boolean().notNull().default(true),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
}, (t) => [uniqueIndex("centro_custo_codigo_uq").on(t.empresaId, t.codigo), uniqueIndex("centro_custo_obra_uq").on(t.obraId)]);

/** EAP da obra: cópia das etapas padrão no momento da criação (pode divergir depois). */
export const obraEtapa = pgTable("obra_etapa", {
  id: id(),
  obraId: uuid().notNull().references(() => obra.id),
  etapaPadraoId: uuid().references(() => etapaPadrao.id),
  ordem: integer().notNull(),
  nome: text().notNull(),
  tipo: tipoEtapa().notNull(),
  /** Aparece em "Evolução por tipo de serviço" no relatório semanal. */
  exibirNoRelatorio: boolean().notNull().default(true),
  criadoEm: criadoEm(),
}, (t) => [uniqueIndex("obra_etapa_ordem_uq").on(t.obraId, t.ordem)]);

/** Calendário semanal da obra (segunda a domingo). Substitui as colunas fixas de semanas da planilha. */
export const obraSemana = pgTable("obra_semana", {
  id: id(),
  obraId: uuid().notNull().references(() => obra.id),
  numero: integer().notNull(),
  inicio: date({ mode: "string" }).notNull(),
  fim: date({ mode: "string" }).notNull(),
}, (t) => [uniqueIndex("obra_semana_numero_uq").on(t.obraId, t.numero)]);

export const usuarioObra = pgTable("usuario_obra", {
  usuarioId: uuid().notNull().references(() => usuario.id),
  obraId: uuid().notNull().references(() => obra.id),
  papel: text().notNull().default("Equipe"),
  criadoEm: criadoEm(),
}, (t) => [primaryKey({ columns: [t.usuarioId, t.obraId] })]);

export const statusOrcamento = pgEnum("status_orcamento", ["RASCUNHO", "ENVIADO", "APROVADO", "REJEITADO", "BASE"]);

/** Cabeçalho de orçamento. Na Fase 2 a obra nasce com a revisão 0 em rascunho; itens chegam na Fase 3. */
export const orcamento = pgTable("orcamento", {
  id: id(),
  empresaId: uuid().notNull().references(() => empresa.id),
  obraId: uuid().notNull().references(() => obra.id),
  numero: integer().notNull(),
  revisao: integer().notNull().default(0),
  titulo: text().notNull(),
  status: statusOrcamento().notNull().default("RASCUNHO"),
  parametros: jsonb().$type<ParametrosOrcamento>().notNull(),
  observacoes: text(),
  /** Origem do conteúdo (ex.: "Importado de Orçamento Padrão.xlsx", "Cópia da rev. 2"). */
  origem: text(),
  /** Totais congelados quando o orçamento sai de rascunho (histórico imutável da proposta). */
  totalCusto: dinheiro(),
  totalVenda: dinheiro(),
  totalImposto: dinheiro(),
  totalProposta: dinheiro(),
  enviadoEm: timestamp({ withTimezone: true }),
  decididoEm: timestamp({ withTimezone: true }),
  decididoPor: uuid().references(() => usuario.id),
  criadoPor: uuid().references(() => usuario.id),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
}, (t) => [
  uniqueIndex("orcamento_numero_rev_uq").on(t.obraId, t.numero, t.revisao),
  // Apenas um orçamento-base por obra.
  uniqueIndex("orcamento_base_uq").on(t.obraId).where(sql`${t.status} = 'BASE'`),
]);

/** Quantidades e preços unitários com a mesma precisão do Excel (double), para reproduzir planilhas como =500/3. */
const quantidade = () => doublePrecision();

/** Itens (serviços) do orçamento, agrupados pelas etapas da EAP da obra. */
export const orcamentoItem = pgTable("orcamento_item", {
  id: id(),
  orcamentoId: uuid().notNull().references(() => orcamento.id, { onDelete: "cascade" }),
  etapaId: uuid().notNull().references(() => obraEtapa.id),
  /** Subgrupo dentro da etapa (ex.: "Licenciamento/acompanhamento/seguro"). */
  grupo: text(),
  ordem: integer().notNull(),
  descricao: text().notNull(),
  unidade: text(),
  quantidade: quantidade().notNull().default(0),
  /** Memória de cálculo da quantidade (ex.: "parede sala 12,4 + quarto 9,8"). */
  memoriaCalculo: text(),
  quebra: doublePrecision().notNull().default(1),
  custoUnitarioMaoDeObra: quantidade().notNull().default(0),
  custoUnitarioMaterial: quantidade().notNull().default(0),
  /** BDI específico do item (nulo = usa o do orçamento). */
  bdiMaoDeObra: numeric({ precision: 7, scale: 4, mode: "number" }),
  bdiMaterial: numeric({ precision: 7, scale: 4, mode: "number" }),
  observacao: text(),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
}, (t) => [index("orcamento_item_orc_idx").on(t.orcamentoId, t.etapaId, t.ordem)]);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/**
 * Conteúdo dos anexos guardado no próprio banco (driver "banco"): privado, com o backup do banco e sem serviço extra.
 * Usado em hospedagens sem disco persistente (ex.: Vercel). A chave do anexo começa com "db:".
 */
export const arquivoConteudo = pgTable("arquivo_conteudo", {
  chave: text().primaryKey(),
  dados: bytea().notNull(),
  criadoEm: criadoEm(),
});

export const anexo = pgTable("anexo", {
  id: id(),
  empresaId: uuid().notNull().references(() => empresa.id),
  entidade: text().notNull(),
  entidadeId: uuid().notNull(),
  obraId: uuid().references(() => obra.id),
  nomeArquivo: text().notNull(),
  tipoMime: text().notNull(),
  tamanho: integer().notNull(),
  sha256: text().notNull(),
  caminho: text().notNull(),
  descricao: text(),
  criadoPor: uuid().references(() => usuario.id),
  criadoEm: criadoEm(),
  excluidoEm: timestamp({ withTimezone: true }),
}, (t) => [index("anexo_entidade_idx").on(t.entidade, t.entidadeId)]);

// ───────────────────────────── Quadro (kanban/calendário do escritório) ─────────────────────────────

export const quadro = pgTable("quadro", {
  id: id(),
  empresaId: uuid().notNull().references(() => empresa.id),
  nome: text().notNull(),
  descricao: text(),
  arquivado: boolean().notNull().default(false),
  criadoPor: uuid().references(() => usuario.id),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

/** Colunas = etapas do fluxo (ex.: A fazer → Em andamento → Revisão → Concluído). */
export const quadroColuna = pgTable("quadro_coluna", {
  id: id(),
  quadroId: uuid().notNull().references(() => quadro.id, { onDelete: "cascade" }),
  nome: text().notNull(),
  ordem: integer().notNull(),
  /** Cartões nesta coluna contam como concluídos (não ficam "atrasados"). */
  concluida: boolean().notNull().default(false),
  /** Limite de cartões em andamento (WIP); nulo = sem limite. */
  limite: integer(),
  criadoEm: criadoEm(),
}, (t) => [index("quadro_coluna_quadro_idx").on(t.quadroId, t.ordem)]);

export const etiqueta = pgTable("etiqueta", {
  id: id(),
  quadroId: uuid().notNull().references(() => quadro.id, { onDelete: "cascade" }),
  nome: text().notNull(),
  cor: text().notNull(),
}, (t) => [uniqueIndex("etiqueta_nome_uq").on(t.quadroId, sql`lower(${t.nome})`)]);

export const cartao = pgTable("cartao", {
  id: id(),
  empresaId: uuid().notNull().references(() => empresa.id),
  quadroId: uuid().notNull().references(() => quadro.id, { onDelete: "cascade" }),
  colunaId: uuid().notNull().references(() => quadroColuna.id),
  titulo: text().notNull(),
  descricao: text(),
  responsavelId: uuid().references(() => usuario.id),
  obraId: uuid().references(() => obra.id),
  dataInicio: date({ mode: "string" }),
  dataEntrega: date({ mode: "string" }),
  /** Posição fracionária dentro da coluna — permite inserir entre dois cartões sem renumerar. */
  posicao: numeric({ precision: 20, scale: 10, mode: "number" }).notNull(),
  concluidoEm: timestamp({ withTimezone: true }),
  arquivado: boolean().notNull().default(false),
  criadoPor: uuid().references(() => usuario.id),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
}, (t) => [
  index("cartao_coluna_idx").on(t.colunaId, t.posicao),
  index("cartao_entrega_idx").on(t.empresaId, t.dataEntrega),
  index("cartao_responsavel_idx").on(t.responsavelId),
]);

export const cartaoEtiqueta = pgTable("cartao_etiqueta", {
  cartaoId: uuid().notNull().references(() => cartao.id, { onDelete: "cascade" }),
  etiquetaId: uuid().notNull().references(() => etiqueta.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.cartaoId, t.etiquetaId] })]);

export const cartaoChecklist = pgTable("cartao_checklist", {
  id: id(),
  cartaoId: uuid().notNull().references(() => cartao.id, { onDelete: "cascade" }),
  texto: text().notNull(),
  feito: boolean().notNull().default(false),
  ordem: integer().notNull(),
  criadoEm: criadoEm(),
});

export const cartaoComentario = pgTable("cartao_comentario", {
  id: id(),
  cartaoId: uuid().notNull().references(() => cartao.id, { onDelete: "cascade" }),
  usuarioId: uuid().notNull().references(() => usuario.id),
  texto: text().notNull(),
  criadoEm: criadoEm(),
}, (t) => [index("cartao_comentario_idx").on(t.cartaoId, t.criadoEm)]);


// ───────────────────────────── Financeiro (Fase 3) ─────────────────────────────

/**
 * Natureza do grupo de contas. Só RECEITA, CUSTO, DESPESA e IMPOSTO entram no resultado operacional;
 * RETIRADA aparece abaixo do resultado; FINANCIAMENTO, INVESTIMENTO, TRANSFERENCIA e AJUSTE só afetam o caixa (decisão D12).
 */
export const naturezaConta = pgEnum("natureza_conta", [
  "RECEITA", "CUSTO", "DESPESA", "IMPOSTO", "RETIRADA", "FINANCIAMENTO", "INVESTIMENTO", "TRANSFERENCIA", "AJUSTE",
]);

/** Plano de contas em 2 níveis (grupo › subitem), como a aba Aux.Listas do Financeiro. Cada linha é um subitem. */
export const planoConta = pgTable("plano_conta", {
  id: id(),
  empresaId: uuid().notNull().references(() => empresa.id),
  grupo: text().notNull(),
  natureza: naturezaConta().notNull(),
  subitem: text().notNull(),
  /** De-para com a etapa padrão da EAP (decisão D11): permite controlar a verba por etapa. */
  etapaPadraoId: uuid().references(() => etapaPadrao.id),
  ativo: boolean().notNull().default(true),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
}, (t) => [uniqueIndex("plano_conta_uq").on(t.empresaId, sql`lower(${t.grupo})`, sql`lower(${t.subitem})`)]);

export const tipoContaFinanceira = pgEnum("tipo_conta_financeira", ["BANCO", "CAIXA", "CARTAO", "APLICACAO"]);

export const contaFinanceira = pgTable("conta_financeira", {
  id: id(),
  empresaId: uuid().notNull().references(() => empresa.id),
  nome: text().notNull(),
  tipo: tipoContaFinanceira().notNull().default("BANCO"),
  banco: text(),
  agencia: text(),
  conta: text(),
  /** Conta pessoal de sócio usada pela empresa (ponto F-11 do diagnóstico). */
  contaDeSocio: boolean().notNull().default(false),
  saldoInicial: dinheiro().notNull().default("0"),
  ativo: boolean().notNull().default(true),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
}, (t) => [uniqueIndex("conta_financeira_nome_uq").on(t.empresaId, sql`lower(${t.nome})`)]);

export const importacao = pgTable("importacao", {
  id: id(),
  empresaId: uuid().notNull().references(() => empresa.id),
  tipo: text().notNull(),
  arquivo: text().notNull(),
  sha256: text().notNull(),
  resumo: jsonb().notNull(),
  criadoPor: uuid().references(() => usuario.id),
  criadoEm: criadoEm(),
  desfeitaEm: timestamp({ withTimezone: true }),
}, (t) => [uniqueIndex("importacao_arquivo_uq").on(t.empresaId, t.sha256).where(sql`${t.desfeitaEm} is null`)]);

export const tipoNotaFiscal = pgEnum("tipo_nota_fiscal", ["A_VISTA", "A_PRAZO", "ACUMULADA", "DEVOLUCAO"]);
export const statusNotaFiscal = pgEnum("status_nota_fiscal", ["LANCADA", "CANCELADA"]);

/** Nota fiscal de entrada (compras). Gera o título a pagar com as parcelas; devolução abate a verba. */
export const notaFiscal = pgTable("nota_fiscal", {
  id: id(),
  empresaId: uuid().notNull().references(() => empresa.id),
  fornecedorId: uuid().notNull().references(() => fornecedor.id),
  numero: text().notNull(),
  serie: text().notNull().default("1"),
  chaveNfe: text(),
  emissao: date({ mode: "string" }).notNull(),
  tipo: tipoNotaFiscal().notNull(),
  /** Sempre positivo; o tipo DEVOLUCAO indica crédito. */
  valorTotal: dinheiro().notNull(),
  centroCustoId: uuid().notNull().references(() => centroCusto.id),
  obraEtapaId: uuid().references(() => obraEtapa.id),
  planoContaId: uuid().notNull().references(() => planoConta.id),
  /** Material faturado em nome do cliente: abate o saldo do cliente, não é custo da Masie (R11). */
  faturadoAoCliente: boolean().notNull().default(false),
  descricao: text(),
  status: statusNotaFiscal().notNull().default("LANCADA"),
  xml: text(),
  criadoPor: uuid().references(() => usuario.id),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
}, (t) => [
  uniqueIndex("nota_fiscal_numero_uq").on(t.empresaId, t.fornecedorId, t.numero, t.serie).where(sql`${t.status} = 'LANCADA'`),
  uniqueIndex("nota_fiscal_chave_uq").on(t.empresaId, t.chaveNfe).where(sql`${t.chaveNfe} is not null and ${t.status} = 'LANCADA'`),
  index("nota_fiscal_cc_idx").on(t.centroCustoId, t.emissao),
]);

export const tipoTitulo = pgEnum("tipo_titulo", ["PAGAR", "RECEBER"]);

/** Conta a pagar ou a receber, com parcelas. */
export const titulo = pgTable("titulo", {
  id: id(),
  empresaId: uuid().notNull().references(() => empresa.id),
  tipo: tipoTitulo().notNull(),
  fornecedorId: uuid().references(() => fornecedor.id),
  clienteId: uuid().references(() => cliente.id),
  centroCustoId: uuid().notNull().references(() => centroCusto.id),
  planoContaId: uuid().notNull().references(() => planoConta.id),
  obraEtapaId: uuid().references(() => obraEtapa.id),
  notaFiscalId: uuid().references(() => notaFiscal.id, { onDelete: "cascade" }),
  descricao: text().notNull(),
  documento: text(),
  emissao: date({ mode: "string" }).notNull(),
  valorTotal: dinheiro().notNull(),
  cancelado: boolean().notNull().default(false),
  importacaoId: uuid().references(() => importacao.id, { onDelete: "cascade" }),
  criadoPor: uuid().references(() => usuario.id),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
}, (t) => [index("titulo_cc_idx").on(t.centroCustoId)]);

export const tituloParcela = pgTable("titulo_parcela", {
  id: id(),
  tituloId: uuid().notNull().references(() => titulo.id, { onDelete: "cascade" }),
  numero: integer().notNull(),
  vencimento: date({ mode: "string" }).notNull(),
  valor: dinheiro().notNull(),
  /** Boleto já programado no banco (aba Contas a Pagar: "Boleto já programado para pagamento?"). */
  programado: boolean().notNull().default(false),
  pagoEm: date({ mode: "string" }),
  criadoEm: criadoEm(),
}, (t) => [index("titulo_parcela_venc_idx").on(t.vencimento), uniqueIndex("titulo_parcela_num_uq").on(t.tituloId, t.numero)]);

/** Razão de caixa: cada entrada (+) ou saída (−) efetiva numa conta financeira. */
export const lancamento = pgTable("lancamento", {
  id: id(),
  empresaId: uuid().notNull().references(() => empresa.id),
  data: date({ mode: "string" }).notNull(),
  contaId: uuid().notNull().references(() => contaFinanceira.id),
  centroCustoId: uuid().notNull().references(() => centroCusto.id),
  planoContaId: uuid().notNull().references(() => planoConta.id),
  /** Etapa da obra (verba). Vem do título/NF ou do de-para do plano de contas. */
  obraEtapaId: uuid().references(() => obraEtapa.id),
  /** Positivo = entrada; negativo = saída. */
  valor: dinheiro().notNull(),
  descricao: text(),
  observacao: text(),
  parcelaId: uuid().references(() => tituloParcela.id, { onDelete: "set null" }),
  notaFiscalId: uuid().references(() => notaFiscal.id, { onDelete: "set null" }),
  importacaoId: uuid().references(() => importacao.id, { onDelete: "cascade" }),
  conciliado: boolean().notNull().default(false),
  criadoPor: uuid().references(() => usuario.id),
  criadoEm: criadoEm(),
}, (t) => [
  index("lancamento_data_idx").on(t.empresaId, t.data),
  index("lancamento_cc_idx").on(t.centroCustoId, t.data),
  index("lancamento_conta_idx").on(t.contaId),
]);

// ───────────────────────────── Gestão da obra: planilha e físico (Item 1) ─────────────────────────────

/**
 * Planilha da obra = colunas da esquerda da aba "Realizado-Físico": serviço, fornecedor, MO acertada,
 * MO verba, valor cliente e duração. Valores em double, como na planilha (ex.: 176,350625).
 */
export const obraServico = pgTable("obra_servico", {
  id: id(),
  obraId: uuid().notNull().references(() => obra.id),
  etapaId: uuid().notNull().references(() => obraEtapa.id),
  ordem: integer().notNull(),
  descricao: text().notNull(),
  fornecedorId: uuid().references(() => fornecedor.id),
  /** Valor proposto ao prestador (MO acertada); nulo = ainda não acertado. */
  maoDeObraAcertada: doublePrecision(),
  /** Custo orçado (verba) do serviço. */
  maoDeObraVerba: doublePrecision().notNull().default(0),
  /** Preço de venda ao cliente — base da medição. */
  valorCliente: doublePrecision().notNull().default(0),
  /** Peso do serviço no avanço físico (decisão do cliente: avanço ponderado pela duração). */
  duracaoDias: doublePrecision().notNull().default(1),
  /** Curva ABC informada; nulo = calculada pela verba. */
  curvaAbc: text(),
  orcamentoItemId: uuid().references(() => orcamentoItem.id, { onDelete: "set null" }),
  observacao: text(),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
}, (t) => [index("obra_servico_obra_idx").on(t.obraId, t.etapaId, t.ordem)]);

/** Percentual previsto e realizado de cada serviço em cada semana da obra (abas "Previsto físico" e "Realizado-Físico"). */
export const obraServicoSemana = pgTable("obra_servico_semana", {
  servicoId: uuid().notNull().references(() => obraServico.id, { onDelete: "cascade" }),
  semana: integer().notNull(),
  /** Fração do serviço prevista para a semana (0.25 = 25%). */
  previsto: doublePrecision(),
  /** Fração do serviço executada na semana. */
  realizado: doublePrecision(),
  atualizadoPor: uuid().references(() => usuario.id),
  atualizadoEm: atualizadoEm(),
}, (t) => [primaryKey({ columns: [t.servicoId, t.semana] })]);

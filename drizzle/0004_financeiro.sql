CREATE TYPE "public"."natureza_conta" AS ENUM('RECEITA', 'CUSTO', 'DESPESA', 'IMPOSTO', 'RETIRADA', 'FINANCIAMENTO', 'INVESTIMENTO', 'TRANSFERENCIA', 'AJUSTE');--> statement-breakpoint
CREATE TYPE "public"."status_nota_fiscal" AS ENUM('LANCADA', 'CANCELADA');--> statement-breakpoint
CREATE TYPE "public"."tipo_conta_financeira" AS ENUM('BANCO', 'CAIXA', 'CARTAO', 'APLICACAO');--> statement-breakpoint
CREATE TYPE "public"."tipo_nota_fiscal" AS ENUM('A_VISTA', 'A_PRAZO', 'ACUMULADA', 'DEVOLUCAO');--> statement-breakpoint
CREATE TYPE "public"."tipo_titulo" AS ENUM('PAGAR', 'RECEBER');--> statement-breakpoint
ALTER TYPE "public"."tipo_centro_custo" ADD VALUE 'PROJETO';--> statement-breakpoint
ALTER TYPE "public"."tipo_centro_custo" ADD VALUE 'CONSULTORIA';--> statement-breakpoint
CREATE TABLE "conta_financeira" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_conta_financeira" DEFAULT 'BANCO' NOT NULL,
	"banco" text,
	"agencia" text,
	"conta" text,
	"conta_de_socio" boolean DEFAULT false NOT NULL,
	"saldo_inicial" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "importacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"arquivo" text NOT NULL,
	"sha256" text NOT NULL,
	"resumo" jsonb NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"desfeita_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lancamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"data" date NOT NULL,
	"conta_id" uuid NOT NULL,
	"centro_custo_id" uuid NOT NULL,
	"plano_conta_id" uuid NOT NULL,
	"obra_etapa_id" uuid,
	"valor" numeric(14, 2) NOT NULL,
	"descricao" text,
	"observacao" text,
	"parcela_id" uuid,
	"nota_fiscal_id" uuid,
	"importacao_id" uuid,
	"conciliado" boolean DEFAULT false NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nota_fiscal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fornecedor_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"serie" text DEFAULT '1' NOT NULL,
	"chave_nfe" text,
	"emissao" date NOT NULL,
	"tipo" "tipo_nota_fiscal" NOT NULL,
	"valor_total" numeric(14, 2) NOT NULL,
	"centro_custo_id" uuid NOT NULL,
	"obra_etapa_id" uuid,
	"plano_conta_id" uuid NOT NULL,
	"faturado_ao_cliente" boolean DEFAULT false NOT NULL,
	"descricao" text,
	"status" "status_nota_fiscal" DEFAULT 'LANCADA' NOT NULL,
	"xml" text,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plano_conta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"grupo" text NOT NULL,
	"natureza" "natureza_conta" NOT NULL,
	"subitem" text NOT NULL,
	"etapa_padrao_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "titulo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" "tipo_titulo" NOT NULL,
	"fornecedor_id" uuid,
	"cliente_id" uuid,
	"centro_custo_id" uuid NOT NULL,
	"plano_conta_id" uuid NOT NULL,
	"obra_etapa_id" uuid,
	"nota_fiscal_id" uuid,
	"descricao" text NOT NULL,
	"documento" text,
	"emissao" date NOT NULL,
	"valor_total" numeric(14, 2) NOT NULL,
	"cancelado" boolean DEFAULT false NOT NULL,
	"importacao_id" uuid,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "titulo_parcela" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"vencimento" date NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"programado" boolean DEFAULT false NOT NULL,
	"pago_em" date,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "centro_custo" ADD COLUMN "valor_contrato" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "centro_custo" ADD COLUMN "valor_aditivos" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "centro_custo" ADD COLUMN "rotulo_origem" text;--> statement-breakpoint
ALTER TABLE "conta_financeira" ADD CONSTRAINT "conta_financeira_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacao" ADD CONSTRAINT "importacao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacao" ADD CONSTRAINT "importacao_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_conta_id_conta_financeira_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."conta_financeira"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_centro_custo_id_centro_custo_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centro_custo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_plano_conta_id_plano_conta_id_fk" FOREIGN KEY ("plano_conta_id") REFERENCES "public"."plano_conta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_obra_etapa_id_obra_etapa_id_fk" FOREIGN KEY ("obra_etapa_id") REFERENCES "public"."obra_etapa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_parcela_id_titulo_parcela_id_fk" FOREIGN KEY ("parcela_id") REFERENCES "public"."titulo_parcela"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_nota_fiscal_id_nota_fiscal_id_fk" FOREIGN KEY ("nota_fiscal_id") REFERENCES "public"."nota_fiscal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_importacao_id_importacao_id_fk" FOREIGN KEY ("importacao_id") REFERENCES "public"."importacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_fiscal" ADD CONSTRAINT "nota_fiscal_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_fiscal" ADD CONSTRAINT "nota_fiscal_fornecedor_id_fornecedor_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_fiscal" ADD CONSTRAINT "nota_fiscal_centro_custo_id_centro_custo_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centro_custo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_fiscal" ADD CONSTRAINT "nota_fiscal_obra_etapa_id_obra_etapa_id_fk" FOREIGN KEY ("obra_etapa_id") REFERENCES "public"."obra_etapa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_fiscal" ADD CONSTRAINT "nota_fiscal_plano_conta_id_plano_conta_id_fk" FOREIGN KEY ("plano_conta_id") REFERENCES "public"."plano_conta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_fiscal" ADD CONSTRAINT "nota_fiscal_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_conta" ADD CONSTRAINT "plano_conta_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano_conta" ADD CONSTRAINT "plano_conta_etapa_padrao_id_etapa_padrao_id_fk" FOREIGN KEY ("etapa_padrao_id") REFERENCES "public"."etapa_padrao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulo" ADD CONSTRAINT "titulo_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulo" ADD CONSTRAINT "titulo_fornecedor_id_fornecedor_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulo" ADD CONSTRAINT "titulo_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulo" ADD CONSTRAINT "titulo_centro_custo_id_centro_custo_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centro_custo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulo" ADD CONSTRAINT "titulo_plano_conta_id_plano_conta_id_fk" FOREIGN KEY ("plano_conta_id") REFERENCES "public"."plano_conta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulo" ADD CONSTRAINT "titulo_obra_etapa_id_obra_etapa_id_fk" FOREIGN KEY ("obra_etapa_id") REFERENCES "public"."obra_etapa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulo" ADD CONSTRAINT "titulo_nota_fiscal_id_nota_fiscal_id_fk" FOREIGN KEY ("nota_fiscal_id") REFERENCES "public"."nota_fiscal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulo" ADD CONSTRAINT "titulo_importacao_id_importacao_id_fk" FOREIGN KEY ("importacao_id") REFERENCES "public"."importacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulo" ADD CONSTRAINT "titulo_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulo_parcela" ADD CONSTRAINT "titulo_parcela_titulo_id_titulo_id_fk" FOREIGN KEY ("titulo_id") REFERENCES "public"."titulo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conta_financeira_nome_uq" ON "conta_financeira" USING btree ("empresa_id",lower("nome"));--> statement-breakpoint
CREATE UNIQUE INDEX "importacao_arquivo_uq" ON "importacao" USING btree ("empresa_id","sha256") WHERE "importacao"."desfeita_em" is null;--> statement-breakpoint
CREATE INDEX "lancamento_data_idx" ON "lancamento" USING btree ("empresa_id","data");--> statement-breakpoint
CREATE INDEX "lancamento_cc_idx" ON "lancamento" USING btree ("centro_custo_id","data");--> statement-breakpoint
CREATE INDEX "lancamento_conta_idx" ON "lancamento" USING btree ("conta_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nota_fiscal_numero_uq" ON "nota_fiscal" USING btree ("empresa_id","fornecedor_id","numero","serie") WHERE "nota_fiscal"."status" = 'LANCADA';--> statement-breakpoint
CREATE UNIQUE INDEX "nota_fiscal_chave_uq" ON "nota_fiscal" USING btree ("empresa_id","chave_nfe") WHERE "nota_fiscal"."chave_nfe" is not null and "nota_fiscal"."status" = 'LANCADA';--> statement-breakpoint
CREATE INDEX "nota_fiscal_cc_idx" ON "nota_fiscal" USING btree ("centro_custo_id","emissao");--> statement-breakpoint
CREATE UNIQUE INDEX "plano_conta_uq" ON "plano_conta" USING btree ("empresa_id",lower("grupo"),lower("subitem"));--> statement-breakpoint
CREATE INDEX "titulo_cc_idx" ON "titulo" USING btree ("centro_custo_id");--> statement-breakpoint
CREATE INDEX "titulo_parcela_venc_idx" ON "titulo_parcela" USING btree ("vencimento");--> statement-breakpoint
CREATE UNIQUE INDEX "titulo_parcela_num_uq" ON "titulo_parcela" USING btree ("titulo_id","numero");
CREATE TYPE "public"."situacao_medicao" AS ENUM('PAGA', 'NAO_PAGA');--> statement-breakpoint
CREATE TYPE "public"."tipo_ajuste_contrato" AS ENUM('ADITIVO', 'DESCONTO', 'REEMBOLSO');--> statement-breakpoint
CREATE TABLE "ajuste_contrato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obra_id" uuid NOT NULL,
	"tipo" "tipo_ajuste_contrato" NOT NULL,
	"data" date NOT NULL,
	"valor" double precision NOT NULL,
	"descricao" text NOT NULL,
	"medicao_numero" integer,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medicao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obra_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"semana_inicio" integer NOT NULL,
	"semana_fim" integer NOT NULL,
	"data" date NOT NULL,
	"valor_contrato" double precision NOT NULL,
	"valor_aditivos" double precision NOT NULL,
	"valor_ajustes" double precision NOT NULL,
	"entrada_abatida" double precision NOT NULL,
	"valor_cobranca" double precision NOT NULL,
	"situacao" "situacao_medicao" DEFAULT 'NAO_PAGA' NOT NULL,
	"paga_em" date,
	"observacao" text,
	"fechada_por" uuid,
	"fechada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagamento_fornecedor_obra" (
	"obra_id" uuid NOT NULL,
	"fornecedor_id" uuid NOT NULL,
	"semana" integer NOT NULL,
	"valor" double precision NOT NULL,
	"atualizado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pagamento_fornecedor_obra_obra_id_fornecedor_id_semana_pk" PRIMARY KEY("obra_id","fornecedor_id","semana")
);
--> statement-breakpoint
ALTER TABLE "ajuste_contrato" ADD CONSTRAINT "ajuste_contrato_obra_id_obra_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajuste_contrato" ADD CONSTRAINT "ajuste_contrato_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicao" ADD CONSTRAINT "medicao_obra_id_obra_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicao" ADD CONSTRAINT "medicao_fechada_por_usuario_id_fk" FOREIGN KEY ("fechada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamento_fornecedor_obra" ADD CONSTRAINT "pagamento_fornecedor_obra_obra_id_obra_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamento_fornecedor_obra" ADD CONSTRAINT "pagamento_fornecedor_obra_fornecedor_id_fornecedor_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamento_fornecedor_obra" ADD CONSTRAINT "pagamento_fornecedor_obra_atualizado_por_usuario_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ajuste_contrato_obra_idx" ON "ajuste_contrato" USING btree ("obra_id");--> statement-breakpoint
CREATE UNIQUE INDEX "medicao_numero_uq" ON "medicao" USING btree ("obra_id","numero");
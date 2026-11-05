CREATE TABLE "obra_servico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obra_id" uuid NOT NULL,
	"etapa_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"descricao" text NOT NULL,
	"fornecedor_id" uuid,
	"mao_de_obra_acertada" double precision,
	"mao_de_obra_verba" double precision DEFAULT 0 NOT NULL,
	"valor_cliente" double precision DEFAULT 0 NOT NULL,
	"duracao_dias" double precision DEFAULT 1 NOT NULL,
	"curva_abc" text,
	"orcamento_item_id" uuid,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obra_servico_semana" (
	"servico_id" uuid NOT NULL,
	"semana" integer NOT NULL,
	"previsto" double precision,
	"realizado" double precision,
	"atualizado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "obra_servico_semana_servico_id_semana_pk" PRIMARY KEY("servico_id","semana")
);
--> statement-breakpoint
ALTER TABLE "obra" ADD COLUMN "semanas_por_medicao" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "obra_etapa" ADD COLUMN "exibir_no_relatorio" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "obra_servico" ADD CONSTRAINT "obra_servico_obra_id_obra_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_servico" ADD CONSTRAINT "obra_servico_etapa_id_obra_etapa_id_fk" FOREIGN KEY ("etapa_id") REFERENCES "public"."obra_etapa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_servico" ADD CONSTRAINT "obra_servico_fornecedor_id_fornecedor_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_servico" ADD CONSTRAINT "obra_servico_orcamento_item_id_orcamento_item_id_fk" FOREIGN KEY ("orcamento_item_id") REFERENCES "public"."orcamento_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_servico_semana" ADD CONSTRAINT "obra_servico_semana_servico_id_obra_servico_id_fk" FOREIGN KEY ("servico_id") REFERENCES "public"."obra_servico"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_servico_semana" ADD CONSTRAINT "obra_servico_semana_atualizado_por_usuario_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "obra_servico_obra_idx" ON "obra_servico" USING btree ("obra_id","etapa_id","ordem");--> statement-breakpoint
UPDATE "obra_etapa" SET "exibir_no_relatorio" = false WHERE "tipo" = 'FATURAMENTO_DIRETO' OR lower("nome") IN ('aluguel de equipamentos', 'serviços adicionais', 'servicos adicionais', 'alugueis de equipamentos');

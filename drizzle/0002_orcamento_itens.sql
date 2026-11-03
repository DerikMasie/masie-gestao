CREATE TABLE "orcamento_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orcamento_id" uuid NOT NULL,
	"etapa_id" uuid NOT NULL,
	"grupo" text,
	"ordem" integer NOT NULL,
	"descricao" text NOT NULL,
	"unidade" text,
	"quantidade" numeric(14, 4) DEFAULT 0 NOT NULL,
	"memoria_calculo" text,
	"quebra" numeric(7, 4) DEFAULT 1 NOT NULL,
	"custo_unitario_mao_de_obra" numeric(14, 4) DEFAULT 0 NOT NULL,
	"custo_unitario_material" numeric(14, 4) DEFAULT 0 NOT NULL,
	"bdi_mao_de_obra" numeric(7, 4),
	"bdi_material" numeric(7, 4),
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orcamento" ADD COLUMN "observacoes" text;--> statement-breakpoint
ALTER TABLE "orcamento" ADD COLUMN "origem" text;--> statement-breakpoint
ALTER TABLE "orcamento" ADD COLUMN "total_custo" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "orcamento" ADD COLUMN "total_venda" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "orcamento" ADD COLUMN "total_imposto" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "orcamento" ADD COLUMN "total_proposta" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "orcamento" ADD COLUMN "enviado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orcamento" ADD COLUMN "decidido_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orcamento" ADD COLUMN "decidido_por" uuid;--> statement-breakpoint
ALTER TABLE "orcamento_item" ADD CONSTRAINT "orcamento_item_orcamento_id_orcamento_id_fk" FOREIGN KEY ("orcamento_id") REFERENCES "public"."orcamento"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento_item" ADD CONSTRAINT "orcamento_item_etapa_id_obra_etapa_id_fk" FOREIGN KEY ("etapa_id") REFERENCES "public"."obra_etapa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orcamento_item_orc_idx" ON "orcamento_item" USING btree ("orcamento_id","etapa_id","ordem");--> statement-breakpoint
ALTER TABLE "orcamento" ADD CONSTRAINT "orcamento_decidido_por_usuario_id_fk" FOREIGN KEY ("decidido_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orcamento_base_uq" ON "orcamento" USING btree ("obra_id") WHERE "orcamento"."status" = 'BASE';
CREATE TYPE "public"."status_relatorio" AS ENUM('RASCUNHO', 'EMITIDO');--> statement-breakpoint
CREATE TABLE "relatorio_foto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relatorio_id" uuid NOT NULL,
	"anexo_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"legenda" text,
	"foco_x" integer DEFAULT 50 NOT NULL,
	"foco_y" integer DEFAULT 50 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relatorio_semanal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obra_id" uuid NOT NULL,
	"semana" integer NOT NULL,
	"status" "status_relatorio" DEFAULT 'RASCUNHO' NOT NULL,
	"versao" integer DEFAULT 0 NOT NULL,
	"tarefas_realizadas" text DEFAULT '' NOT NULL,
	"tarefas_proxima_semana" text DEFAULT '' NOT NULL,
	"anomalias" text DEFAULT '' NOT NULL,
	"acompanhamento_prazo" text DEFAULT '' NOT NULL,
	"dados" jsonb,
	"emitido_em" timestamp with time zone,
	"emitido_por" uuid,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "relatorio_foto" ADD CONSTRAINT "relatorio_foto_relatorio_id_relatorio_semanal_id_fk" FOREIGN KEY ("relatorio_id") REFERENCES "public"."relatorio_semanal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorio_foto" ADD CONSTRAINT "relatorio_foto_anexo_id_anexo_id_fk" FOREIGN KEY ("anexo_id") REFERENCES "public"."anexo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorio_semanal" ADD CONSTRAINT "relatorio_semanal_obra_id_obra_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorio_semanal" ADD CONSTRAINT "relatorio_semanal_emitido_por_usuario_id_fk" FOREIGN KEY ("emitido_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorio_semanal" ADD CONSTRAINT "relatorio_semanal_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "relatorio_foto_idx" ON "relatorio_foto" USING btree ("relatorio_id","ordem");--> statement-breakpoint
CREATE UNIQUE INDEX "relatorio_semana_uq" ON "relatorio_semanal" USING btree ("obra_id","semana");
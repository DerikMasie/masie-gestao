CREATE TABLE "lembrete_obra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obra_id" uuid NOT NULL,
	"semana" integer NOT NULL,
	"texto" text NOT NULL,
	"importante" boolean DEFAULT false NOT NULL,
	"feito_em" timestamp with time zone,
	"feito_por" uuid,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lembrete_obra" ADD CONSTRAINT "lembrete_obra_obra_id_obra_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lembrete_obra" ADD CONSTRAINT "lembrete_obra_feito_por_usuario_id_fk" FOREIGN KEY ("feito_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lembrete_obra" ADD CONSTRAINT "lembrete_obra_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lembrete_obra_idx" ON "lembrete_obra" USING btree ("obra_id","semana");
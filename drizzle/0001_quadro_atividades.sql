ALTER TYPE "public"."acao_auditoria" ADD VALUE 'MOVER';--> statement-breakpoint
ALTER TYPE "public"."acao_auditoria" ADD VALUE 'COMENTAR';--> statement-breakpoint
CREATE TABLE "cartao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"quadro_id" uuid NOT NULL,
	"coluna_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text,
	"responsavel_id" uuid,
	"obra_id" uuid,
	"data_inicio" date,
	"data_entrega" date,
	"posicao" numeric(20, 10) NOT NULL,
	"concluido_em" timestamp with time zone,
	"arquivado" boolean DEFAULT false NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cartao_checklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cartao_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"feito" boolean DEFAULT false NOT NULL,
	"ordem" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cartao_comentario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cartao_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cartao_etiqueta" (
	"cartao_id" uuid NOT NULL,
	"etiqueta_id" uuid NOT NULL,
	CONSTRAINT "cartao_etiqueta_cartao_id_etiqueta_id_pk" PRIMARY KEY("cartao_id","etiqueta_id")
);
--> statement-breakpoint
CREATE TABLE "etiqueta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quadro_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cor" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quadro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"arquivado" boolean DEFAULT false NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quadro_coluna" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quadro_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer NOT NULL,
	"concluida" boolean DEFAULT false NOT NULL,
	"limite" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "empresa" ALTER COLUMN "cor_primaria" SET DEFAULT '#111111';--> statement-breakpoint
ALTER TABLE "cartao" ADD CONSTRAINT "cartao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartao" ADD CONSTRAINT "cartao_quadro_id_quadro_id_fk" FOREIGN KEY ("quadro_id") REFERENCES "public"."quadro"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartao" ADD CONSTRAINT "cartao_coluna_id_quadro_coluna_id_fk" FOREIGN KEY ("coluna_id") REFERENCES "public"."quadro_coluna"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartao" ADD CONSTRAINT "cartao_responsavel_id_usuario_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartao" ADD CONSTRAINT "cartao_obra_id_obra_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartao" ADD CONSTRAINT "cartao_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartao_checklist" ADD CONSTRAINT "cartao_checklist_cartao_id_cartao_id_fk" FOREIGN KEY ("cartao_id") REFERENCES "public"."cartao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartao_comentario" ADD CONSTRAINT "cartao_comentario_cartao_id_cartao_id_fk" FOREIGN KEY ("cartao_id") REFERENCES "public"."cartao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartao_comentario" ADD CONSTRAINT "cartao_comentario_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartao_etiqueta" ADD CONSTRAINT "cartao_etiqueta_cartao_id_cartao_id_fk" FOREIGN KEY ("cartao_id") REFERENCES "public"."cartao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartao_etiqueta" ADD CONSTRAINT "cartao_etiqueta_etiqueta_id_etiqueta_id_fk" FOREIGN KEY ("etiqueta_id") REFERENCES "public"."etiqueta"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etiqueta" ADD CONSTRAINT "etiqueta_quadro_id_quadro_id_fk" FOREIGN KEY ("quadro_id") REFERENCES "public"."quadro"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quadro" ADD CONSTRAINT "quadro_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quadro" ADD CONSTRAINT "quadro_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quadro_coluna" ADD CONSTRAINT "quadro_coluna_quadro_id_quadro_id_fk" FOREIGN KEY ("quadro_id") REFERENCES "public"."quadro"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cartao_coluna_idx" ON "cartao" USING btree ("coluna_id","posicao");--> statement-breakpoint
CREATE INDEX "cartao_entrega_idx" ON "cartao" USING btree ("empresa_id","data_entrega");--> statement-breakpoint
CREATE INDEX "cartao_responsavel_idx" ON "cartao" USING btree ("responsavel_id");--> statement-breakpoint
CREATE INDEX "cartao_comentario_idx" ON "cartao_comentario" USING btree ("cartao_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "etiqueta_nome_uq" ON "etiqueta" USING btree ("quadro_id",lower("nome"));--> statement-breakpoint
CREATE INDEX "quadro_coluna_quadro_idx" ON "quadro_coluna" USING btree ("quadro_id","ordem");
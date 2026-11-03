CREATE TYPE "public"."acao_auditoria" AS ENUM('CRIAR', 'EDITAR', 'EXCLUIR', 'RESTAURAR', 'LOGIN', 'LOGIN_FALHOU', 'LOGOUT', 'TROCAR_SENHA', 'VER_DADOS_SENSIVEIS', 'ANEXAR', 'REMOVER_ANEXO', 'GERAR_ESTRUTURA');--> statement-breakpoint
CREATE TYPE "public"."situacao_obra" AS ENUM('PROSPECCAO', 'EM_ORCAMENTO', 'CONTRATADA', 'EM_ANDAMENTO', 'PARALISADA', 'CONCLUIDA', 'CANCELADA');--> statement-breakpoint
CREATE TYPE "public"."status_orcamento" AS ENUM('RASCUNHO', 'ENVIADO', 'APROVADO', 'REJEITADO', 'BASE');--> statement-breakpoint
CREATE TYPE "public"."tipo_centro_custo" AS ENUM('OBRA', 'ADMINISTRATIVO');--> statement-breakpoint
CREATE TYPE "public"."tipo_etapa" AS ENUM('CONTRATO', 'ADITIVO', 'FATURAMENTO_DIRETO');--> statement-breakpoint
CREATE TYPE "public"."tipo_pessoa" AS ENUM('PF', 'PJ');--> statement-breakpoint
CREATE TABLE "anexo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" uuid NOT NULL,
	"obra_id" uuid,
	"nome_arquivo" text NOT NULL,
	"tipo_mime" text NOT NULL,
	"tamanho" integer NOT NULL,
	"sha256" text NOT NULL,
	"caminho" text NOT NULL,
	"descricao" text,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"empresa_id" uuid,
	"usuario_id" uuid,
	"acao" "acao_auditoria" NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" text,
	"obra_id" uuid,
	"descricao" text,
	"antes" jsonb,
	"depois" jsonb,
	"ip" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centro_custo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_centro_custo" NOT NULL,
	"obra_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo_pessoa" "tipo_pessoa" DEFAULT 'PF' NOT NULL,
	"nome" text NOT NULL,
	"documento" text,
	"email" text,
	"telefone" text,
	"endereco" text,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "empresa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"razao_social" text NOT NULL,
	"nome_fantasia" text NOT NULL,
	"cnpj" text,
	"endereco" text,
	"telefone" text,
	"email" text,
	"banco" text,
	"agencia" text,
	"conta" text,
	"pix" text,
	"cor_primaria" text DEFAULT '#1e3a5f' NOT NULL,
	"parametros_orcamento" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "etapa_padrao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_etapa" DEFAULT 'CONTRATO' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fornecedor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"razao_social" text,
	"tipo_pessoa" "tipo_pessoa" DEFAULT 'PF' NOT NULL,
	"documento" text,
	"especialidade" text,
	"telefone" text,
	"email" text,
	"dados_bancarios_cifrado" text,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "obra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"endereco" text,
	"cidade" text,
	"uf" text,
	"tipo_obra" text,
	"responsavel_tecnico_id" uuid,
	"gestor_id" uuid,
	"data_inicio" date NOT NULL,
	"data_fim_contratual" date NOT NULL,
	"data_conclusao" date,
	"valor_contrato_original" numeric(14, 2) DEFAULT '0' NOT NULL,
	"percentual_entrada" numeric(7, 4) DEFAULT '0' NOT NULL,
	"orcamento_custo_aprovado" numeric(14, 2) DEFAULT '0' NOT NULL,
	"margem_prevista" numeric(7, 4),
	"situacao" "situacao_obra" DEFAULT 'EM_ORCAMENTO' NOT NULL,
	"observacoes" text,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "obra_etapa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obra_id" uuid NOT NULL,
	"etapa_padrao_id" uuid,
	"ordem" integer NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_etapa" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obra_semana" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obra_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"inicio" date NOT NULL,
	"fim" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orcamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"obra_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"revisao" integer DEFAULT 0 NOT NULL,
	"titulo" text NOT NULL,
	"status" "status_orcamento" DEFAULT 'RASCUNHO' NOT NULL,
	"parametros" jsonb NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perfil" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"acesso_todas_obras" boolean DEFAULT false NOT NULL,
	"sistema" boolean DEFAULT false NOT NULL,
	"permissoes" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessao" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tentativa_login" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"ip" text,
	"sucesso" boolean NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"perfil_id" uuid NOT NULL,
	"cargo" text,
	"telefone" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"deve_trocar_senha" boolean DEFAULT true NOT NULL,
	"ultimo_login_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuario_obra" (
	"usuario_id" uuid NOT NULL,
	"obra_id" uuid NOT NULL,
	"papel" text DEFAULT 'Equipe' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_obra_usuario_id_obra_id_pk" PRIMARY KEY("usuario_id","obra_id")
);
--> statement-breakpoint
ALTER TABLE "anexo" ADD CONSTRAINT "anexo_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexo" ADD CONSTRAINT "anexo_obra_id_obra_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexo" ADD CONSTRAINT "anexo_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centro_custo" ADD CONSTRAINT "centro_custo_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centro_custo" ADD CONSTRAINT "centro_custo_obra_id_obra_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etapa_padrao" ADD CONSTRAINT "etapa_padrao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedor" ADD CONSTRAINT "fornecedor_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra" ADD CONSTRAINT "obra_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra" ADD CONSTRAINT "obra_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra" ADD CONSTRAINT "obra_responsavel_tecnico_id_usuario_id_fk" FOREIGN KEY ("responsavel_tecnico_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra" ADD CONSTRAINT "obra_gestor_id_usuario_id_fk" FOREIGN KEY ("gestor_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra" ADD CONSTRAINT "obra_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_etapa" ADD CONSTRAINT "obra_etapa_obra_id_obra_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_etapa" ADD CONSTRAINT "obra_etapa_etapa_padrao_id_etapa_padrao_id_fk" FOREIGN KEY ("etapa_padrao_id") REFERENCES "public"."etapa_padrao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_semana" ADD CONSTRAINT "obra_semana_obra_id_obra_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento" ADD CONSTRAINT "orcamento_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento" ADD CONSTRAINT "orcamento_obra_id_obra_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento" ADD CONSTRAINT "orcamento_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfil" ADD CONSTRAINT "perfil_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_perfil_id_perfil_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfil"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_obra" ADD CONSTRAINT "usuario_obra_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_obra" ADD CONSTRAINT "usuario_obra_obra_id_obra_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anexo_entidade_idx" ON "anexo" USING btree ("entidade","entidade_id");--> statement-breakpoint
CREATE INDEX "auditoria_entidade_idx" ON "auditoria" USING btree ("entidade","entidade_id");--> statement-breakpoint
CREATE INDEX "auditoria_obra_idx" ON "auditoria" USING btree ("obra_id","criado_em");--> statement-breakpoint
CREATE INDEX "auditoria_data_idx" ON "auditoria" USING btree ("empresa_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "centro_custo_codigo_uq" ON "centro_custo" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "centro_custo_obra_uq" ON "centro_custo" USING btree ("obra_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cliente_documento_uq" ON "cliente" USING btree ("empresa_id","documento") WHERE "cliente"."documento" is not null and "cliente"."excluido_em" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "fornecedor_documento_uq" ON "fornecedor" USING btree ("empresa_id","documento") WHERE "fornecedor"."documento" is not null and "fornecedor"."excluido_em" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "fornecedor_nome_uq" ON "fornecedor" USING btree ("empresa_id",lower("nome")) WHERE "fornecedor"."excluido_em" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "obra_codigo_uq" ON "obra" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "obra_etapa_ordem_uq" ON "obra_etapa" USING btree ("obra_id","ordem");--> statement-breakpoint
CREATE UNIQUE INDEX "obra_semana_numero_uq" ON "obra_semana" USING btree ("obra_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "orcamento_numero_rev_uq" ON "orcamento" USING btree ("obra_id","numero","revisao");--> statement-breakpoint
CREATE UNIQUE INDEX "perfil_empresa_nome_uq" ON "perfil" USING btree ("empresa_id","nome");--> statement-breakpoint
CREATE INDEX "sessao_usuario_idx" ON "sessao" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "tentativa_login_email_idx" ON "tentativa_login" USING btree ("email","criado_em");--> statement-breakpoint
CREATE INDEX "tentativa_login_ip_idx" ON "tentativa_login" USING btree ("ip","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "usuario_email_uq" ON "usuario" USING btree (lower("email"));
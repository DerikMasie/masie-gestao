CREATE TABLE "arquivo_conteudo" (
	"chave" text PRIMARY KEY NOT NULL,
	"dados" "bytea" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);

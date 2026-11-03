ALTER TABLE "orcamento_item" ALTER COLUMN "quantidade" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "orcamento_item" ALTER COLUMN "quebra" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "orcamento_item" ALTER COLUMN "quebra" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "orcamento_item" ALTER COLUMN "custo_unitario_mao_de_obra" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "orcamento_item" ALTER COLUMN "custo_unitario_material" SET DATA TYPE double precision;
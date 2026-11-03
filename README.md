# Masie Gestão

Sistema web de gestão de obras, orçamento, planejamento e financeiro da **Masie Engenharia**.

- Diagnóstico das planilhas e arquitetura: [`docs/01-diagnostico-e-arquitetura.md`](docs/01-diagnostico-e-arquitetura.md)
- Entrega da Fase 2 (o que está pronto, limitações, testes): [`docs/02-fase2-entrega.md`](docs/02-fase2-entrega.md)
- Diagnóstico das planilhas Financeiro, NF, Orçamento Padrão e Planejamento: [`docs/03-diagnostico-complementar.md`](docs/03-diagnostico-complementar.md)
- Identidade visual e Quadro de atividades: [`docs/04-entrega-identidade-e-quadro.md`](docs/04-entrega-identidade-e-quadro.md)
- Orçamentos (Fase 3, parte 1): [`docs/05-entrega-orcamentos.md`](docs/05-entrega-orcamentos.md)

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL 16 · Drizzle ORM · Zod · Argon2id · Vitest · Playwright.

## Rodando localmente

Pré-requisitos: Node.js 22+ e PostgreSQL 16.

```bash
npm install
cp .env.example .env        # preencha DATABASE_URL, DADOS_SENSIVEIS_CHAVE e SEED_ADMIN_SENHA
npm run db:migrate          # cria/atualiza as tabelas
npm run db:seed             # carga inicial e atualizações de dados (idempotente: rode após cada migração)
npm run dev                 # http://localhost:3000
```

Entre com `SEED_ADMIN_EMAIL` / `SEED_ADMIN_SENHA`. A troca de senha é obrigatória no primeiro acesso.

> **Guarde a `DADOS_SENSIVEIS_CHAVE`** (cofre de senhas da empresa). Sem ela, os dados bancários/PIX
> cifrados dos fornecedores não podem ser lidos.

## Testes

```bash
npm test                    # unitários (cálculos) + integração (usa TEST_DATABASE_URL, que é apagado a cada execução)
npm run typecheck
node tests/e2e/fluxo-fase2.cjs   # ponta a ponta no navegador (ver cabeçalho do arquivo)
node tests/e2e/quadro.cjs        # Quadro de atividades (rodar depois do anterior)
FIXTURE=tests/fixtures/orcamento-padrao-preenchido.xlsx node tests/e2e/orcamento.cjs   # Orçamentos
```

## Produção

```bash
npm run build
npm run db:migrate
npm start
```

Recomendado: Vercel (app) + Supabase ou Neon (PostgreSQL gerenciado com backup). Antes de publicar:

1. Troque o driver local de anexos (`ARMAZENAMENTO_DIR`) por armazenamento de objetos privado. Em servidores sem disco persistente (Vercel), os anexos locais se perdem.
2. Gere uma `DADOS_SENSIVEIS_CHAVE` exclusiva de produção.
3. Sirva apenas por HTTPS. O cookie de sessão é `Secure` em produção.

## Estrutura

```
src/
  dominio/      regras e cálculos puros (sem banco), cobertos por testes unitários
  servicos/     casos de uso com banco: obras, cadastros, usuários, sessões, auditoria, anexos, painel
  db/           esquema Drizzle e conexão
  lib/          autenticação, validação (Zod), criptografia, helpers de server actions
  app/          páginas (App Router) e server actions
  componentes/  UI reutilizável
drizzle/        migrações SQL versionadas
tests/          unit/, integracao/, e2e/
```

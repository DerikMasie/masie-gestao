# Masie Gestão

Sistema web de gestão de obras, orçamento, planejamento e financeiro da **Masie Engenharia**.

- Diagnóstico das planilhas e arquitetura: [`docs/01-diagnostico-e-arquitetura.md`](docs/01-diagnostico-e-arquitetura.md)
- Entrega da Fase 2 (o que está pronto, limitações, testes): [`docs/02-fase2-entrega.md`](docs/02-fase2-entrega.md)
- Diagnóstico das planilhas Financeiro, NF, Orçamento Padrão e Planejamento: [`docs/03-diagnostico-complementar.md`](docs/03-diagnostico-complementar.md)
- Identidade visual e Quadro de atividades: [`docs/04-entrega-identidade-e-quadro.md`](docs/04-entrega-identidade-e-quadro.md)
- Orçamentos (Fase 3, parte 1): [`docs/05-entrega-orcamentos.md`](docs/05-entrega-orcamentos.md)
- Financeiro, notas fiscais e verba (Fase 3, parte 2): [`docs/06-entrega-financeiro.md`](docs/06-entrega-financeiro.md)
- Gestão da obra — planilha, previsto/realizado físico e avanço (Item 1, passos 1.1 e 1.2): [`docs/07-entrega-gestao-obra.md`](docs/07-entrega-gestao-obra.md)
- Publicação (Vercel + Neon): [`docs/08-publicacao-vercel.md`](docs/08-publicacao-vercel.md)
- Medições, contrato e Gerencial (Item 1, passo 1.3): [`docs/09-entrega-medicoes.md`](docs/09-entrega-medicoes.md)

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
node tests/e2e/financeiro.cjs    # Financeiro e notas fiscais (FINANCEIRO=arquivo.xlsm para testar a importação)
PLANILHA=ControlePalco.xlsm node tests/e2e/gestao-obra.cjs   # Gestão da obra (físico) na obra 2026-0001
node tests/e2e/medicoes.cjs      # Medições e Gerencial (depois do anterior)
```

## Produção / versão de testes (Vercel + Neon)

Passo a passo em [`docs/08-publicacao-vercel.md`](docs/08-publicacao-vercel.md). Resumo:

- A Vercel roda `npm run vercel-build`, que aplica as migrações, faz a carga inicial (se `SEED_ADMIN_SENHA` estiver definida) e compila.
- Banco: Neon (integração da Vercel). Migrações usam `DATABASE_URL_UNPOOLED`; o app usa a conexão com pool.
- Anexos e fotos ficam no próprio banco (`ARMAZENAMENTO=banco`, padrão na Vercel).
- Variáveis obrigatórias: `DADOS_SENSIVEIS_CHAVE` (exclusiva do ambiente, guarde-a) e `SEED_ADMIN_SENHA` (senha inicial do administrador).
- Sirva apenas por HTTPS (a Vercel já faz). O cookie de sessão é `Secure` em produção.

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

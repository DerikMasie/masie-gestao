# Publicação da versão de testes (Vercel + Neon)

## O que você faz (uma vez, ~10 minutos)

1. Acesse **vercel.com** → *Sign Up* → **Continue with GitHub** (conta DerikMasie).
2. **Add New… → Project** → selecione **masie-gestao** → *Import*. **Ainda não clique em Deploy**: abra *Environment Variables* e cadastre:
   | Nome | Valor |
   |---|---|
   | `SEED_ADMIN_EMAIL` | e-mail do administrador (ex.: o seu) |
   | `SEED_ADMIN_SENHA` | senha inicial (será trocada no primeiro acesso) |
   | `DADOS_SENSIVEIS_CHAVE` | chave enviada pelo Claude no chat (guarde-a em local seguro) |
3. Clique em **Deploy**. A primeira publicação falha por falta de banco — é esperado.
4. No projeto: **Storage → Create Database → Neon (Serverless Postgres)** → região **São Paulo (gru1)** se disponível → *Connect* ao projeto (marque Production e Preview).
5. **Deployments → ⋯ → Redeploy**. Ao terminar, o endereço aparece no topo (ex.: `masie-gestao.vercel.app`).
6. Entre com o e-mail e a senha do passo 2 e troque a senha.

## O que acontece a cada publicação

`npm run vercel-build`: aplica as migrações do banco (`drizzle/`), executa a carga inicial idempotente (perfis, etapas padrão, plano de contas) e compila o app. Cada `git push` na branch `main` publica automaticamente.

## Observações

- **Anexos e fotos** ficam no banco (tabela `arquivo_conteudo`): privados, com backup do Neon, sem outro serviço. Limite do plano gratuito do Neon: 0,5 GB — suficiente para testes (as fotos do relatório serão reduzidas antes de gravar).
- **Plano gratuito da Vercel (Hobby)** é para uso não comercial; para uso definitivo da empresa, migrar para o plano Pro.
- A chave `DADOS_SENSIVEIS_CHAVE` cifra dados bancários/PIX dos fornecedores. Sem ela esses dados não podem ser lidos; não a troque depois de cadastrar fornecedores.

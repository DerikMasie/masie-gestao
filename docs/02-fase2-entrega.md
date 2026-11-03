# Fase 2: Estrutura principal (entrega)

> 03/11/2026. As decisões em aberto da Fase 1 foram adotadas com as opções recomendadas e podem ser ajustadas:
> semana como base do calendário (D1), fórmula de preço "por dentro" (D3, configurável por empresa, com a legada disponível).
> D2, D4–D7 só têm efeito a partir das Fases 3 e 4.

## Funcionalidades concluídas

| Área | O que funciona |
|---|---|
| **Autenticação** | Login por e-mail e senha (Argon2id), sessão de 30 dias renovada com o uso (token guardado só em hash), logout, **troca obrigatória no 1º acesso**, política de senha, **bloqueio após 5 falhas em 15 min**, troca de senha que derruba as outras sessões |
| **Usuários** | Cadastro com senha provisória exibida uma única vez, edição, inativação (encerra sessões), redefinição de senha. Proteções: sempre há um Administrador ativo, e ninguém inativa a si mesmo |
| **Perfis e permissões** | Os 5 perfis do briefing, já configurados. Matriz **módulo × ação** (ver, criar, editar, excluir, aprovar) editável na tela. Perfis personalizados. Opção "acesso a todas as obras" por perfil |
| **Acesso por obra** | Engenharia e Colaborador só veem as obras às quais estão vinculados. Gestor e responsável técnico são vinculados automaticamente. Tela de equipe por obra |
| **Auditoria** | Toda criação, edição (só os campos alterados, valor anterior → novo), exclusão, login, falha de login, troca de senha, anexo e **visualização de dados bancários** é registrada. Tela com filtros e paginação. Histórico por obra |
| **Empresa** | Dados cadastrais, conta para depósito (antes fixa no relatório), cor da marca e parâmetros padrão de orçamento (lucro MO 50%, material 12%, impostos 10%, extraídos da obra Palco) |
| **Clientes** | Cadastro PF/PJ com validação de CPF/CNPJ, busca e bloqueio de duplicidade por documento. Não exclui cliente que tenha obras |
| **Fornecedores** | Cadastro **único para todas as obras** (antes copiado em cada planilha), 39 especialidades, busca e filtro. **Dados bancários e PIX cifrados (AES-256-GCM)**, revelados sob demanda, com permissão própria e acesso auditado. Impede nomes duplicados ("Emerson" × "emerson") |
| **Etapas padrão** | As 19 etapas da planilha AO, editáveis (nome, ordem, tipo, ativa) |
| **Obras** | Cadastro com todos os campos do briefing, código automático `AAAA-NNNN` (ou manual), edição e exclusão lógica. Lista com busca, filtro por situação e ordenação por coluna |
| **Geração automática** | Ao salvar uma obra, em uma única transação: **centro de custo `OBR-<código>`**, **EAP com as etapas padrão**, **calendário semanal** (segunda a domingo, sem limite de semanas), **orçamento nº 1 rev. 0 em rascunho** com os parâmetros da empresa, e o **vínculo da equipe**. Prorrogar o término acrescenta semanas |
| **Página da obra** | Abas Resumo (indicadores, ficha técnica, barra de prazo), Estrutura, Equipe e acesso, Documentos (upload de PDF, imagens, XLSX, DOCX, XML e DWG até 20 MB, com verificação do conteúdo real do arquivo) e Histórico |
| **Dashboard** | Obras ativas, atrasadas, no prazo e concluídas, carteira contratada, margem prevista ponderada, tabela de prazo decorrido, alertas (atraso, término em 15 dias, obra ativa sem orçamento) e gráfico por situação. Filtros por obra e período |
| **Layout** | Menu lateral filtrado pelas permissões do usuário, responsivo (menu recolhível no celular), cabeçalhos de segurança (X-Frame-Options, nosniff e outros) |

## Limitações conhecidas (honestas)

1. **Indicadores financeiros do dashboard** (faturamento, caixa, contas a pagar e a receber, lucro) **não aparecem** e não são simulados. Dependem dos lançamentos da Fase 3.
2. **Orçamento de custos e margem** da obra são campos informados à mão até existir o orçamento-base (Fase 3).
3. **Valor atualizado com aditivos** só existe a partir da Fase 4. Hoje o sistema mostra o contrato original.
4. **Anexos** usam o disco local do servidor. Para publicar, é preciso trocar por armazenamento privado (S3 ou Supabase Storage). A interface do driver já está isolada em `servicos/anexos.ts`.
5. **Isolamento entre empresas** é feito na aplicação (`empresa_id` em todas as consultas). O Row Level Security do PostgreSQL está previsto para a revisão de segurança da Fase 6.
6. **Recuperação de senha por e-mail** ainda não existe. O administrador redefine a senha e a nova é provisória. Exige um serviço de e-mail transacional.
7. Alterar a **data de início** de uma obra regenera o calendário. Hoje isso é seguro porque ainda não há apontamentos; na Fase 4 a operação passará a ser bloqueada ou remapeada.
8. Planilhas ainda **não recebidas** (Financeiro, NF, Planejamento, Orçamento Padrão) continuam necessárias para a Fase 3.

## Testes realizados

- **49 testes automatizados** (`npm test`), todos passando:
  - **Unitários (34):** fórmulas de preço (reproduzem MO ×1,60 e material ×1,22 da obra Palco e demonstram a perda de margem da fórmula legada), calendário semanal (80 semanas sem truncar, numeração sem repetição, prorrogação), prazo e atraso, código da obra, margem, CPF/CNPJ, leitura de números em formato brasileiro, matriz de permissões, criptografia (incluindo detecção de adulteração) e diferenças na auditoria.
  - **Integração com PostgreSQL (15):** geração completa da estrutura, numeração correta com **4 cadastros simultâneos**, código duplicado, transação desfeita se o cliente é inválido, prorrogação, exclusão lógica, acesso por obra, indicadores do dashboard, login e sessão, bloqueio por tentativas, troca de senha encerrando outras sessões, proteção do último administrador, PIX cifrado e auditado, fornecedor duplicado.
- **Ponta a ponta no navegador** (`tests/e2e/fluxo-fase2.cjs`, 26 verificações) sobre o build de produção: login, troca obrigatória de senha, cadastros, criação e edição de obra, upload (com rejeição de arquivo disfarçado), download autenticado, histórico, revelação de PIX, perfil Engenharia restrito à própria obra e sem acesso à administração, e layout no celular sem rolagem horizontal. Sem erros de console.
- Os testes encontraram e corrigiram 2 defeitos: edição de obra sem gestor falhava, e formulários perdiam o que foi digitado quando havia erro de validação.

## Como usar

1. **Primeiro acesso:** entre com o administrador criado na instalação e defina a nova senha.
2. **Configurações → Empresa:** confira CNPJ, conta para depósito, cor e parâmetros de orçamento.
3. **Configurações → Usuários:** crie as contas da equipe. Copie a senha provisória exibida e envie por um canal seguro.
4. **Clientes → Novo cliente**, depois **Obras → Nova obra:** preencha e salve. A estrutura é gerada na hora (veja a aba *Estrutura*).
5. Na obra, aba **Equipe e acesso:** vincule engenheiros e colaboradores que precisam ver a obra.
6. Aba **Documentos:** anexe contrato, ART e projetos.
7. **Fornecedores:** cadastre os prestadores uma única vez. Dados bancários só para quem tem permissão.
8. **Auditoria:** acompanhe quem fez o quê.

## Próxima fase (3: orçamentos e financeiro)

Editor de orçamento (EAP, composições, BDI, curva ABC, versões, aprovação para orçamento-base, importação de Excel, proposta em PDF), contratações e pedidos (comprometido), notas fiscais com XML NF-e e antiduplicidade, contas a pagar e a receber, bancos, fluxo de caixa, reembolsos e conciliação. **Requer as planilhas Financeiro 2026, Controle Nota fiscais Obra e Orçamento Padrão Masie.**

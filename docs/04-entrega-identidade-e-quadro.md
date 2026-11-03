# Entrega 2.1: Identidade visual e Quadro de atividades

> 03/11/2026

## Identidade visual
- Paleta **preto** (menu lateral, botões principais), **cinza claro** (fundo, bordas) e **amarelo leve** como destaque: item ativo do menu, dia de hoje no calendário, foco dos campos, faixa do login, seleção de texto, cartões que vencem hoje.
- **Logo**: símbolo dos dois edifícios redesenhado em vetor (`src/componentes/logo.tsx`), com o texto "MASIE / ENGENHARIA". Funciona em fundo claro e escuro. O PNG original está em `public/logo-masie.png` para os PDFs.
  - Para fidelidade total, envie o arquivo vetorial oficial (SVG, AI ou PDF) e a fonte usada no logo.
- Gráficos em grafite (série única); amarelo reservado para destaques, nunca como única pista de informação.
- Instalações existentes são atualizadas automaticamente pelo `npm run db:seed` (a cor da empresa passa do azul provisório para o preto).

## Quadro de atividades (novo módulo, menu **Escritório**)
| Recurso | Detalhe |
|---|---|
| Quadros | Vários quadros (ex.: Escritório, Comercial, Compras). O "Escritório" já vem criado. Arquivar quadro |
| Fluxo em colunas | Padrão: A fazer → Em andamento → Aguardando terceiros → Em revisão → Concluído. Colunas renomeáveis, reordenáveis, com **limite de cartões (WIP)** e marcação de "coluna de conclusão" |
| Cartões | Título, descrição, responsável, obra relacionada (opcional), início, entrega, **etiquetas coloridas**, **checklist**, **comentários**, **anexos**, arquivar/restaurar, excluir |
| Arrastar e soltar | Entre colunas e dentro da coluna, com atualização imediata na tela e confirmação no servidor (desfaz se houver erro, ex.: limite da coluna). No celular: "Mover para…" no detalhe do cartão |
| Criação rápida | "Adicionar cartão" no pé de cada coluna (Enter salva) |
| Calendário mensal | Todos os quadros pela data de entrega, com filtro por quadro e responsável, cartões atrasados destacados, **+ no dia** para criar um cartão já com a data |
| Prazos | Atrasado (vermelho, com ícone), vence hoje (amarelo), próximos 2 dias, concluído |
| Dashboard | Card **"Minhas tarefas"** com as tarefas abertas do usuário, ordenadas pela entrega |
| Permissões | Novo módulo "Quadro de atividades" na matriz de perfis. Padrões: Administrador e Diretoria com acesso completo; Engenharia e Adm/Financeiro podem ver, criar e editar; Colaborador pode ver e editar |
| Auditoria | Criação, edição (campo a campo), movimentação entre colunas ("A fazer → Em andamento"), comentários, arquivamento e exclusão |

## Testes
- **67 testes automatizados** (eram 49). Novos: posição fracionária e renumeração de cartões, situação de prazo, grade do calendário (incluindo ano bissexto e virada de ano), fluxo padrão do quadro, mover e reordenar, 45 inserções seguidas no topo sem perder a ordem, limite de WIP, checklist, comentários, calendário, "minhas tarefas", isolamento entre quadros e empresas, contagem de abertos/atrasados e de usuários por perfil.
- **Ponta a ponta** (`tests/e2e/quadro.cjs`, 11 verificações) no build de produção, incluindo arrastar e soltar real no navegador, persistência após recarregar, bloqueio pelo limite da coluna, calendário, dashboard e uso no celular pelo perfil Engenharia. A regressão da Fase 2 (`tests/e2e/fluxo-fase2.cjs`, 26 verificações) segue passando.
- Todas as telas foram abertas no modo de desenvolvimento do React (mais rigoroso) sem nenhum aviso.

## Defeitos encontrados e corrigidos nesta entrega
1. **Contagem de usuários por perfil sempre 0** (subconsulta SQL ambígua). Existia desde a Fase 2 e foi pega ao criar o mesmo tipo de consulta no Quadro. Corrigido, com teste.
2. Menu lateral aberto no celular, causado pela troca automática de classes de cor que alterou uma classe de posicionamento. Corrigido.
3. Formulário dentro de formulário no painel de etiquetas (HTML inválido). Corrigido.
4. Inserções repetidas no topo de uma coluna esgotavam a precisão da posição. A coluna agora é renumerada automaticamente.

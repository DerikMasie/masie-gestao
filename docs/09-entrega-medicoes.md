# Item 1: Gestão da obra, passo 1.3 (medições, contrato e Gerencial)

> 05/11/2026. Base: abas Realizado/Previsto medição, CálculoGerencial, Gerencial, Realizado/Previsto fornecedores e Relatório Situação (resumo do contrato) da planilha de controle. Valores conferidos com o ControlePalco.xlsm.

## Regras (decisões do cliente aplicadas)

| Regra | Como ficou |
|---|---|
| Medição = valor cliente × % executado | Somada por período; contrato e aditivos separados; faturamento direto fica fora |
| Período de medição | **1 a 4 semanas por obra** (padrão quinzenal). A data da medição é a sexta-feira da última semana, dia de emissão do relatório. O período fica travado depois da 1ª medição fechada |
| O medido já é cobrado | Cobrança = contrato × (1 − % entrada) + aditivos + descontos/reembolsos. **A entrada não abate aditivos** |
| Situação | **Paga / não paga**, com a data do pagamento |
| Fechamento | Fechar a medição congela os valores; só é possível em ordem e a partir da última semana do período. Reabrir só a última, se não estiver paga (permissão "aprovar"). Se o realizado de semanas já fechadas mudar, a diferença entra como **ajuste de períodos anteriores** na primeira medição aberta |
| Aditivos, descontos, reembolsos | Lista do contrato (tabela do Relatório Situação). Aditivos aumentam o contrato e são medidos pelos serviços da etapa Aditivos; há aviso se os dois valores não baterem. Descontos e reembolsos entram na cobrança da medição escolhida |
| Saldo do cliente | Contrato − entrada + aditivos/descontos/reembolsos − medições quitadas − material faturado em nome do cliente (NFs marcadas como "faturado ao cliente") |
| Reprojeção | O que falta cobrar é distribuído pelo previsto dos períodos restantes. O coeficiente aparece na tela (acima de 1 = obra atrás do previsto) |
| Fornecedores | Executado (medição do fornecedor) = MO acertada × % executado; a pagar = acertado − pago; executado não pago = executado − pago |
| Pagamentos a fornecedores | **Manuais**, por fornecedor e semana (como no Gerencial). Integração com o Financeiro fica para depois |

## Telas (obra → Gestão da obra)

- **Medições:**
  - indicadores: medição em aberto, executado, a cobrar, saldo do contrato;
  - tabela por medição: período, contrato, entrada, aditivos, descontos/reembolsos, ajustes, cobrança, previsto, estado, situação, fechar/reabrir;
  - **Resumo do contrato**, igual à página 2 do relatório;
  - lançamento de aditivos, descontos e reembolsos.
- **Gerencial:**
  - indicadores: valor a cobrar, total executado, saldo a pagar, fornecedores a pagar, previsão de pagamento;
  - gráfico de cobrança por medição (previsto × realizado × reprojetado, com acumulados);
  - tabela de fornecedores;
  - **grade de pagamentos semana a semana**;
  - previsão de pagamentos por período.

**Permissões (módulo Medições e aditivos):** criar = fechar e lançar ajustes; editar = situação e pagamentos; aprovar = reabrir. O Gerencial também exige ver Orçamentos (valores).

## Conferência com o ControlePalco (valores do Excel)

| Valor | Planilha | Sistema |
|---|---|---|
| Cobrança da quinzena 1 | 46.987,77 (Gerencial!G7) | 46.987,77 |
| Cobrança da quinzena 2 | 30.209,88 (Gerencial!I7) | 30.209,88 |
| Total executado de cobrança | 77.197,65 (D19) | 77.197,65 |
| Saldo total a pagar | 103.089,34 (D22) | 103.089,34 |
| Executado do fornecedor Everton (semanas 1 e 2 / total) | 5.282,28 / 6.204,58 / 11.486,86 | idem |
| Executado do fornecedor Frigelar | 11.117,31 | 11.117,31 |

## Correções em relação à planilha

- **"Mês":** deixa de ser 4 semanas fixas; o período é escolhido por obra.
- **Previsto de contrato:** não zera mais (era a origem dos 1.259 `#DIV/0!` da planilha).
- **Reprojeção de fornecedores:** usa o realizado (a planilha lia uma linha vazia e dava 0%).
- **Cobrança prevista:** não lê mais os descontos do realizado.
- **Saldo do cliente:** todas as medições entram (a planilha ignorava as medições 17–21).
- **Medição já cobrada:** mudanças posteriores no realizado não são perdidas nem cobradas duas vezes.
- **Importação da planilha:** fornecedores ausentes do cadastro agora são criados (só com o nome), para o Gerencial agrupar por fornecedor.

## Dados de teste

A obra 2026-0001 (Palco) tem os pagamentos da semana 2 registrados no Gerencial do ControlePalco: Emerson 1.000, Everton 12.000, Danilo 6.000, Frigelar 11.117,31 e Paulo 3.190.

## Testes

- 134 testes unitários e de integração.
- Ponta a ponta: `tests/e2e/medicoes.cjs` testa fechar, pagar, reabrir, desconto, pagamento e os valores do Palco, e desfaz as próprias alterações.

## Próximo passo

**1.4 Relatório semanal.**
- Página 1: situação da obra, com os gráficos do físico e os 4 textos.
- Página 2: relatório financeiro, com o resumo do contrato, as medições e situações, os aditivos e os dados de depósito do cadastro da empresa.
- Páginas seguintes: relatório fotográfico de 6 a 12 fotos em grade simétrica.
- Saída em PDF, com versões por semana.

# Fase 3, parte 2: Financeiro, notas fiscais e verba por etapa (entrega)

> 04/11/2026. Decisões aplicadas:
> - **D11**: lista única de etapas (EAP), com de-para dos subitens.
> - **D12**: empréstimos, aplicações, transferências e saldo inicial ficam **fora do resultado**.
> - **D13**: importação do histórico do Financeiro 2026.

## O que está pronto
| Área | Detalhe |
|---|---|
| **EAP única (D11)** | 16 etapas do Orçamento Padrão + Serviços adicionais, Aditivos e Faturamento direto. Etapas antigas foram renomeadas (ex.: "Serviços iniciais" → "Serviços preliminares"). 36 subitens de material e de MO terceirizada estão ligados às etapas (ex.: "Elétrico" e "MO Terceirizada - Elétrica" → Instalações elétricas/lógicas) |
| **Plano de contas** | Os 16 grupos e subitens do Financeiro, com natureza (receita, custo, despesa, imposto, retirada, financiamento, aplicação, transferência, ajuste). Editável, com o de-para para a etapa |
| **Contas bancárias e caixas** | Saldo inicial, contas de sócio sinalizadas e saldo calculado a partir dos lançamentos |
| **Lançamentos (razão)** | Entradas e saídas com conta, centro de custo e classificação obrigatórios. Filtros e totais |
| **Contas a pagar e a receber** | Títulos com parcelas (divisão em centavos), situação (vencida, vence hoje, programada, a vencer) e "boleto programado". A baixa gera o lançamento no caixa; excluir o lançamento estorna a baixa |
| **Provisão semanal** | Matriz fornecedor × obra da semana, mais as parcelas vencidas em aberto, gerada automaticamente (substitui a aba montada à mão) |
| **Notas fiscais** | Lançamento único que gera a conta a pagar (fim da dupla digitação NF × Financeiro). Tipos: à vista (pode baixar na hora), a prazo, acumulada e devolução (abate a verba). Faturamento direto ao cliente fica fora do custo. **Antiduplicidade** por fornecedor + número + série e pela chave de acesso. Cancelamento bloqueado se houver parcela paga |
| **XML da NF-e** | Lido no navegador para preencher o formulário: número, série, emissão, valor, chave, parcelas e vencimentos das duplicatas, itens. O fornecedor é reconhecido pelo CNPJ ou cadastrado ao salvar. O servidor confere chave e valor. Entidades XML não são expandidas (proteção contra arquivo malicioso) |
| **Verba por etapa** | Orçado (orçamento-base) × incorrido × pago × a pagar × saldo, por etapa. Alertas: ≥ 90%, estourada e "não planejado" (gasto sem verba, como na planilha de NF). O formulário de NF mostra o saldo da etapa e avisa antes de gravar uma compra que estoura a verba. Uma NF paga não é contada duas vezes |
| **Resultado** | Por centro de custo (obra, projeto, consultoria, interno): receitas, custos e despesas, impostos, resultado, margem, a pagar e a receber do contrato. Resultado da empresa por mês e por ano, com retiradas abaixo do resultado |
| **Painel financeiro** | Saldo em contas, a pagar (vencido, 7 e 30 dias), a receber, resultado do ano e do mês, fluxo de caixa de 12 meses realizados + 3 previstos e saldo por conta |
| **Dashboard geral** | Saldo, faturamento do mês e do ano, resultado do ano com margem, a pagar em 30 dias e a receber |
| **Obra → aba Financeiro** | Indicadores, verba por etapa com barra de consumo, notas fiscais da obra |
| **Importação do histórico (D13)** | Planilha Financeiro .xlsm (macros descartadas, nunca executadas): plano de contas, bancos, 81 centros de custo, razão completo e contas a pagar em aberto. Relatório por ano, lista de reclassificações e de pendências. Bloqueia reimportar o mesmo arquivo e permite **desfazer** |

## Resultado da importação do arquivo real (conferência)
- **7.148 lançamentos** de 01/01/2024 a 27/10/2026, importados em cerca de 2 segundos. A única linha sem valor foi ignorada.
- **Impostos idênticos aos da planilha** em todos os anos.
- Reclassificados para fora do resultado:
  - Pronampe: R$ 391.571;
  - empréstimo contratado: R$ 65.000;
  - resgates de aplicação: R$ 75.534,71 (29 lançamentos).
- **Pendências para a equipe revisar:**
  - 393 lançamentos sem subitem (classificados como "Não especificado");
  - 29 resgates de aplicação para confirmar (F-2);
  - 14 "Pró-Labore" lançados em Impostos (F-3);
  - 4 lançamentos sem centro de custo (agrupados em "SEM-CC");
  - 3 valores digitados como texto (convertidos).
- **Ponto de atenção:** sem o Pronampe, o resultado operacional de 2026 (até outubro, regime de caixa) fica **negativo em cerca de R$ 287 mil**. Na planilha original, com o empréstimo contado como receita, ele aparecia positivo em cerca de R$ 105 mil.
- Os impostos pagos equivalem a **4,3% das receitas de 2026**, abaixo da faixa de 9% a 12% informada. Vale conferir com a contabilidade.
- **Saldos por conta**: dependem do saldo inicial de cada conta (não existe na planilha). Ajuste em Configurações → Contas, conferindo com os extratos.

## Limitações
- **A receber**: ainda vem só de títulos lançados manualmente. Gerar a receber a partir das medições é a Fase 4.
- **Conciliação bancária** (importar extrato OFX) e **rateio de uma NF entre várias etapas**: próximas entregas.
- **Pedidos de compra e contratos com prestadores** (o "comprometido" antes da NF): entram com o planejamento e as medições (Fase 4). Hoje o comprometido é a NF lançada.
- **Contas ADM mensais** (checklist de contas fixas): pode virar um quadro com cartões recorrentes no Quadro de atividades, se quiserem.
- **XML**: apenas NF-e modelo 55. NFS-e de serviço (padrão municipal) não é lida automaticamente.

## Testes
- **99 testes automatizados**. Os novos cobrem:
  - resultado com D12;
  - parcelas;
  - situação de vencimento;
  - verba e alertas;
  - EAP e de-para;
  - XML da NF-e (inclusive arquivo malicioso);
  - NF com parcelas, pagamento e incorrido sem dupla contagem;
  - duplicidade;
  - devolução e faturamento direto;
  - à vista paga;
  - cancelamento;
  - contas a receber e resultado por centro;
  - importação de planilha sintética (D12, pendências, reimportação bloqueada e desfazer).
- **Ponta a ponta** (`tests/e2e/financeiro.cjs`, 12 verificações). Cobre:
  - importação do arquivo real;
  - painel e resultado por centro;
  - NF via XML com fornecedor e aviso de verba;
  - bloqueio de duplicidade;
  - pagamento;
  - provisão semanal;
  - aba Financeiro da obra;
  - razão;
  - dashboard;
  - plano de contas e contas bancárias.
- Defeito encontrado e corrigido: ao registrar um pagamento, a parcela sumia da lista junto com a mensagem de confirmação. Agora a confirmação aparece no topo da página.

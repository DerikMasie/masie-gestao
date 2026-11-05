# Item 1: Gestão da obra, passo 1.1 + 1.2 (planilha, previsto, realizado e avanço)

> 05/11/2026. Base: planilha de controle "AO [OBSOLETO]" (idêntica, célula por célula, à analisada no diagnóstico 01) e ControlePalco.xlsm (dados reais usados na conferência).

## Decisões do cliente aplicadas

| # | Pergunta | Decisão | Como ficou no sistema |
|---|---|---|---|
| 1 | Peso do avanço | **Pela duração** ("o valor vai se diluindo conforme os dias") | % relativo = duração ÷ duração total, igual à planilha |
| 2 | MO acertada | Valor proposto ao prestador, pago conforme a atividade avança | Campo por serviço; custo do fornecedor = acertada × % executado (usado no passo 1.3) |
| 3 | Previsto | **Como na planilha**, aceitando sugestão | Grade semana × serviço igual à planilha + ferramenta opcional "Distribuir" (início, fim e % → divide igualmente) |
| 4 | Medição | Quinzenal em geral; às vezes mensal; o medido é cobrado | Período **por obra: 1, 2, 3 ou 4 semanas** (padrão 2). As colunas da grade já mostram "Medição n" |
| 5 | Situação da medição | Paga / não paga | Fica para o passo 1.3 |
| 6 | Entrada | % do contrato, abatido das medições e nunca dos aditivos | Fica para o passo 1.3 (regra R7 já documentada) |
| 7 | Quem lança | Engenheiro da obra, ao longo da semana, para emitir na sexta | Tela **Lançar semana** (celular) com permissão "Planejamento → Editar". Cada gravação fica no histórico |
| 8 | Evolução por tipo de serviço | Etapas 1–15 + Aditivos; permitir categoria nova | Marcação "no relatório" por etapa (Aluguel, Serviços adicionais e Faturamento direto desligados por padrão) + **Nova categoria** na obra |
| 9 | Pagamentos a fornecedores (print 2) | Manual por enquanto; depois o financeiro puxa da obra | Fica para o passo 1.3, como lançamento manual na obra |
| 10 | Fotos | 6 a 12 por relatório, legenda opcional | Passo 1.4 |
| 11 | Envio | PDF; depois, link com a última versão | Passo 1.4 |
| D14 | Prioridade (planejamento semanal) | Aceita a sugestão para teste: urgência calculada pela data final, com ajuste manual | Será aplicada no módulo de Planejamento semanal |

## O que está pronto: obra → aba **Gestão da obra**

| Tela | O que faz |
|---|---|
| **Avanço** | Realizado × previsto até a semana atual, diferença em pontos, semana atual, medição atual e semana em que o previsto chega a 100%, valor executado (cliente). Rosca de progresso, **evolução por tipo de serviço** (barra do realizado + traço do previsto até a semana) e **curva de avanço acumulado** (previsto tracejado × realizado até a semana atual, como "Aparece no gráfico?" da planilha). Os mesmos gráficos vão para o relatório semanal |
| **Lançar semana** | Uma semana por vez, com navegação ‹ ›. Filtros: "desta semana" (previsto nela ou já lançado), "em aberto" e "todos". Cada serviço mostra o fornecedor, o previsto da semana e o previsto até a semana, a barra do acumulado (anterior em preto, semana em amarelo), o campo "% nesta semana" e o botão **Concluir** (lança o que falta para 100%). Avisa ao sair sem salvar. Funciona no celular |
| **Realizado físico** | Grade igual à aba da planilha: etapas recolhíveis, serviços, Dur., % rel., % concluído, colunas por semana agrupadas por medição, semana atual em amarelo. Linhas de total: avanço da semana, acumulado realizado, acumulado previsto e diferença (a linha "% Realizado" do Previsto, que na planilha apontava para uma linha vazia). Digitação com Enter e setas, **colar um bloco do Excel**, Esc desfaz a célula e salvar em lote |
| **Previsto físico** | A mesma grade para o previsto, com a ferramenta **Distribuir** |
| **Planilha da obra** | Colunas da esquerda do Realizado-Físico: serviço, fornecedor (cadastro), MO acertada, curva ABC (informada ou calculada pela verba, marcada com *), meta de fechamento (A 80%, B 90%, C 95%), TDU (vermelho acima de 100%), MO verba, diferença, valor cliente, duração e % concluído. Totais por etapa e da obra. Aviso quando a soma do valor cliente das etapas de contrato difere do contrato. Cada campo é salvo ao sair dele. Incluir serviço (+ na etapa) e excluir (bloqueado se já houver realizado). Marca "no relatório" por etapa |
| **Como começar** | (a) **Gerar do orçamento-base**: um serviço por item (MO) + "Material de …" por etapa; o valor cliente inclui o imposto rateado e soma o total da proposta. (b) **Importar a planilha de controle** (.xlsx/.xlsm do modelo AO/Palco), que lê serviços, fornecedor, valores, duração, curva ABC, previsto e realizado semanais. As colunas são localizadas pelo cabeçalho, e não pela posição. As semanas são encaixadas pela data, e a importação recusa uma planilha que começa antes do início da obra. Substituir a planilha atual exige marcação explícita. (c) Manual |

**Permissões (módulo Planejamento):** ver = abas; editar = lançar o realizado; criar = planilha, previsto e período de medição. As colunas de valores só aparecem para quem vê Orçamentos.

## Conferência com a planilha real (Palco)

O motor reproduz exatamente os números calculados pelo Excel no ControlePalco:

| Indicador | Valor |
|---|---|
| Avanço semanal realizado | 14,7% · 25,9% · 16,4% · 7,5% |
| Acumulado realizado | **64,5%** |
| Previsto semanal até 100% | 10 semanas |
| Contribuição de cada etapa por semana | idêntica em todas as 17 etapas |
| Totais | duração 50; verba R$ 81.857,03; acertado R$ 47.574,27; valor cliente R$ 128.861,68 |

A obra de teste **2026-0001 (Palco)** está carregada com essa planilha.

## Correções em relação à planilha

1. **Avanço da etapa.** A linha da etapa usava a média simples dos serviços, enquanto o "% concluído" usava a média ponderada pela duração. Agora as duas usam a duração. O resultado é igual quando as durações são iguais (caso do Palco) e correto quando não são.
2. **Semanas sem limite.** A planilha somava só 36 a 47 semanas.
3. **Total por serviço.** Não pode passar de 100%. A gravação é tudo ou nada e indica qual serviço está errado.
4. **Comparativo realizado × previsto.** Na planilha, a linha "% Realizado" do Previsto lia a linha vazia 1013; agora o comparativo funciona.

## Achados na planilha do Palco (para conferir)

- **MO acertada repetida em todas as linhas da etapa.** Gesso tem 5 × R$ 638, pintura 4 × R$ 875 e instalação de ar-condicionado 4 × R$ 1.500. Pela resposta 2, o valor é **por serviço**. Se esses números forem o total do prestador para a etapa, o acertado fica multiplicado e a TDU aparece acima de 100% (em vermelho na tela). Basta corrigir na Planilha da obra.
- **Fornecedores sem cadastro.** Emerson/emerson, Danilo, Frigelar, Paulo e Matias não estão no cadastro. Ficaram anotados na observação do serviço; quando forem cadastrados, basta selecioná-los.

## Testes

- Unitários e de integração: **120 passando**. Os novos cobrem o motor do físico contra os valores do Excel, importação, trava de 100%, permissões por obra, geração do orçamento-base, categorias e período de medição.
- Ponta a ponta: `PLANILHA=ControlePalco.xlsm node tests/e2e/gestao-obra.cjs` testa importação, edição da planilha, avanço de 64,5%, bloqueio acima de 100%, colar do Excel, distribuir, lançar semana (64,5% → 64,7%), celular e ausência de erros no console.

## Próximos passos

- **1.3 Medições e Gerencial.** Medição por período (1–4 semanas) = valor cliente × % executado; cobrança = medição × (1 − % entrada) + aditivos; situação paga/não paga; reprojeção pelo ritmo real; pagamentos a fornecedores lançados à mão na obra; custo apropriado = acertada × %.
- **1.4 Relatório semanal.**
  - Página 1: situação da obra, com os gráficos desta entrega e os 4 textos.
  - Página 2: financeiro.
  - Páginas seguintes: relatório fotográfico com 6–12 fotos em grade simétrica (recorte 4:3 e ponto focal).
  - Saída em PDF, com versões por semana.

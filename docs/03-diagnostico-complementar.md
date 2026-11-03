# Diagnóstico complementar: Financeiro, Notas Fiscais, Orçamento Padrão e Planejamento Semanal

> 03/11/2026. Complementa o [diagnóstico da Fase 1](01-diagnostico-e-arquitetura.md) com as 4 planilhas recebidas depois.
> Nenhum dado pessoal (nomes, PIX, descrições de lançamentos) foi copiado para este documento; foram lidos só a estrutura e os totais.

---

## 1. Financeiro 2026.xlsm

### 1.1 Estrutura
| Aba | Papel |
|---|---|
| **Fluxo De Caixa** (tabela `DFC_FLUXO_CAIXA`) | **Razão de caixa**: 7.149 lançamentos de 2024 a 2026 (data, ItemReferencia, SubItem, centro de custo, descrição, banco, crédito, débito). Painel com saldo por banco e gráficos dinâmicos |
| **Centros de Custo** (`Tab.CentrosDeCustos`) | 81 centros: **71 obras**, 9 internos e 1 consultoria. Contrato, aditivos, créditos, a receber, débitos, a pagar, lucro e margem |
| Contas a Pagar (`Tab.ContasAPagar`) | NF, emissão, empresa, tipo (à vista/a prazo), parcelas, vencimento, classificação, centro de custo, "boleto programado?", dias até o vencimento e aviso |
| PROVISÃO PAGAMENTOS | Matriz semanal **fornecedor × obra** com valores a pagar na semana, mais um bloco de recebimentos previstos |
| Faturamento | NF emitidas por mês (2024 e 2025), recebido × emitido por obra e **resultado por obra** (recebido − gasto − imposto 13,5% − rateios) |
| Contas ADM Mensais | Checklist mensal das contas fixas do escritório (aluguel, condomínio, contabilidade, salários…) |
| Aux.Listas | **Plano de contas**: 16 grupos (ItemReferencia) com subitens e tipo (Custos, Despesas, Impostos, Receitas, Retiradas, Transferências) |
| Aux.Bancos / Aux.Gráficos | 16 contas/caixas e tabelas dinâmicas dos gráficos |

**Macros:** apenas `Atualizar` (`RefreshAll` dos gráficos). Nenhuma regra de negócio em VBA.

### 1.2 Regras identificadas (a preservar)
- **F1. Plano de contas em 2 níveis.** ItemReferencia (grupo) → SubItem, por exemplo *Custos com pessoal → MO Terceirizada – Elétrica*. O SubItem depende do grupo (lista em cascata com `INDIRECT`). Isso vira a tabela `plano_conta` hierárquica.
- **F2. Todo lançamento tem centro de custo.** Só 4 dos 7.149 lançamentos estão sem centro de custo, o que confirma a regra do briefing.
- **F3. Tipos de centro de custo:** Obra, Projeto, Consultoria e Interno. O sistema hoje só cria o tipo Obra e precisa ganhar os outros três.
- **F4. Resultado do centro de custo** (regime de caixa): `Lucro = Créditos − Débitos − A pagar (a vencer)`, `Margem = Lucro ÷ Créditos`, `A receber = Contrato + Aditivos − Créditos`.
- **F5. Contas a pagar:** situação pelo vencimento (vencido, dias restantes) e pela flag "boleto já programado".
- **F6. Provisão semanal:** quanto pagar a cada fornecedor, por obra, na semana. Vem dos contratos e das medições internas.
- **F7. Saldos por banco/caixa**, incluindo contas PF dos sócios e caixas físicos. As transferências internas (394 lançamentos, R$ 1,9 mi) zeram entre si.

### 1.3 Inconsistências encontradas
| # | Problema | Impacto |
|---|---|---|
| F-1 | **Pronampe (R$ 391.571) lançado como "Receita financeira"** e "Empréstimos contratados" (R$ 65.000) como "Outras receitas" | Empréstimo é **passivo**, não receita. Hoje o resultado fica inflado em ~R$ 456 mil. No sistema, empréstimos e amortizações ficam fora do resultado |
| F-2 | "Aplicações financeiras" com R$ 75,5 mil só em créditos, sem os débitos das aplicações | Resgate de aplicação parece estar contado como receita. **Validar** |
| F-3 | "Pró-Labore" aparece em **Impostos** (14 lançamentos) e em **Retiradas de sócios** (48) | Classificação dupla. Provavelmente o INSS do pró-labore está em Impostos; confirmar |
| F-4 | Subitens repetidos entre grupos: "Estacionamento" em 3 grupos, "RT – Arquitetas" em custo e em despesa, "Seguro de Obra" em custo e em receita | Relatórios por subitem somam coisas diferentes |
| F-5 | **Três alíquotas de imposto diferentes:** 10% (orçamento AO), 13,5% (Faturamento) e **~5% efetivo pago** (DAS: 5,3% em 2024, 5,0% em 2025, 4,4% em 2026) | A margem orçada e o resultado por obra não batem. Ver decisão **D9** |
| F-6 | Nº de contrato misto: "2023-0001" (texto) e 1, 2, 3… (número) | Códigos não padronizados. O sistema adota `AAAA-NNNN` |
| F-7 | 393 lançamentos sem SubItem; 4 com valor digitado como texto | Ficam fora dos relatórios por subitem. O importador sinaliza esses casos |
| F-8 | Lucro do centro de custo pelo **caixa** (créditos − débitos) | Não considera o que falta medir/receber nem o custo comprometido. O sistema mostra caixa e competência lado a lado (decisão D4) |
| F-9 | Faturamento: valores de NF somados à mão dentro da fórmula (`=62627,64+30186,6+…`) | Sem rastreabilidade de qual NF compõe o total |
| F-10 | Provisão semanal: fornecedores e obras escritos à mão, e colunas com `#REF!` | Retrabalho semanal, frágil |
| F-11 | Contas PF de sócios e caixas pessoais misturados às contas da empresa | Recomendação contábil: separar. O sistema marca essas contas como "conta de sócio" |

---

## 2. Controle Nota fiscais Obra.xlsm

### 2.1 Estrutura e regras
- **Lançamento NFs** (`ContasAPagar`): nº NF, empresa, **tipo de NF** (À vista/débito, A prazo, Acumulada e **Devolução, com valor negativo**), valor, data de emissão (competência), ItemReferencia, Subitem e centro de custo. A **chave** é centro de custo + subitem.
- **Verbas** (`Tabela.verbas`): verba inicial por **centro de custo × subitem de material** (16 subitens), e *valor dispendido* = soma das NFs com a mesma chave.
- **Planejado × Realizado**: para a obra escolhida, verba × gasto por subitem e `% = gasto ÷ verba`. Se não houver verba e houver gasto, mostra **"VALOR NÃO PLANEJADO"**. Velocímetro com faixas de 0–25% até 125%+.
- Serve como orientação ao usuário: "classificar de acordo com a obra a qual se destina o custo (verificar o endereço de entrega)".

### 2.2 Inconsistências
| # | Problema | Impacto |
|---|---|---|
| N-1 | Controla só **material** (macro item "Custos_de_material"); a mão de obra não entra | O "saldo de verba por etapa" do briefing precisa cobrir MO, material e terceiros |
| N-2 | Os 16 subitens de material **não coincidem** com as 19 etapas do AO nem com as 16 etapas do Orçamento Padrão (ex.: "Elétrico" × "Instalações elétricas/lógicas", "Estrutural" × "Reforço estrutura") | Sem um de-para, não há como comparar orçado × realizado. O sistema terá **uma única EAP** com mapeamento |
| N-3 | Obra digitada como texto ("Obra XPTO") em vez do código do centro de custo | Não conversa com o Financeiro |
| N-4 | NF registrada aqui **e de novo** no Financeiro (Contas a Pagar e Fluxo de Caixa) | Dupla digitação e risco de duplicidade. No sistema: **uma NF, várias parcelas, um pagamento** |
| N-5 | Validações quebradas (`#REF!` em C13:D13 e D22) | — |
| N-6 | Macro `MacroEstoque`: insere uma linha copiando B3:D3, herança de uma planilha de estoque; não corresponde às abas atuais | Obsoleta, não será portada |
| N-7 | Sem controle de parcelas, vencimentos nem anexo da NF | Previsto no sistema (parcelas, PDF/XML e leitura de NF-e) |

---

## 3. Orçamento Padrão Masie.xlsx

### 3.1 Estrutura
| Aba | Papel |
|---|---|
| **LEVANTAMENTOS** (`Tabela1`) | Levantamento por **pavimento/ambiente**: área, perímetro, pé-direito e descontos (piso, parede, teto, rodapé); pontos elétricos (derivação, rede embutida, rede sobreposta); pontos hidrossanitários (AF, AQ, registros, cloacal, gás, metais, acessórios); revestimentos por tipo de acabamento (área de parede = perímetro × pé-direito − desconto, etc.), totalizados por tipo |
| **ORÇAMENTO** | **16 etapas, 375 linhas, 233 serviços descritos.** Para cada item: unidade, quantidade, **quebra (perda)**, valor unitário de MO e de material, valor sem BDI e valor final |
| **PROPOSTA** | Parâmetros: **BDI MO 30%**, **gerenciamento de materiais 10%**, imposto, **adicional por horário** (comercial/noturno), **adicional por local** (perto/longe) e **valor mínimo de MO**. Investimento por etapa, imposto e total. Análise de custo, lucro, prazo, lucro/mês e diárias (MO ÷ valor da diária × nº de pessoas) |
| **ABC** | Curva ABC de **material** por etapa: A ≤ 80%, B ≤ 95%, C acima disso. Exige **ordenar à mão** |
| CRONOGRAMA – Previsão | Etapas × semanas, preenchido à mão |
| MATERIAIS – Preço unitário (`Tabela3`) | Catálogo de materiais com etapa, unidade e R$/unidade ("atualizar com os preços da região") |
| MATERIAIS – Composições | Composições de materiais (ex.: elétrico) que buscam o preço pelo **nome** do material |
| TUTORIAL CONTAGENS | Imagem de orientação |

### 3.2 Fórmulas de preço (regras O1–O4)
- **O1. Custo de MO do item** = `ARRED.CIMA( SE(0 < MO_unit × qtd < mínimo; mínimo; ARRED.CIMA(MO_unit × qtd) × (1 + %horário + %local)) )`
- **O2. Custo de material** = `ARRED.CIMA(Mat_unit × qtd × quebra)`. A quebra é um fator multiplicativo (1 = sem perda).
- **O3. Preço de venda** = `MO × (1 + BDI MO)` + `Material × (1 + gerenciamento)`, com arredondamento por linha.
- **O4. Investimento total** = `Σ preço + ARRED.CIMA(Σ preço × % imposto)`, ou seja, imposto **por fora**, somado ao preço.

Fórmulas **consistentes**: nenhuma das 333 linhas de serviço foge do padrão. Há verificações embutidas ("Check de fórmula = OK").

### 3.3 Inconsistências e pontos de atenção
| # | Problema | Impacto |
|---|---|---|
| O-1 | **Imposto "por fora"**: `total × (1 + imposto)`. O imposto incide sobre o faturamento, que já o inclui | Com imposto de 10%, cobra-se 10% do preço sem imposto, mas paga-se 10% do total. Diferença de ~1% do contrato. Ver **D9** |
| O-2 | O **valor mínimo de MO** substitui o cálculo **sem** os adicionais de horário/local | Serviço pequeno em horário noturno sai mais barato que o devido |
| O-3 | **ARRED.CIMA em cada linha** (e em cada etapa) | Pequena inflação acumulada (≤ R$ 1 por linha × 2 arredondamentos). O sistema arredonda **a centavos** e mostra a diferença |
| O-4 | **89 quantidades com contas manuais** (`=F167+F179+…`, entulho estimado `ROUNDUP((F44×0,15×2+…)/4)`) | É "memória de cálculo". O sistema guarda a fórmula do item como texto auditável, além do valor |
| O-5 | ABC só de material e com ordenação manual | O sistema calcula sozinho a ABC por **serviço** e por **insumo**, para MO, material e total |
| O-6 | Composições buscam material **pelo nome** (texto idêntico) | Renomear um material quebra a composição. O sistema usa código |
| O-7 | Parâmetros diferentes dos da obra Palco (BDI MO 30% + gerenciamento 10% aqui; 50%/12% + imposto 10% no AO) | São duas gerações do modelo. **Confirmar os parâmetros vigentes (D10)** |
| O-8 | Somas totais com lista fixa de linhas (`SUM(J367,J330,…)`) e subtotais com faixas fixas | Inserir serviço no fim da etapa pode ficar fora do subtotal. No sistema os totais são sempre derivados |
| O-9 | Etapas do orçamento (16) ≠ AO (19) ≠ NF (16 subitens) ≠ plano de contas | Ver N-2. Proposta de **EAP única**: as 16 do Orçamento + Aditivos + Faturamento direto + Serviços adicionais, com de-para |

---

## 4. Planejamento Semanal.xlsx

### 4.1 Estrutura e regras
- **Uma aba por semana** (S0307 … S0211, 11 semanas, 232 atividades), cada uma copiada da anterior. Colunas: **tipo de serviço**, **responsável** (especialidade: pintor, pedreiro… ou "Própria"), **obra**, **atividade**, **data final**, **meta da semana**, **prioridade**, e marcação "x" nos dias de **Seg a Sex da semana seguinte** (12 colunas).
- Listas: **Tipo de serviço** (Contrato, Retrabalho por erro da empresa/projeto/fornecedor, Alteração do cliente, Aditivo absorvido, Assistência técnica, Serviço de terceiros), **Status de execução** (Concluído, Em andamento, Não iniciado), **Status de prazo** (Dentro, Fora), **Impacta o prazo final?** (Sim, Não, Há risco), **Responsável pelo atraso** (Masie, Masie–Fornecedor, Terceiro, Cliente), **Prioridade** (Urgente, Alta, Média, Baixa).
- Abas ocultas "Finalização <obra>": checklist de encerramento (serviço, equipe, cronograma, observação).
- Atividades com obra **"Administrativo"**: tarefas internas do escritório já misturadas ao planejamento de obra. Isso conversa diretamente com o novo pedido de **quadro de atividades do escritório**.

### 4.2 Inconsistências
| # | Problema | Impacto |
|---|---|---|
| P-1 | As listas de **status, impacto no prazo e responsável pelo atraso existem, mas não há colunas** para elas nas abas semanais | Não há como medir planejado × realizado nem a causa dos atrasos. O sistema inclui esses campos |
| P-2 | **45% das atividades marcadas como "Urgente"** (104 de 232) e 40% como "Alta" | A prioridade perdeu valor. Sugestão: limite de urgentes por obra, ou urgência calculada pelo prazo |
| P-3 | "Meta da semana" em texto livre (24 variações: "Finalizar"/"finalizar", "Inicio"/"Iniciar"/"iniciar"…) | Normalizar em: Iniciar, Executar, Finalizar, Acompanhar, Contratar, Orçar, Vistoriar |
| P-4 | Nome da obra diferente em cada planilha ("PalcoPR", "Palco Paraná", "Palco Parana") | O sistema usa o **código da obra** |
| P-5 | Responsável = **especialidade** ("Pintor"), não a pessoa ou empresa | Para detectar conflito de equipes é preciso vincular o fornecedor do cadastro |
| P-6 | Nomes definidos `Prioridades` e `Urgencia` com `#REF!` | Listas quebradas |
| P-7 | Copiar a aba toda semana; pendências reescritas à mão | O sistema transfere pendências para a semana seguinte guardando o histórico |
| P-8 | Tipos de retrabalho e "Aditivo absorvido" sem ligação com custo | São custos de não qualidade. O sistema permite somá-los por obra |

---

## 5. Mapa de integração atualizado

```
Orçamento Padrão ──aprovado──► Orçamento-base da obra (EAP única) ──► Verba por etapa × (MO | material | terceiros)
                                                                           │
Planejamento Semanal ──► atividades por obra/semana ──► avanço físico ──► Medição ──► Faturamento (NF emitida) ──► A receber ──► Caixa
                                                                           │
Controle de NF ──► NF de entrada (parcelas) ──► Contas a pagar ──► Provisão semanal ──► Pagamento ──► Fluxo de caixa (razão)
                         └─ consome a verba da etapa ─► alerta de estouro / "valor não planejado"
Plano de contas (Financeiro) ◄── toda NF/pagamento/recebimento classificado em grupo › subitem + centro de custo
Quadro do escritório (novo) ──► atividades internas (centro de custo "Interno") + vínculo opcional a obra
```

---

## 6. Novas decisões para aprovação

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| **D9** | Alíquota e forma do imposto no orçamento | (a) imposto **por dentro** com a alíquota efetiva do Simples (~5%, configurável) · (b) 10% · (c) 13,5% · (d) manter "por fora" | **(a)**, revisada pela contabilidade. O sistema mostra o impacto de cada opção na margem |
| **D10** | Parâmetros padrão do orçamento | (a) os do Orçamento Padrão: BDI MO 30%, gerenciamento de material 10%, adicionais de horário/local e mínimo de MO · (b) os do AO/Palco: 50% e 12% | **(a)**, por ser o modelo mais recente e completo. Hoje o sistema está com (b) e passará a (a) |
| **D11** | EAP única | 16 etapas do Orçamento Padrão + Serviços adicionais + Aditivos + Faturamento direto, com de-para para os subitens de material e o plano de contas | Aprovar a lista |
| **D12** | Empréstimos (Pronampe) e aplicações | Fora do resultado: contas de **passivo/ativo financeiro**, que aparecem só no caixa | Aprovar |
| **D13** | Importação do histórico do Financeiro (7.149 lançamentos, 81 centros de custo) | (a) importar tudo, com relatório de pendências (sem subitem, classificação dupla) · (b) só 2026 · (c) não importar | **(a)** na Fase 6, ou antes se quiserem validar a Fase 3 com dados reais |
| **D14** | Prioridade no planejamento | (a) manter as 4 com limite de "Urgente" · (b) urgência calculada pela data final | (b), com ajuste manual |

---

## 7. Quadro de atividades do escritório (novo módulo)

Pedido recebido: *"um calendário com anotações no estilo Trello para controlar as atividades internas do escritório, como um fluxograma de atividades"*.

Proposta: módulo **Quadro**.
- **Quadros** (ex.: "Escritório", "Comercial", "Compras") com **colunas que representam o fluxo** (ex.: A fazer → Em andamento → Aguardando → Revisão → Concluído). As colunas são configuráveis e reordenáveis.
- **Cartões**: título, descrição, **responsável**, **data de entrega**, **etiquetas** coloridas, **checklist**, **comentários**, **anexos**, vínculo opcional a **obra**, ordem e histórico.
- **Arrastar e soltar** entre colunas (no celular, botão "mover para").
- **Calendário mensal** com os cartões pela data de entrega, com filtro por pessoa, etiqueta e quadro. Clicar no dia cria um cartão nessa data.
- Visão **"Minhas tarefas"** e alertas de cartões atrasados no dashboard.
- Tudo auditado e com permissão própria (módulo "Quadro").

Por ser independente das regras financeiras, ele é **implementado já nesta etapa**, junto com a nova identidade visual.

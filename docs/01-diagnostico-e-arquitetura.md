# MASIE GESTÃO — Fase 1: Diagnóstico, Mapa de Módulos e Arquitetura

> Versão 0.1 — 03/11/2026 — Documento para aprovação. Nenhum código de produção foi escrito ainda.

---

## 0. Escopo desta análise e arquivos recebidos

| # | Arquivo solicitado no briefing | Situação |
|---|---|---|
| 1 | Financeiro 2026.xlsm | **Não recebido** |
| 2 | Controle Nota fiscais Obra.xlsm | **Não recebido** |
| 3 | Planejamento Semanal(1).xlsx | **Não recebido** |
| 4 | Orçamento Padrão Masie.xlsx | **Não recebido** |
| 5 | 2026-0000 - AO [OBSOLETO].xlsx | Recebido e analisado integralmente |
| — | ControlePalco.xlsm (não citado no briefing) | Recebido e analisado integralmente |

O `ControlePalco.xlsm` é uma **instância real** do mesmo modelo "AO – Acompanhamento de Obra", com dados de outubro/2026 (obra "Palco", contrato de R$ 128.861,68). Ele usa uma versão **mais simples** do modelo do que o AO [OBSOLETO]. Tudo indica que é a versão em uso hoje.

**Consequência:** este documento cobre a fundo o **controle de obra** (orçamento por verba, avanço físico, medições, cobrança, fornecedores, aditivos, faturamento direto, reembolsos e relatório semanal). Os módulos **Financeiro corporativo, Notas Fiscais, Planejamento Semanal e Orçamento Padrão** estão desenhados a partir do briefing e do que o AO já revela, mas **as regras deles só serão validadas quando as 4 planilhas faltantes chegarem**. Esses pontos estão marcados com ⚠️.

Método: leitura de todas as abas, incluindo as ocultas, com openpyxl (fórmulas e valores em cache). Fórmulas repetidas foram normalizadas para notação relativa, o que expõe as células que quebram o padrão. Também foram inspecionados validações, formatações condicionais, tabelas estruturadas, tabelas dinâmicas, gráficos, comentários e o projeto VBA (extraído com olevba).

---

## 1. Diagnóstico técnico — "2026-0000 - AO [OBSOLETO].xlsx"

### 1.1 Estrutura (15 abas, ~350 mil células com fórmula)

| Aba | Visível? | Papel | Entrada manual |
|---|---|---|---|
| **Realizado-Físico** (tabela `Realizado`) | sim | **Coração do modelo.** EAP da obra (etapa → serviço), fornecedor, custos e **% executado por semana** | Nome da tarefa, fornecedor, MO acertada, Curva ABC, MO verba, valor cliente, duração, % semanal, data de início (R3) |
| **Previsto fisico** (tabela `Previsto`) | sim | Cronograma planejado: % previsto por semana e por serviço | % previsto semanal |
| Previsto fornecedores | **oculta** | Desembolso previsto = valor acertado × % previsto | — |
| Previsto medição | **oculta** | Medição prevista = valor cliente × % previsto | — |
| Realizado-Fornecedores | **oculta** | Custo apropriado = valor acertado × % executado na semana | — |
| Realizado-Medição | **oculta** | Medição realizada = valor cliente × % executado | — |
| **CálculoGerencial** | sim | Motor de cálculo: medição → cobrança (descontando entrada), reprojeção de cobranças e pagamentos | — |
| **Gerencial** | sim | Painel: cobrança quinzenal, previsões, fluxo de caixa, pagamentos por fornecedor | Pagamentos por fornecedor/semana (linhas 84–107), "Pago" |
| **Relatório Situação** | sim | **Relatório semanal ao cliente**: tarefas, anomalias, prazo, resumo do contrato, medições, aditivos e 3 gráficos | Textos, situação de cada medição (1/0), aditivos |
| Aux.Situação.Gerencial | sim (oculta no Palco) | Auxiliar das tabelas dinâmicas e gráficos (% por etapa, rosca de concluído) | — |
| **Aditivos** | sim | Orçamento discriminado de aditivos (MO + material, % lucro, imposto) | Itens, quantidades, valores, aprovado? |
| **Fornecedores** (tabela `Tab.Fornecedores`) | sim | Cadastro de **191 prestadores** em 37 especialidades, com nome para depósito e **chave PIX** | Tudo |
| Faturamento Direto | sim | Notas de material faturadas **direto em nome do cliente** | Data, loja, NF, valores, pago? |
| Reembolsos | sim | Reembolsos ao cliente/obra | Data, descrição, código do arquivo, valor |
| Planilha1 | sim | "COPIAR PROPOSTA ACEITA PARA CÁ" (vazia) | — |

**Macros VBA:** o AO é `.xlsx`, portanto não tem macros. No ControlePalco.xlsm há uma única macro útil, `Atualizar()` = `ActiveWorkbook.RefreshAll` (atualiza as tabelas dinâmicas). Há também uma `Worksheet_Activate` colocada em módulo padrão, que **nunca dispara** (código morto). Nenhuma regra de negócio depende de VBA, então nada precisa ser portado além do "recalcular tudo", que no sistema web é automático.

### 1.2 Regras de negócio identificadas (a preservar)

**R1. Estrutura Analítica (EAP) padrão — 19 etapas fixas**
1 Serviços iniciais · 2 Proteções · 3 Remoções e demolições · 4 Estrutura · 5 Cobertura · 6 Alvenaria/reboco/contrapiso · 7 Impermeabilização · 8 Instalações hidráulicas/gás · 9 Instalações elétricas · 10 Ar-condicionado · 11 Esquadrias · 12 Gesso · 13 Revestimentos · 14 Pintura · 15 Serviços finais · 16 Aluguel de equipamentos · 17 Serviços adicionais · 18 **Aditivos** (inclui "Reembolsos") · 19 **Faturamento direto**.
Cada etapa traz um serviço "Material de <etapa>" separado da mão de obra.

**R2. Três valores por serviço — o núcleo do controle de margem**
- **Valor cliente** = preço de venda (base da medição).
- **Mão de obra verba** = custo orçado (teto).
- **Mão de obra acertada** = valor efetivamente contratado com o prestador (comprometido).
- *Diferença* = verba − acertada (ganho ou perda de negociação).
- *TDU – Taxa de Uso* = acertada ÷ verba.
- *Fechamento meta* (só no AO): meta de negociação por Curva ABC: A = 80% da verba, B = 90%, C = 95%.

**R3. Markup implícito (obra Palco):** mão de obra ≈ verba × **1,603**; material ≈ verba × **1,220**. Os dados mostram que o preço de venda nasce de % de lucro **diferente para MO e para material**, regra confirmada na aba Aditivos.

**R4. Precificação de aditivos:** `Valor final = custo × (1 + %lucro + imposto)`, com imposto = 10% e arredondamento para cima por linha (`ROUNDUP`). Cada item tem % de lucro de MO e de material, além das flags "Aprovado?" e "Consolidado nas verbas de obra?".

**R5. Avanço físico:** `% relativo do serviço = duração ÷ duração total`. O avanço da etapa é a média dos filhos ponderada pelo % relativo, e o acumulado da obra é a soma semanal.

**R6. Medição:** medição realizada na semana = valor cliente × % executado na semana. Contrato e aditivos são separados (linhas 6–550 contrato, 551–608 aditivos, 609–610 faturamento direto).

**R7. Cobrança ao cliente:** `cobrança = (1 − % entrada) × medição do contrato + medição de aditivos + descontos`. A entrada paga no início é abatida proporcionalmente de cada medição, e **aditivos não têm abatimento de entrada**. Agrupamento por quinzena (2 semanas).

**R8. Custo apropriado ao fornecedor:** custo da semana = valor acertado × % executado. É um custo por **competência física (avanço)**, distinto do pagamento, que é lançado à mão no Gerencial.

**R9. Reprojeção ("Previsão ajustada a partir do avanço da obra"):**
`coeficiente = % que falta (real) ÷ % que faltava (previsto)`. As semanas futuras previstas são multiplicadas por esse coeficiente, redistribuindo o saldo de cobrança e de pagamento conforme o ritmo real. É uma regra valiosa e será mantida, com a correção dos erros 2 e 3 da seção 1.3.

**R10. Saldo do contrato (Relatório Situação):**
`Saldo a pagar = Contrato − Entrada + Aditivos/descontos/reembolsos − Medições quitadas − Material faturado direto ao cliente`.

**R11. Faturamento direto:** material comprado em nome do cliente consome parte do contrato **sem ser receita da Masie**. Esse ponto exige tratamento contábil próprio no sistema.

**R12. Calendário:** semanas a partir de segunda-feira (R3 = data de início), até 72–80 semanas. "Quinzena" = 2 semanas e "Mês" = 4 semanas (ver erro 13).

### 1.3 Erros e inconsistências encontrados (não serão replicados)

| # | Local | Problema | Impacto |
|---|---|---|---|
| 1 | `Realizado-Fornecedores!H611:I611` | `SUBTOTAL` soma as linhas 404, 414, 431… e não as linhas de etapa (6, 44, 78…). É resquício de um layout antigo | **Total de custo acertado/orçado errado** |
| 2 | `CálculoGerencial!H84:CI84` | Referencia `'Realizado-Fornecedores'!L650`, linha **vazia** (a aba termina na 611) | % realizado de fornecedores = 0 sempre, e a **previsão ajustada de pagamentos fica errada** |
| 3 | `CálculoGerencial!H85` | Compara a data com `H$82`, que está vazia | Filtro "semanas passadas" sempre verdadeiro |
| 4 | `Gerencial!AY10`, `BA10`, `AY18:BB18` | Apontam para as colunas de **Total** (CJ/CL) em vez da semana correspondente | 4 semanas exibem o total geral como valor semanal |
| 5 | `Gerencial!D9`, `D12`, `D13` | `PROCH(HOJE(); …; FALSO)` com busca exata | `#N/D` em qualquer dia que não seja exatamente uma data da linha |
| 6 | `Previsto medição!G612:G613` | Soma a coluna F (texto) usando a coluna B (vazia), e G613 tem faixas de tamanhos diferentes | Contrato previsto = 0, o que gera **1.259 células `#DIV/0!`** em CálculoGerencial |
| 7 | `Previsto medição!K616` | O acumulado não soma a semana anterior | A 1ª semana some da curva acumulada prevista |
| 8 | `Previsto fornecedores!G612` | Omite a etapa 17 (Serviços adicionais) e usa "valor acertado" sob o rótulo "verba" | Previsão de desembolso subestimada e conceitos misturados |
| 9 | Diversas (`Gerencial!D17`, `D18`, `D54:D77`; `Realizado-Físico!Q7:Q610` → `R:BN`; tabelas `Realizado`/`Previsto` até BI/BA) | Somas truncadas em 36 a 47 semanas, embora a planilha tenha 72 a 80 | **Obras com mais de ~10 meses perdem dados silenciosamente** |
| 10 | `Realizado-Físico!BB4` e `Realizado-Fornecedores!AV4` | Rótulos "Semana 29–36" repetidos depois da Semana 36 | Confusão de leitura |
| 11 | `Realizado-Físico!H612` e outros `SUBTOTAL` | Lista fixa das linhas de etapa | Inserir uma etapa quebra os totais |
| 12 | `CálculoGerencial!H13` | "Descontos" do **previsto** lê o **realizado** (H35) | Mistura previsto com realizado |
| 13 | CálculoGerencial | "Mês" = 4 semanas fixas, e não o mês do calendário | Não concilia com o financeiro mensal (um ano vira 13 "meses") |
| 14 | `Relatório Situação!D63` × `D64` | Aditivos somam G73:G93, mas medições quitadas somam só M73:M88 (validação só até D88) | Medições 17–21 são ignoradas no saldo |
| 15 | Aditivos (R4) | Imposto de 10% aplicado **sobre o custo**, não sobre o preço. Com lucro de 50%, o imposto efetivo fica em 6,25% do preço | **Margem real menor que a calculada** (ver decisão D3) |
| 16 | Avanço físico (R5) | No Palco, todos os serviços têm duração = 1, então a ART (R$ 176) pesa igual ao material elétrico (R$ 16.472) | Avanço físico distorcido em relação ao financeiro (ver decisão D2) |
| 17 | Gerencial linhas 22–34 | "Produção equipe Vosco", "Simplifica" e diária fixa de R$ 150 escritos no modelo | Resíduo de uma obra específica dentro do template |
| 18 | Fornecedores | Nomes digitados livremente ("Emerson"/"emerson") | Agrupamentos frágeis, que exigem cadastro com chave única |
| 19 | Fornecedores | **191 chaves PIX e nomes copiados em cada planilha de obra** | Duplicação e risco **LGPD** |
| 20 | Relatório Situação | Dados bancários da empresa fixos no corpo do relatório | Devem vir do cadastro da empresa |
| 21 | ControlePalco (dados) | "MO acertada" repetida em todas as linhas da etapa (gesso 5 × R$ 638; pintura 4 × R$ 875) | **Validar**: contrato global copiado por linha ou valor por serviço? |

### 1.4 Diferenças entre AO [OBSOLETO] e ControlePalco (versão em uso)

| Item | AO [OBSOLETO] | ControlePalco |
|---|---|---|
| Curva ABC, meta de fechamento, TDU | Sim | Não |
| Aba ControleVerba (com "Saldo Verba" = cliente − acertado) | Não | Sim |
| Abas Aditivos, Fornecedores, Faturamento Direto | Sim | Não |
| Horizonte | 72–80 semanas | ~44 semanas / 22 medições |
| Data-base | `HOJE()` (quebra) | "Data da primeira sexta-feira de obra" (manual) |
| Situação do exemplo | Template vazio | Contrato R$ 128.861,68 · entrada 20% · verba R$ 81.857 · acertado R$ 47.574 · margem bruta sobre verba 36,5% |

Exemplo concreto de alerta que o sistema dará: no Palco, o **material de ar-condicionado foi acertado por R$ 11.117 contra uma verba de R$ 6.800 (+63%)**, um estouro hoje visível só por formatação condicional.

### 1.5 Planilhas não recebidas — o que se espera delas ⚠️

| Planilha | Hipóteses a validar |
|---|---|
| Financeiro 2026.xlsm | Plano de contas, centros de custo, bancos, contas a pagar/receber, provisão semanal, despesas administrativas e as macros correspondentes |
| Controle Nota fiscais Obra.xlsm | Estrutura da NF (número, série, fornecedor, obra, etapa), parcelas e vínculo com a verba da etapa |
| Planejamento Semanal(1).xlsx | Atividades por obra, equipe e responsável, status e transferência de pendências |
| Orçamento Padrão Masie.xlsx | Composições, BDI, % de lucro MO/material, proposta comercial. É a origem da "Planilha1 – copiar proposta aceita" |

---

## 2. Funcionalidades identificadas → módulos do sistema

| Funcionalidade atual (planilha) | Módulo MASIE GESTÃO |
|---|---|
| Copiar o template AO para cada obra | M02 Obras: "Nova obra" gera toda a estrutura |
| Planilha1 "copiar proposta aceita" + EAP de 19 etapas | M03 Orçamentos: aprovar proposta → orçamento-base |
| MO verba / valor cliente / markup | M03 Orçamentos (verba = custo, cliente = venda) |
| MO acertada, fornecedor, TDU, meta ABC | M05 Compras/Contratações (comprometido) |
| Previsto físico | M06 Planejamento: cronograma semanal |
| Realizado físico (% semanal) | M06/M07: apontamento semanal de avanço |
| Realizado/Previsto medição, entrada, cobrança quinzenal | M08 Medições + M04 Recebíveis |
| Pagamentos manuais por fornecedor (Gerencial) | M04 Contas a pagar / M05 NF |
| Previsão ajustada (coeficiente) | M09 Controle gerencial: projeção (EAC) |
| Aditivos | M08 Aditivos (com aprovação e versão) |
| Faturamento direto | M05 NF com flag "faturado ao cliente" |
| Reembolsos | M04 Reembolsos |
| Fornecedores (PIX) | Cadastro central de fornecedores (único, com acesso restrito) |
| Relatório Situação + gráficos | M07 Relatório semanal em PDF |
| Aux + tabelas dinâmicas + macro RefreshAll | Substituídos por consultas em tempo real |

---

## 3. Mapa de integração entre módulos

```
                ┌──────────────┐
                │ M02  OBRA    │  código único (ex.: 2026-0007)
                └──────┬───────┘
     gera automaticamente: centro de custo, EAP padrão, calendário semanal,
     orçamento vazio, cronograma, relatório nº 1
                       │
  ┌────────────────────┼─────────────────────────────────────┐
  ▼                    ▼                                     ▼
M03 ORÇAMENTO ──aprovado──► ORÇAMENTO-BASE (versão congelada)  M06 PLANEJAMENTO
 (versões/revisões)          │  verba (custo) e preço (venda)     % previsto/semana
                             │                                    atividades da semana
          ┌──────────────────┼──────────────────────┐             │
          ▼                  ▼                      ▼             ▼
   M05 CONTRATAÇÃO/     M08 ADITIVO ──aprovado──►   AVANÇO FÍSICO REAL (% executado/semana)
   PEDIDO (comprometido)  atualiza contrato e base        │
          │                                              ├──► M08 MEDIÇÃO (valor cliente × %)
          ▼                                              │        │ aprovada
   M05 NOTA FISCAL (faturado) ── evita duplicidade       │        ▼
          │  (chave NF-e / CNPJ + nº + série)            │   M04 CONTAS A RECEBER
          ▼                                              │   (cobrança = (1−%entrada)×contrato + aditivos)
   M04 CONTAS A PAGAR (parcelas)                         │        │ recebido
          │ pago                                         │        ▼
          ▼                                              │   M04 FLUXO DE CAIXA ◄──┘
   M04 FLUXO DE CAIXA (realizado)                        │
          │                                              ▼
          └────────────► M09 CONTROLE GERENCIAL POR OBRA / M01 DASHBOARD ◄── M07 RELATÓRIO SEMANAL
                              orçado · comprometido · apropriado · faturado · pago        (PDF, versões)
                              medido · faturado ao cliente · recebido · margem projetada
```

### 3.1 Os "valores" que nunca serão misturados (regra anti-dupla-contagem)

**Lado custo (por item da EAP):**
1. **Orçado (verba)**: vem do orçamento-base mais os aditivos aprovados.
2. **Comprometido**: contratos, pedidos ou "MO acertada" ainda não faturados.
3. **Apropriado por avanço**: comprometido × % executado (regra R8). É o custo econômico da obra.
4. **Faturado (NF recebida)**: obrigação financeira constituída.
5. **Pago**: saída de caixa.

Ao chegar a NF, o valor sai de "comprometido em aberto" e entra em "faturado". Ao ser pago, passa a "pago". **O custo total da obra nunca soma comprometido com faturado com pago.** A visão é sempre `max(comprometido, faturado)` por pedido, com o saldo exibido à parte.

**Lado receita:**
1. **Contratado** (original + aditivos aprovados).
2. **Medido**.
3. **Aprovado pelo cliente**.
4. **Faturado/cobrado**.
5. **Recebido**.

Mais um item à parte: **faturamento direto**, que reduz o saldo do cliente mas **não é receita** da Masie.

---

## 4. Modelo de banco de dados (PostgreSQL) — versão inicial

Convenções: toda tabela tem `id uuid`, `empresa_id` (multiempresa, com isolamento por Row Level Security), `criado_em`, `criado_por`, `atualizado_em`. Valores monetários usam `numeric(14,2)`, percentuais `numeric(7,4)` e quantidades `numeric(14,4)`. Exclusão é sempre lógica (`excluido_em`).

### 4.1 Núcleo e segurança
- `empresa` (razão social, CNPJ, dados bancários, logo, cores)
- `usuario` (nome, e-mail, ativo) · `perfil` (Administrador, Diretoria, Engenharia, Adm/Financeiro, Colaborador)
- `permissao` (perfil, módulo, ação: ver/criar/editar/aprovar/excluir)
- `usuario_obra` (usuário ↔ obra, com papel na obra), para restringir por obra
- `auditoria` (tabela, registro_id, ação, antes jsonb, depois jsonb, usuário, data, ip)
- `anexo` (entidade, entidade_id, arquivo, tipo, tamanho, hash) → armazenamento privado

### 4.2 Obras
- `obra` (código único, nome, cliente_id, endereço, tipo, resp_tecnico_id, gestor_id, data_inicio, data_fim_contratual, `data_base_semana` (segunda-feira), valor_contrato_original, %entrada, margem_prevista, situação, observações)
- `cliente` (nome, CPF/CNPJ, contatos)
- `centro_custo` (código, nome, tipo: OBRA | ADMINISTRATIVO, obra_id nulo se administrativo)
- `obra_semana` (obra_id, nº semana, data_inicio, data_fim), gerada automaticamente. Quinzena e mês de calendário são **derivados**, sem colunas fixas e sem limite de 80 semanas
- `obra_historico` (via auditoria)

### 4.3 Orçamento
- `etapa_padrao` (as 19 etapas, configuráveis) · `servico_padrao` (biblioteca de serviços)
- `composicao` + `composicao_insumo` (insumo, tipo: MO/MATERIAL/EQUIPAMENTO/TERCEIRO, coeficiente, preço) ⚠️ depende do Orçamento Padrão
- `orcamento` (obra_id, número, revisão, status: RASCUNHO/ENVIADO/APROVADO/REJEITADO/BASE, `parametros` de BDI: %lucro MO, %lucro material, %impostos, fórmula de BDI)
- `orcamento_item` (orcamento_id, etapa, código EAP "9.3", descrição, unidade, quantidade, custo_unit_mo, custo_unit_material, custo_unit_equip, preço_venda_unit, curva_abc, peso_fisico)
- `orcamento_base` = snapshot imutável do orçamento aprovado, base de todo o controle. Revisões futuras **não alteram** a proposta original

### 4.4 Compras, fornecedores e notas fiscais
- `fornecedor` (nome conhecido, razão social, CPF/CNPJ, especialidade, dados bancários e PIX **criptografados**, ativo)
- `contratacao` (obra, fornecedor, tipo: MO/EMPREITADA/MATERIAL/LOCAÇÃO, valor acertado, condições, status) + `contratacao_item` (→ orcamento_item, valor, meta ABC, TDU calculada)
- `pedido_compra` + `pedido_item` (→ orcamento_item, qtd, valor, status: SOLICITADO/APROVADO/RECEBIDO/CANCELADO)
- `nota_fiscal` (fornecedor, nº, série, chave NF-e (única), emissão, valor bruto/líquido, `faturado_ao_cliente` bool, status: LANÇADA/CANCELADA/DEVOLVIDA, xml) + `nota_fiscal_rateio` (→ obra, orcamento_item/etapa, contratacao/pedido, valor)
- Índice único anti-duplicidade: `(empresa_id, fornecedor_id, numero, serie)` e `chave_nfe`

### 4.5 Financeiro ⚠️ (será refinado com Financeiro 2026.xlsm)
- `conta_financeira` (banco, agência, conta, tipo, saldo inicial)
- `plano_conta` (hierárquico: receita, custo direto, despesa administrativa…)
- `titulo` (tipo: PAGAR/RECEBER, origem: NF/MEDICAO/MANUAL/REEMBOLSO/ADMIN, origem_id, centro_custo_id **obrigatório**, plano_conta, valor, vencimento, status) + `titulo_parcela`
- `movimento` (conta, data, valor ±, titulo_parcela_id, conciliado bool, extrato_ref): pagamento e recebimento efetivos
- `provisao_semanal` (semana, títulos selecionados, aprovação)
- `reembolso` (obra, descrição, valor, anexo, tipo: A_RECEBER_CLIENTE/A_PAGAR)

### 4.6 Planejamento e execução
- `cronograma_previsto` (orcamento_base_item_id, obra_semana_id, %previsto), substituindo "Previsto físico"
- `avanco_realizado` (orcamento_base_item_id, obra_semana_id, %executado, apontado_por), substituindo "Realizado físico"
- `atividade_semanal` (obra, etapa/item, descrição, responsável, equipe, data prevista/realizada, prioridade, status, %, pendência, observação, `origem_atividade_id`, que guarda o histórico quando a atividade é transferida para a semana seguinte)
- `equipe` + `equipe_membro`

### 4.7 Medições, aditivos e relatórios
- `medicao` (obra, nº, período, status: RASCUNHO/ENVIADA/APROVADA/FATURADA/RECEBIDA, valor medido, desconto entrada, valor aprovado) + `medicao_item` (item, qtd contratada, qtd período, qtd acumulada, valor)
- `aditivo` (obra, nº, tipo: ACRÉSCIMO/SUPRESSÃO/DESCONTO, justificativa, impacto em dias, status: SOLICITADO/ORÇADO/APROVADO/REJEITADO/EXECUTADO, data aprovação cliente) + `aditivo_item` (mesma estrutura do orçamento). Ao ser aprovado, gera uma nova **versão do contrato** (`obra_contrato_versao`) e itens adicionais no orçamento-base, sem sobrescrever o original
- `relatorio_semanal` (obra, semana, status: RASCUNHO/EMITIDO, versão, conteúdo jsonb, PDF gerado) + `relatorio_foto`
- `regra_saude_obra` (indicador, limites verde/amarelo/vermelho), com critérios configuráveis

---

## 5. Arquitetura proposta

| Camada | Escolha | Justificativa |
|---|---|---|
| App | **Next.js 15 (App Router) + React + TypeScript**, em monólito modular | Uma só base de código e um só deploy, com custo de manutenção baixo para empresa pequena |
| UI | Tailwind CSS + shadcn/ui · TanStack Table · Recharts | Aparência SaaS profissional, tabelas com filtro e ordenação, gráficos |
| API | Server Actions + rotas tipadas, validação com **Zod** | Tipagem ponta a ponta, sem API separada para manter |
| Domínio | Pacote `@masie/dominio` com cálculos **puros** (medição, cobrança, reprojeção, BDI, curva ABC, saúde) | Testável sem banco: **Vitest** com casos extraídos das planilhas |
| Banco | **PostgreSQL 16** (gerenciado: Supabase ou Neon) + **Drizzle ORM** com migrações versionadas | Integridade relacional, RLS para isolamento, backups automáticos (PITR) |
| Autenticação | **Supabase Auth** (ou Auth.js) com e-mail e senha + 2FA opcional, e permissões próprias por módulo e obra | Solução segura sem construir autenticação do zero |
| Arquivos | Storage privado (Supabase Storage / S3) com URLs assinadas | Fotos, PDFs, XML de NF-e |
| PDF | HTML/React → PDF via Playwright (Chromium) em rota de servidor | Fidelidade visual à identidade da Masie |
| Excel/CSV | ExcelJS (importação/exportação) + assistente de importação com pré-visualização | Migração das planilhas existentes |
| NF-e | Parser de XML (fast-xml-parser) com conferência antes de gravar | Importação segura |
| Rotinas | Cron (Vercel Cron / pg_cron) para alertas de vencimento, estouro e atraso | Automação sem servidor dedicado |
| Hospedagem | **Vercel** (app) + **Supabase** (banco, autenticação, arquivos), HTTPS nativo | Custo previsível e operação mínima |
| Qualidade | Vitest (domínio), Playwright (fluxos E2E), ESLint, CI no GitHub Actions | Testes automatizados dos cálculos críticos |

---

## 6. Desenho das principais telas

```
┌────────────┬─────────────────────────────────────────────────────────────────┐
│ MASIE      │ Dashboard geral                    [Período ▾] [Obra ▾] [⟳]    │
│ GESTÃO     ├──────────┬──────────┬──────────┬──────────┬──────────┬─────────┤
│            │Faturado  │Recebido  │A receber │A pagar   │Saldo caixa│Margem  │
│ ◉ Dashboard│ mês/ano  │          │ (vencido)│ (vencido)│ projetado │média   │
│ ○ Obras    ├──────────┴──────────┴──────────┴──────────┴──────────┴─────────┤
│ ○ Orçamento│ Fluxo de caixa realizado × projetado (12 sem / 12 meses)  [▮▮▮] │
│ ○ Compras  ├───────────────────────────────┬────────────────────────────────┤
│ ○ Financ.  │ Obras: 7 ativas · 2 atrasadas │ Alertas                        │
│ ○ Planej.  │ ● 2026-0007 Palco   78% ▲ ok  │ ⚠ Material AC +63% s/ verba    │
│ ○ Medições │ ● 2026-0008 ...     41% ▼ atr │ ⚠ 3 títulos vencidos R$ 12k    │
│ ○ Relatór. │ ● ...                         │ ⚠ Medição 4 aguardando cliente │
│ ○ Config.  │                               │                                │
└────────────┴───────────────────────────────┴────────────────────────────────┘

Obra 2026-0007 · Palco · Cliente X                         [Saúde: ● Amarelo]
[Resumo][Orçamento][Planejamento][Compras/NF][Medições][Aditivos][Financeiro][Relatórios][Docs][Histórico]
┌ Contrato  ┬ Aditivos ┬ Medido   ┬ Recebido ┬ Custo orçado ┬ Comprometido ┬ Pago ┬ Margem proj. ┐
├───────────┴──────────┴──────────┴──────────┴──────────────┴──────────────┴──────┴──────────────┤
│ Curva S: previsto × realizado (físico e financeiro)                                            │
│ Tabela por etapa: Verba | Acertado | TDU | Apropriado | NF | Pago | Saldo verba | %físico       │
└────────────────────────────────────────────────────────────────────────────────────────────────┘

Apontamento semanal (celular/tablet)        Semana 12 · 20–26/jan
┌──────────────────────────────────────────────┐
│ 9 Instalações elétricas                      │
│  Tomadas de piso       prev 100% [ 80% ]  ▲  │  ← toque para ajustar
│  Ponto de câmera       prev  50% [ 50% ]     │
│ + Pendência   + Foto   + Anomalia            │
│                         [Salvar] [Enviar]    │
└──────────────────────────────────────────────┘
```

Outras telas previstas: editor de orçamento em planilha (EAP com edição inline, colar do Excel, BDI e curva ABC), lançamento de NF (com leitura de XML e alerta "ultrapassa a verba da etapa em R$ X"), medição (gerada do avanço e editável), quadro semanal (kanban/tabela por obra, equipe ou pessoa) e editor do relatório semanal com pré-visualização do PDF.

---

## 7. Decisões que preciso de vocês antes de implementar

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| D1 | Granularidade do tempo | (a) semana como base, com quinzena e mês de calendário derivados · (b) manter "mês = 4 semanas" | **(a)**, porque concilia com o financeiro |
| D2 | Peso do avanço físico | (a) por duração, como hoje · (b) por valor de venda · (c) por custo | **(b)**: o avanço físico fica coerente com a medição. Manter (a) como opção por obra |
| D3 | Fórmula de preço/BDI | (a) atual: `custo × (1 + lucro + imposto)` · (b) correta: `custo × (1 + lucro) ÷ (1 − imposto)` | **(b)**, com relatório comparativo. Validar com o Orçamento Padrão |
| D4 | Regime do custo da obra no painel | (a) apropriado por avanço (R8, como hoje) · (b) faturado (NF) · (c) caixa (pago) | Mostrar os três, com **(a) como "custo econômico"** e (c) como "caixa" |
| D5 | Entrada contratual | Abater proporcionalmente em cada medição do contrato, sem abatimento em aditivos (R7) | Manter |
| D6 | Faturamento direto | Fora da receita da Masie e abatido do saldo do cliente | Manter, com relatório próprio |
| D7 | "MO acertada" repetida por linha (Palco, erro 21) | Confirmar se é valor por serviço ou contrato global da etapa | No sistema, contratos com itens rateados |
| D8 | Hospedagem | Vercel + Supabase (recomendado) · ou VPS própria | Vercel + Supabase |

---

## 8. Plano de desenvolvimento por fases

| Fase | Entregas | Esforço estimado* |
|---|---|---|
| **1 – Diagnóstico** (este documento) | Diagnóstico, modelo de dados, arquitetura, telas. **Pendente: analisar as 4 planilhas faltantes** | concluída em parte |
| **2 – Estrutura principal** | Projeto, CI, banco + migrações, autenticação, perfis e permissões por módulo e obra, auditoria, cadastro de empresa, clientes, fornecedores e obras (geração automática da estrutura), dashboard básico | 2–3 semanas |
| **3 – Orçamentos e financeiro** | Orçamento (EAP, BDI, curva ABC, versões, aprovação → base, importação Excel, proposta em PDF), contratações e pedidos, NF (com XML NF-e e antiduplicidade), contas a pagar e receber, bancos, fluxo de caixa, reembolsos, conciliação básica | 4–6 semanas |
| **4 – Planejamento e execução** | Cronograma previsto, apontamento semanal (mobile), planejamento semanal de atividades e equipes, medições (geradas do avanço), aditivos com versões de contrato, reprojeção (R9) | 3–4 semanas |
| **5 – Relatórios e indicadores** | Relatório semanal (rascunho, versões, fotos, PDF com identidade Masie), dashboard por obra, saúde configurável, comparativo entre obras, dashboard geral, alertas | 3–4 semanas |
| **6 – Validação e implantação** | Importadores das planilhas reais (AO/Palco e as demais), testes de cálculo **Excel × sistema** em obras reais, revisão de segurança e LGPD, homologação, publicação, treinamento | 2–3 semanas |

\* Estimativas de calendário para desenvolvimento assistido contínuo, com ciclos de validação de vocês ao fim de cada fase. Cada fase termina com funcionalidades testáveis, a lista de limitações, os testes executados e instruções de uso.

### Complexidade
- **Alta:** financeiro integrado sem dupla contagem; reprojeção; medições e aditivos com versionamento; permissões por obra.
- **Média:** orçamento com composições e BDI; importação de NF-e e de Excel; PDF.
- **Baixa:** cadastros, planejamento semanal, dashboards (uma vez que o modelo de dados esteja correto).

### Infraestrutura e custos mensais estimados (USD, nov/2026, a confirmar na contratação)
| Item | Início (até ~10 usuários) | Crescimento |
|---|---|---|
| Vercel Pro | ~US$ 20 | ~US$ 20 + uso |
| Supabase Pro (banco 8 GB, 100 GB de arquivos, backups diários) | ~US$ 25 | US$ 25 + add-ons (PITR ~US$ 100) |
| Domínio + e-mail transacional (Resend) | ~US$ 2–20 | ~US$ 20 |
| **Total** | **≈ US$ 50–70/mês** | ≈ US$ 150–200/mês |

---

## 9. LGPD e segurança — pontos já identificados
- A planilha de fornecedores contém **nomes de pessoas físicas e chaves PIX** (muitas vezes CPF/telefone). No sistema, esses dados ficam criptografados em repouso, visíveis apenas para o perfil Financeiro e Administrador, com log de acesso.
- Os dados bancários da empresa passam a vir do cadastro da empresa e deixam de estar fixos no relatório.
- Cada empresa e cada obra ficam isoladas por RLS. Todo lançamento crítico (valor, status, aprovação) é auditado com o valor anterior e o novo.

---

## 10. Próximos passos
1. **Enviar as 4 planilhas faltantes**: Financeiro 2026, Controle NF Obra, Planejamento Semanal e Orçamento Padrão Masie.
2. Responder às decisões **D1–D8** (seção 7).
3. Enviar a identidade visual: logo em SVG/PNG, cores e fonte.
4. Confirmar a hospedagem e quem será o administrador da conta (a conta deve ser da Masie, não do desenvolvedor).
5. Com o aceite, inicio a **Fase 2**.

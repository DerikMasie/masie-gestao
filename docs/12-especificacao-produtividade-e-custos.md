# Produtividade, consumo de material e custo por m² (especificação)

> 06/11/2026. Proposta para discussão, ainda sem código. Respostas do cliente que orientam o desenho:
> - **Mão de obra:** empreitada por obra; em alguns casos misturada com funcionário próprio.
> - **Apontamento:** feito por um único sócio (Derik).
> - **Material:** sempre comprado por obra (não há estoque central).

## Objetivo

Medir, com dados reais das obras da Masie:

1. **Produtividade** de cada serviço (ex.: m² de massa corrida aplicada por pessoa por dia), para dimensionar cronograma.
2. **Consumo de material** por unidade de serviço (ex.: kg de massa por m²), para dimensionar compras.
3. **Custo unitário** de cada serviço (R$/m²: mão de obra + material).
4. **Custo por m² de obra** por tipo de reforma e padrão (o "número Masie", equivalente interno do CUB).

## O que falta hoje no sistema

O sistema já tem:
- os serviços da obra, com fornecedor, MO acertada, verba, valor ao cliente e duração;
- o % previsto e realizado por semana;
- as notas fiscais, com leitura do XML.

O que falta é **quantidade física**: quantos m² tem cada serviço, quantos foram feitos na semana, quantas pessoas trabalharam e quanto material entrou, em kg ou litros.

O leitor de XML (`src/lib/nfe.ts`) **já extrai os itens da nota com quantidade e unidade**, mas hoje esses itens são descartados. É o atalho para o material.

## Decisões de desenho

### 1. Apontamento semanal, não diário

Como uma só pessoa aponta todas as obras, apontar por dia não é sustentável. O apontamento é **por semana, por serviço**, na mesma tela onde hoje se lança o realizado:

| Campo | Exemplo |
|---|---|
| Quantidade executada na semana | 65 m² |
| Equipe: quem e quantos dias | Everton (empreiteiro): 2 pessoas × 4 dias; João (funcionário): 2 dias |

**Sem digitar duas vezes.** Para o serviço que tiver quantidade total cadastrada, o % realizado da semana passa a ser calculado (`quantidade da semana ÷ quantidade total`). O serviço sem quantidade continua com o % digitado como hoje. Assim o físico, a medição e o relatório semanal não mudam.

**Risco: precisão da equipe.** Lembrar no fim da semana quantas pessoas vieram em cada dia é a parte frágil. Sugestão prática: o empreiteiro manda, no fim do dia, um WhatsApp com "hoje: 2 pessoas na massa". Se isso se mostrar insuficiente, dá para acrescentar depois o apontamento diário opcional, sem mudar o restante.

**Unidade de esforço: pessoa-dia** (não homem-hora). É o que dá para saber de forma confiável em empreitada.

### 2. Custo da mão de obra empreitada: rateio pelo esforço

Uma empreitada costuma cobrir vários serviços (ex.: "pintura completa" = massa + lixa + tinta). Para saber o custo de cada um:

- **Valor da empreitada** = soma da MO acertada dos serviços do mesmo fornecedor na mesma etapa da obra.
- **Custo de MO de cada serviço** = valor da empreitada × (pessoas-dia do serviço ÷ pessoas-dia de todos os serviços dessa empreitada).

Exemplo: a pintura de R$ 9.000 leva 10 pessoas-dia na massa, 6 na lixa e 14 na tinta. O custo de MO fica em R$ 3.000 na massa, R$ 1.800 na lixa e R$ 4.200 na tinta. Dividindo pelos m² de cada serviço, sai o R$/m².

Se a MO acertada mudar (aditivo com o empreiteiro), vale o valor final. Os pagamentos da aba Pagamentos servem de conferência, não de base.

### 3. Funcionário próprio: custo-dia

Cadastro simples de **funcionário**: nome, função (oficial, ajudante), **custo-dia** e situação (ativo ou inativo).

- O custo-dia é o custo total mensal (salário + encargos + benefícios) ÷ dias úteis no mês. Quem calcula é o usuário; o sistema guarda o número com data de vigência, para não reescrever o passado num reajuste.
- **Custo de MO do funcionário no serviço** = dias apontados × custo-dia vigente.

### 4. Material: itens da nota fiscal

- Ao lançar uma NF com XML, os **itens são gravados** (descrição, quantidade, unidade, valor).
- **Catálogo de insumos** com unidade padrão (Massa corrida PVA: kg; Tinta acrílica: L; Lixa 150: un).
- **De-para do item do fornecedor para o insumo, com fator de conversão.** Ex.: "MASSA CORRIDA SUVINIL BD 25KG", 4 BD → Massa corrida PVA, fator 25 → 100 kg. O sistema lembra o de-para por fornecedor e descrição; na próxima nota ele vem sugerido.
- **Destino do item:** o serviço da obra em que foi usado. A sugestão vem do insumo (massa → serviço de massa) e o item pode ser dividido entre serviços.
- **Sobra:** ao concluir o serviço (ou a obra), informa-se a sobra de cada insumo, se houver. Como a compra é sempre por obra, não há transferência entre obras. A sobra que for levada para outra obra entra lá como "material reaproveitado", sem custo novo, para não contar duas vezes.
- **NF sem XML:** os itens podem ser digitados. Se não forem, a nota entra só no custo em R$, sem consumo físico.
- **Material faturado ao cliente** conta como custo da obra para o número Masie (é custo real da reforma), mesmo não sendo custo da Masie no financeiro.

`consumo do insumo no serviço = itens destinados ao serviço − sobra`

### 5. Catálogo de serviços padrão

Para comparar obra com obra, cada serviço da obra é ligado a um **serviço padrão** do catálogo da empresa:

| Campo | Exemplo |
|---|---|
| Nome | Massa corrida, aplicação (por demão) |
| Unidade | m² |
| Grupo | Pintura |
| Insumos esperados | Massa corrida PVA (kg), Lixa (un) |

Também são guardados **atributos que mudam a produtividade**, todos opcionais e em no máximo três: superfície (parede ou teto), condição da base (nova ou com reparo) e dificuldade (normal ou difícil, ex.: andaime, muitos recortes).

Começa com o catálogo de pintura:
- massa corrida, aplicação;
- massa corrida, lixamento;
- selador/fundo;
- tinta acrílica, por demão;
- textura;
- esmalte em esquadrias.

Os outros grupos entram depois.

### 6. Dados da obra para o número Masie

Três campos novos na obra:
- **Área de referência (m²)**, com uma definição única: **área útil dos ambientes reformados**. Se a definição variar de obra para obra, o número não serve para nada.
- **Tipo de reforma**: completa, parcial ou de ambiente específico (banheiro, cozinha…).
- **Padrão**: econômico, médio ou alto.

## Indicadores

**Por serviço padrão**, consolidado de todas as obras com filtro por período e atributos:

| Indicador | Fórmula |
|---|---|
| Produtividade | unidades ÷ pessoa-dia (ex.: 32 m²/pessoa-dia) |
| Consumo unitário | insumo ÷ unidade (ex.: 0,9 kg/m²) |
| Custo de MO | R$ ÷ unidade |
| Custo de material | R$ ÷ unidade |
| Custo unitário total | MO + material |

Mostrados como **mediana e faixa** (do 1º ao 3º quartil), com o **número de amostras**: menos de 5 é "pouca amostra", de 5 a 15 é "indicativo" e acima de 15 é "confiável". Uma obra entra como amostra quando o serviço é concluído.

**Por obra:**
- custo realizado por m² de área de referência, aberto em MO, material, indiretos (caçamba, frete, equipamento) e outros, a partir do plano de contas;
- previsto × realizado de produtividade e consumo de cada serviço.

**Número Masie:** custo por m² (mediana e faixa) das obras concluídas, por tipo de reforma e padrão, atualizado por índice (INCC) até a data da consulta para comparar obras de anos diferentes.

## Uso dos indicadores (fase posterior)

Ao cadastrar a planilha de uma obra nova, com quantidade e equipe prevista, o sistema sugere:

- a **duração** de cada serviço: `quantidade ÷ (produtividade × pessoas)`, que hoje é digitada à mão;
- a **quantidade de material**: `quantidade × consumo × (1 + perda)`.

## Novas tabelas (resumo)

| Tabela | Conteúdo |
|---|---|
| `servico_padrao` | catálogo: nome, grupo, unidade |
| `insumo` | catálogo: nome, unidade padrão |
| `insumo_de_para` | fornecedor + descrição do item → insumo + fator de conversão |
| `funcionario` / `funcionario_custo` | funcionário e custo-dia com vigência |
| `nota_fiscal_item` | item da NF: descrição, quantidade, unidade, valor, insumo, quantidade convertida |
| `material_destino` | item da NF (ou parte dele) → serviço da obra |
| `material_sobra` | sobra de insumo por serviço ou obra |
| `apontamento_semana` | serviço + semana: quantidade executada |
| `apontamento_equipe` | serviço + semana + fornecedor ou funcionário: pessoas × dias |

Campos novos:
- `obra_servico`: `servicoPadraoId`, `quantidade`, `unidade` e os atributos de produtividade;
- `obra`: `areaReferencia`, `tipoReforma`, `padrao`.

## Fases

1. **Apontamento de pintura.** Serviço padrão, quantidade na planilha, apontamento semanal de quantidade e equipe, % realizado calculado e funcionário com custo-dia. Indicadores de produtividade e custo de MO por m².
2. **Material.** Itens da NF via XML, insumos, de-para, destino, sobra. Indicadores de consumo e custo de material por m².
3. **Número Masie.** Área, tipo e padrão na obra; custo por m² por obra e consolidado.
4. **Retroalimentação.** Sugestão de duração e de material na planilha de obras novas; extensão do catálogo para gesso, piso, elétrica, hidráulica etc.

## Pendências de definição

- Confirmar a definição de **área de referência** (proposta: área útil dos ambientes reformados).
- Confirmar se os empreiteiros topam informar a equipe do dia (WhatsApp) ou se a estimativa semanal basta.
- Lista inicial de **insumos** de pintura e de **funcionários** com custo-dia.
- Obras já concluídas: vale lançar retroativamente as que tiverem dados (NFs com XML e área) para já começar com amostras do número Masie?

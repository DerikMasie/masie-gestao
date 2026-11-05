# Painel de obras (tela inicial)

> 06/11/2026. Decisões do cliente:
> - **Ritmo:** até 2 pontos abaixo do previsto = no ritmo; 2 a 5 = atenção; acima de 5 = atrasada; mais de 2 acima = adiantada.
> - **Formato:** cartões.
> - **Pendências:** as da rotina já executada no sistema.
> - **Abertura:** visão geral da empresa com as obras ativas.

## O que mostra

**Obras ativas** são as contratadas, em andamento ou paralisadas que o usuário pode ver. Cada perfil enxerga só as obras a que tem acesso.

**Filtros** (aplicados na hora):
- ritmo, com a contagem de cada um;
- busca por obra, cliente ou cidade;
- gestor;
- ordenação: prioridade (atrasadas e com mais pendências urgentes primeiro), maior atraso no avanço, término mais próximo ou código. A ordenação escolhida fica lembrada no navegador.

**Indicadores** (respeitam o filtro):
- obras ativas;
- atrasadas e em atenção;
- pendências urgentes;
- a cobrar;
- saldo dos contratos;
- fornecedores com serviço executado e não pago.

**Gráfico realizado × previsto:** um ponto por obra, com a diagonal de referência. Clicar no ponto abre a obra.

**Pendências da semana**, ordenadas por gravidade e com link direto para a tela que resolve:

| Pendência | Gravidade |
|---|---|
| Realizado da semana anterior não lançado | alta |
| Realizado da semana atual, a partir de quinta | média |
| Relatório da semana anterior não emitido | alta |
| Relatório da semana atual, na sexta | média |
| Medição a fechar | alta |
| Medição fechada e não paga (mais de 7 dias) | alta |
| Medição fechada e não paga (até 7 dias) | média |
| Fornecedor com serviço executado e não pago | média |
| MO acertada acima da verba | média |
| Prazo contratual vencido | alta |
| 80% do prazo decorrido com menos de 80% executado | alta |
| Obra sem planilha ou sem previsto | informativa |

**Cartões** (um por obra):
- ritmo (cor e pontos percentuais);
- avanço realizado e previsto;
- mini curva de avanço;
- semana atual;
- prazo decorrido e término;
- medição em aberto, a cobrar e saldo;
- último relatório;
- contagem de pendências.

**Detalhe lateral** (abre ao clicar no cartão ou no ponto do gráfico; Esc fecha):
- curva maior;
- todas as pendências;
- contrato e medições;
- atalhos para abrir a obra, lançar a semana e o relatório.

**Abaixo do painel:** "Minhas tarefas" (Quadro) e o resumo financeiro da empresa.

**Valores** (cobrança, saldos, fornecedores) só aparecem para perfis com acesso a Medições e Orçamentos.

## Implementação
- Regras: `src/dominio/painel-obras.ts` (`classificarRitmo` e `pendenciasObra`).
- Dados: `src/servicos/painel-obras.ts`, que reaproveita os cálculos de físico, medições, fornecedores e relatórios.
- Tela: `src/componentes/painel-obras.tsx`.

## Testes
- Testes unitários: limites do ritmo e todas as pendências.
- Teste de integração: obra Palco em "Atenção −2,5 p.p.", obra sem planilha, obra concluída fora do painel e acesso restrito por obra.
- Ponta a ponta: `tests/e2e/painel.cjs` (filtro, detalhe, link da pendência, celular).

## Visão por engenheiro e modo TV (06/11/2026)

Inspirada no modelo enviado pelo cliente: fundo escuro, estilo "sala de controle". É a **visão padrão** da tela inicial; o botão "Cartões e pendências" alterna para a visão de cartões.

**Topo** (as obras canceladas ficam de fora):
- obras em execução (em andamento);
- obras aguardando (contratadas e paralisadas);
- total de obras;
- receita total;
- receita aguardando;
- receita em andamento.

Receita = valor de contrato.

**Uma linha por engenheiro** (responsável técnico da obra; sem ele, o gestor; sem nenhum, "Sem responsável"):
- **Barras por situação:** prospecção, orçamento, contratada, andamento, paralisada e concluída.
- **Obras do engenheiro:** valor de contrato e % realizado. A cor da barra segue o ritmo: atrasada, atenção, no ritmo, adiantada ou sem cronograma.
- **Medidor de carga** (obras ativas): verde até 3, amarelo até 6, vermelho acima, em escala até 10.
- **Participação na receita total**, em destaque amarelo, e o valor total das obras do engenheiro.

**Modo TV:** `/painel-tv`.
- Tela cheia, sem menu, para a TV do escritório.
- Recarrega sozinho a cada 5 minutos e mostra a hora da atualização.
- Exige login de um perfil com acesso a valores.

**Responsividade:** em telas médias, cada engenheiro ocupa 2 linhas; em telas largas e na TV, uma linha.

**Implementação:**
- regras: `src/dominio/painel-engenheiros.ts`;
- dados: `src/servicos/painel-engenheiros.ts`;
- tela: `src/componentes/painel-engenheiros.tsx`.

## Painel da obra (dashboard por obra) — 06/11/2026

Pedido do cliente: um "cartão da obra" no estilo de dashboard de BI, com indicadores, atividades executadas, saldos, medições, atividades da semana e itens que não podem ser esquecidos na semana.

**Onde fica:** `/obras/{id}/painel`. Dá para chegar por três caminhos:
- o botão **Painel da obra** no topo de cada obra;
- o detalhe lateral do painel inicial;
- a lista de obras da visão por engenheiro.

**Filtro de semana:** escolher uma semana passada mostra o estado daquela semana, calculado na sexta-feira dela.

### Indicadores

São blocos coloridos em degradê, cada um com um mini gráfico de área:

| Indicador | O que mostra | Mini gráfico |
|---|---|---|
| Avanço físico | Previsto, diferença em pontos e avanço na semana | Evolução semanal |
| Executado (cobrança) | Maior medição | Acumulado por medição |
| Saldo a medir | Contrato − entrada ± ajustes − executado | Saldo por medição |
| Fornecedores a pagar | Executado e não pago; pago na semana | Pagamentos por semana |

### Blocos

**Atividades da semana:** os serviços previstos na semana e os atrasados. Cada um mostra:
- uma situação, entre as quatro abaixo:
  - **concluída:** 100% executado;
  - **atrasada:** executado abaixo do previsto até a semana anterior;
  - **em andamento:** teve avanço lançado na semana;
  - **não iniciada:** nada lançado na semana;
- a barra do acumulado × previsto;
- o realizado e o previsto da semana.

Abaixo da tabela vem a prévia da próxima semana.

**Não esquecer nesta semana:**
- as pendências automáticas da obra;
- os lembretes da equipe, com marcação de importante e de feito, que podem ser incluídos e excluídos;
- os lembretes não feitos passam para as semanas seguintes, com a marca "da semana N".

**Permissão para editar lembretes:** Planejamento → editar.

**Executado na semana:** atividades com avanço lançado, ordenadas pela contribuição ao avanço da obra (peso pela duração).

**Medições:** gráfico previsto × realizado e a situação de cada medição (paga, não paga, a fechar, em andamento).

**Saldos:**
- rosca com a composição do contrato: quitado, executado a cobrar e a executar;
- saldo do cliente a pagar;
- fornecedores, com o valor a pagar.

**Valores:** os indicadores e blocos com dinheiro só aparecem para perfis com acesso a Medições e Orçamentos.

**Testes:**
- unitários: situação das atividades e regra de passagem dos lembretes;
- integração: dados da obra Palco na semana 2 e ciclo completo dos lembretes;
- ponta a ponta: `tests/e2e/painel-obra.cjs`.

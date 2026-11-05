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

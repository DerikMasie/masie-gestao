# Item 1: Gestão da obra, passo 1.4 (relatório semanal em PDF)

> 05/11/2026. Base: modelo "Relatório Situação" da planilha (print 1) + relatório fotográfico pedido pelo cliente.

## Fluxo

1. **Obra → Gestão da obra → Relatório semanal → Novo relatório** (um por semana). Os textos já vêm sugeridos:
   - **Tarefas finalizadas e em andamento:** serviços com avanço lançado na semana, marcados como "concluído" ou "em andamento (x% executado)".
   - **Tarefas da próxima semana:** serviços com previsto na semana seguinte e ainda não concluídos.
   - **Acompanhamento do prazo:** avanço realizado × previsto, término previsto pelo cronograma e término contratual.
   - **Anomalias:** campo livre, com os exemplos do modelo.
2. **Fotos:** "Adicionar fotos" abre a câmera ou a galeria no celular.
   - Antes de enviar, a foto é reduzida no próprio aparelho (lado maior de 1.800 px, JPEG), o que deixa o envio rápido.
   - Na tela é possível ordenar (← →), escolher o **ponto de foco** do recorte (⌖), escrever uma legenda opcional e remover a foto.
   - A tela mostra as páginas exatamente como sairão no PDF.
3. **Ver prévia do PDF** → **Emitir relatório**. A emissão **congela os números** (avanço, medições, contrato, dados de depósito) na versão emitida.
   - **Reabrir para editar** gera a versão seguinte (v2, v3…). O histórico fica auditado.
   - O rascunho pode ser excluído; o relatório emitido, não.

## PDF (A4, cores Masie)

| Página | Conteúdo |
|---|---|
| 1. Situação da obra | Cabeçalho (cliente, obra, endereço, semana e data da sexta-feira, logo). Rosca de progresso. Evolução por tipo de serviço (barra do realizado + traço do previsto até a semana; só as etapas marcadas "no relatório"). Curva de avanço físico (previsto tracejado × realizado até a semana). As 4 seções de texto |
| 2. Relatório financeiro | Resumo do contrato (contrato, entrada, aditivos/descontos/reembolsos, medições quitadas, material faturado em nome do cliente, saldo a pagar). Informações para depósito (cadastro da empresa: razão social, banco, agência, conta, CNPJ, PIX). Medições (nº, data, valor, situação: círculo cheio = paga). Aditivos/descontos/reembolsos |
| 3+. Relatório fotográfico | Até 6 fotos por página, sempre **simétricas** e no formato **4:3**: 1 foto = grande; 2 = lado a lado; 3 = uma grande + 2; 4 = 2×2; 5 = 2+2+1 centralizada; 6 = 2×3. Mais de 6 fotos: páginas de 6 e a última segue a regra. Legenda opcional abaixo da foto |

Em todas as páginas o rodapé traz a obra, a semana, a versão (ou "PRÉVIA") e "Página x de y".

**Geração no servidor**, com `@react-pdf/renderer` (sem navegador embutido; funciona na Vercel). O endereço é `/api/relatorios/{id}/pdf` e exige login, permissão de Relatórios e acesso à obra.

**Permissões (Relatórios semanais):**
- **criar:** criar e editar o rascunho, incluindo as fotos;
- **editar:** emitir e reabrir;
- **excluir:** excluir o rascunho.

## Testes

- 141 testes unitários e de integração. Os novos cobrem:
  - paginação simétrica de 1 a 20 fotos;
  - textos sugeridos;
  - emitir com os dados congelados;
  - reabrir, gerando a versão 2;
  - fotos: ordem, foco, legenda e tipo;
  - geração do PDF com contagem de páginas;
  - prévia com os dados atuais.
- Ponta a ponta: `FOTOS=pasta node tests/e2e/relatorio.cjs`.
  - Cria e edita o relatório, envia 7 fotos, gera a prévia, emite e baixa o PDF emitido.
  - Inclui captura de tela no celular.

## Dados de teste

O relatório da semana 5 da obra 2026-0001 está emitido (v1) com 7 imagens geradas e identificadas como **"IMAGEM DE TESTE"**. Substitua-as por fotos reais: reabra o relatório, remova as imagens e adicione as fotos.

## Próximos passos sugeridos

- **Link para o cliente:** página pública, sem login, com a última versão emitida. Foi pedido como melhoria futura e deve usar um link secreto revogável.
- **Envio por e-mail ou WhatsApp** direto do sistema.

## Cores do relatório por obra (06/11/2026)

Onde fica: **Obra → Gestão da obra → Relatório semanal → Cores do relatório desta obra**.

**São 3 cores:**
- **principal:** faixas de título, barras, rosca e linha do realizado;
- **destaque:** marca nas faixas, borda das seções e traço do previsto;
- **fundo das seções:** tom claro atrás dos títulos das seções.

**Paletas prontas:**
- Masie (padrão)
- Grafite e azul
- Marinho e dourado
- Verde
- Terracota
- Vinho

Também dá para escolher cores livres pelo seletor. A tela mostra uma prévia ao vivo.

**Contraste:** o texto sobre a cor principal fica branco ou preto automaticamente. Há aviso quando a cor principal é clara demais ou o fundo das seções escuro demais.

**Relatórios já emitidos:** guardam as cores da emissão. A mudança vale para as prévias e para as próximas emissões.

**Permissão:** Relatórios → editar.

**Teste ponta a ponta:** `tests/e2e/cores-relatorio.cjs`.

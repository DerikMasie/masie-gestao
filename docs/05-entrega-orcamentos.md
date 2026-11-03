# Fase 3, parte 1: Orçamentos (entrega)

> 03/11/2026. Decisões aplicadas:
> - **Imposto do Simples (anexos III/IV)**: entre 9% e 12%. O padrão é **10,5%**, editável na empresa e em cada orçamento.
> - **Margens padrão**: **mão de obra 30%** e **material 10%**, editáveis por orçamento e também por item.

## O que está pronto
| Recurso | Detalhe |
|---|---|
| **Motor de cálculo** | Reproduz o Orçamento Padrão Masie: MO com adicionais de horário/local e valor mínimo, material com quebra, BDI separado para MO e material, imposto e totais. **Conferido contra a própria planilha recalculada no LibreOffice: 3 cenários × 207 itens, zero divergências** |
| **Parâmetros editáveis** | Por orçamento: BDI MO, BDI material, impostos, adicionais de horário e de local, mínimo de MO, forma do imposto e arredondamento. Por item: BDI MO e BDI material próprios (ex.: para negociar um serviço) |
| **Imposto** | "Por dentro" (padrão: o imposto é exatamente a alíquota sobre o total faturado) ou "por fora" (como a planilha). Com 10,5% de imposto, a diferença é de ~1,1% do contrato |
| **Arredondamento** | Centavos (padrão) ou "real inteiro para cima por linha", que reproduz a planilha para conferência |
| **Editor estilo planilha** | Itens agrupados pelas etapas da obra, com subgrupos (1.1, 1.2…) e códigos automáticos. Edição direta na tabela, **recálculo enquanto digita** e gravação ao sair da linha. Incluir, excluir, reordenar e mover de etapa. Detalhes do item: memória de cálculo, observação e BDI próprio. Busca. Barra de totais fixa |
| **Importação do Excel** | Lê o "Orçamento Padrão Masie.xlsx" (abas ORÇAMENTO e PROPOSTA): etapas, subgrupos, 207 serviços, quantidades, quebras, valores e parâmetros. Mapeia as 16 etapas da planilha para a EAP da obra (ex.: "Serviços preliminares" → "Serviços iniciais"), criando as que faltarem. Guarda as fórmulas de quantidade como memória de cálculo e **confere o total com o da planilha**. Opção de ignorar itens sem quantidade (usar a planilha como catálogo) |
| **Copiar de outro orçamento** | De qualquer obra, mapeando as etapas pelo nome |
| **Revisões** | Nova revisão a partir de qualquer versão. Ao sair do rascunho, os totais ficam **congelados** e a edição é bloqueada; a proposta original nunca é alterada |
| **Aprovação** | Rascunho → Enviado → Aprovado/Rejeitado → **Orçamento-base**. Aprovar e definir a base exige a permissão "Orçamentos: aprovar". A base atualiza o custo orçado da obra (e o valor do contrato, se ainda estiver zerado). Só há uma base por obra |
| **Análises** | Resumo por etapa (custo MO, material, venda e % da venda) e **curva ABC** automática (por custo total, material ou mão de obra), com a mesma regra da planilha: A até 80%, B até 95% |
| **Exportação** | Orçamento em Excel (.xlsx), com parâmetros, etapas, itens e totais |
| **Auditoria** | Inclusão, edição (campo a campo), exclusão de itens, parâmetros, revisões, importações e cada passo da aprovação |

## Limitações
- **Proposta comercial em PDF**: entra na etapa de relatórios e PDFs, que terá a identidade visual. Por enquanto, use a exportação para Excel.
- **Composições de preço** (aba MATERIAIS – Composições) e **levantamento por ambiente** (aba LEVANTAMENTOS) ainda não foram portados. O orçamento recebe os valores unitários já compostos, e a memória de cálculo é texto livre.
- **Cronograma físico-financeiro** do orçamento: virá junto com o planejamento (Fase 4).
- A importação aceita **.xlsx**. Arquivos .xlsm devem ser salvos como .xlsx no Excel. O sistema não executa macros.
- Os itens ainda não têm verba por etapa comprometida/realizada. Isso chega com compras e notas fiscais (próxima parte da Fase 3).

## Testes
- **82 testes automatizados** (eram 67). Os novos cobrem:
  - os padrões Masie e a migração dos parâmetros antigos;
  - o modo planilha (ART, valor mínimo, quebra, imposto por fora);
  - o modo sistema (imposto por dentro, adicionais sobre o mínimo, BDI por item, centavos);
  - a curva ABC e os códigos dos itens;
  - o fluxo completo de aprovação com congelamento e base única;
  - a importação da planilha, com total conferido;
  - a cópia entre obras e o bloqueio de etapa de outra obra.
- **Ponta a ponta** (`tests/e2e/orcamento.cjs`, 12 verificações). Cobre:
  - a importação real;
  - o mesmo total no topo e no rodapé;
  - a edição com recálculo e persistência;
  - o novo item;
  - os parâmetros;
  - a curva ABC;
  - o download do Excel;
  - a aprovação até a base;
  - o histórico;
  - o perfil Engenharia sem poder de aprovação.
- Defeitos encontrados e corrigidos durante os testes:
  1. Preços com dízima (ex.: `=500/3`) perdiam precisão no banco e mudavam o arredondamento. Quantidades e preços passaram a ter a precisão do Excel.
  2. O editor recalculava a partir do valor exibido (4 casas) e divergia R$ 1 do servidor. Agora mantém o valor exato.
  3. As ações com confirmação não mostravam a mensagem de sucesso.

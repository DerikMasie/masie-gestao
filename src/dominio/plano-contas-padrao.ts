/**
 * Plano de contas padrão — extraído da aba "Aux.Listas" do Financeiro 2026.xlsm (16 grupos).
 * `codigoPlanilha` é o valor da coluna ItemReferencia do fluxo de caixa, usado na importação do histórico.
 * As reclassificações da decisão D12 (empréstimos, aplicações, saldo inicial) são aplicadas no seed e na importação.
 */
import type { Natureza } from "./financeiro";

export const PLANO_CONTAS_PADRAO: { codigoPlanilha: string; grupo: string; natureza: Natureza; subitens: string[] }[] = [
  {
    "codigoPlanilha": "Custo_operacional",
    "grupo": "Custo operacional",
    "natureza": "CUSTO",
    "subitens": [
      "Almoços",
      "ART/Taxas prefeitura",
      "Combustível",
      "Ferramentas",
      "Fotografias",
      "Fretes",
      "Impressões de projetos",
      "Lembranças/presentes",
      "Seguros",
      "Taxa bombeiros",
      "Taxas de vistoria",
      "Lavação Carro",
      "Estacionamento",
      "Uniformes",
      "Pedágio",
      "Seguro de Obra",
      "Uber"
    ]
  },
  {
    "codigoPlanilha": "Custo_pessoal_próprio",
    "grupo": "Custo pessoal próprio",
    "natureza": "CUSTO",
    "subitens": [
      "Salário mensal",
      "Férias",
      "13º",
      "VT",
      "VR",
      "Exames Admissional",
      "FGTS",
      "INSS",
      "Exame Demissional",
      "Custo de contratação",
      "Bônus"
    ]
  },
  {
    "codigoPlanilha": "Custos_com_pessoal",
    "grupo": "Custos com pessoal",
    "natureza": "CUSTO",
    "subitens": [
      "Assessorias",
      "Marcenaria/marmoraria",
      "MO Terceirizada - AC/Exaustão",
      "MO Terceirizada - Elétrica",
      "MO Terceirizada - Esquadrias",
      "MO Terceirizada - Gás",
      "MO Terceirizada - Geral",
      "MO Terceirizada - Gesso",
      "MO Terceirizada - Hidráulica",
      "MO Terceirizada - Impermeabilização",
      "MO Terceirizada - Limpeza",
      "MO Terceirizada - Pintura",
      "MO Terceirizada - Revestimentos",
      "MO Terceirizada - Serralheria",
      "MO Terceirizada - Telhamento/funilaria",
      "Pós obra",
      "Projetos",
      "MO Terceirizada - Civil",
      "RT - Arquitetas",
      "Estacionamento",
      "Chaveiro",
      "MO Terceirizada - Churrasqueira",
      "MO Terceirizada - Içamento",
      "MO Terceirizada - Sondagem"
    ]
  },
  {
    "codigoPlanilha": "Custos_de_material",
    "grupo": "Custos de material",
    "natureza": "CUSTO",
    "subitens": [
      "Proteções",
      "Remoções e demolições",
      "Estrutural",
      "Cobertura",
      "Alvenaria/Reboco/Contrapiso",
      "Impermeabilização",
      "Hidráulico/gás",
      "Elétrico",
      "Instalações de ar-condicionado/exaustão",
      "Esquadrias",
      "Gesso",
      "Revestimentos",
      "Pintura",
      "Serviços finais/limpeza",
      "Aluguel de equipamentos",
      "Outros materiais",
      "Pós obra",
      "Aluguel Container"
    ]
  },
  {
    "codigoPlanilha": "Despesas_administrativas",
    "grupo": "Despesas administrativas",
    "natureza": "DESPESA",
    "subitens": [
      "Aluguel",
      "Material de escritório",
      "Internet/telefone",
      "Luz",
      "Jurídico",
      "Contabilidade",
      "Impressões",
      "Combustíveis",
      "Estacionamento",
      "CREA/PPRA/PCMSO",
      "Uniformes",
      "Saques",
      "Cursos",
      "Consultorias",
      "Restaurantes",
      "Eventos",
      "Condominio",
      "Cartão de Crédito",
      "Taxas Bancárias",
      "Certificado Digital",
      "Registro de Marca"
    ]
  },
  {
    "codigoPlanilha": "Despesas_com_bens",
    "grupo": "Despesas com bens",
    "natureza": "DESPESA",
    "subitens": [
      "Software/Hardware",
      "Licenças",
      "Dominios",
      "Veículos",
      "Equipamentos",
      "Computador",
      "Sinal de negócio",
      "Entrada",
      "Parcela",
      "Cartório / R.I."
    ]
  },
  {
    "codigoPlanilha": "Despesas_com_pessoal",
    "grupo": "Despesas com pessoal",
    "natureza": "DESPESA",
    "subitens": [
      "Salário mensal",
      "Férias",
      "13º",
      "VT",
      "VR",
      "Exames Admissional",
      "FGTS",
      "INSS",
      "Exames Demissional",
      "Despesas de contratação",
      "Bônus",
      "RT - Arquitetas"
    ]
  },
  {
    "codigoPlanilha": "Despesas_comerciais",
    "grupo": "Despesas comerciais",
    "natureza": "DESPESA",
    "subitens": [
      "Anúncios",
      "Agências de mkt",
      "Brindes",
      "Fotos"
    ]
  },
  {
    "codigoPlanilha": "Despesas_financeiras",
    "grupo": "Despesas financeiras",
    "natureza": "DESPESA",
    "subitens": [
      "Despesas bancárias",
      "Despesas cartório",
      "Juros de empréstimos",
      "Tarifas de saque",
      "IOF"
    ]
  },
  {
    "codigoPlanilha": "Impostos",
    "grupo": "Impostos",
    "natureza": "IMPOSTO",
    "subitens": [
      "DAS",
      "ISSQN",
      "TAXA PREFEITURA",
      "Pró-Labore",
      "IPTU",
      "I.R.",
      "DIFAL",
      "IOF",
      "DAM"
    ]
  },
  {
    "codigoPlanilha": "Outras_Despesas",
    "grupo": "Outras despesas",
    "natureza": "DESPESA",
    "subitens": [
      "Pagamentos empréstimos",
      "Taxa Registro de Imóveis",
      "Doação",
      "Taxa Bombeiros"
    ]
  },
  {
    "codigoPlanilha": "Outras_Receitas",
    "grupo": "Outras receitas",
    "natureza": "RECEITA",
    "subitens": [
      "Venda equipamentos",
      "Venda de automóvel",
      "Empréstimos contratados",
      "Saldo inicial",
      "Reembolsos",
      "Seguro de Obra"
    ]
  },
  {
    "codigoPlanilha": "Receitas_com_serviços",
    "grupo": "Receitas com serviços",
    "natureza": "RECEITA",
    "subitens": [
      "Projetos",
      "Obras",
      "Consultorias/Assessorias"
    ]
  },
  {
    "codigoPlanilha": "Receitas_financeiras",
    "grupo": "Receitas financeiras",
    "natureza": "RECEITA",
    "subitens": [
      "Tesouro direto",
      "Rendimento conta",
      "Rendimento poupança",
      "Aplicações financeiras",
      "Aluguel de imóvel",
      "Pronampe"
    ]
  },
  {
    "codigoPlanilha": "Retiradas_sócios",
    "grupo": "Retiradas sócios",
    "natureza": "RETIRADA",
    "subitens": [
      "Distribuição lucros",
      "Pró-Labore",
      "Reembolso"
    ]
  },
  {
    "codigoPlanilha": "Transferências_contas_internas",
    "grupo": "Transferências",
    "natureza": "TRANSFERENCIA",
    "subitens": [
      "Transferência entre contas"
    ]
  }
];

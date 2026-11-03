/**
 * Permissões por módulo × ação. Cada perfil guarda uma matriz { modulo: [acoes] } no banco
 * e pode ser editado em Configurações → Perfis. O acesso por obra é controlado à parte
 * (perfil.acessoTodasObras ou vínculo em usuario_obra).
 */

export const MODULOS = {
  dashboard: "Dashboard",
  obras: "Obras",
  clientes: "Clientes",
  fornecedores: "Fornecedores",
  fornecedores_bancarios: "Dados bancários/PIX de fornecedores",
  orcamentos: "Orçamentos",
  financeiro: "Financeiro",
  compras: "Compras e notas fiscais",
  planejamento: "Planejamento",
  medicoes: "Medições e aditivos",
  relatorios: "Relatórios semanais",
  usuarios: "Usuários e perfis",
  configuracoes: "Configurações da empresa",
  auditoria: "Auditoria",
} as const;

export const ACOES = { ver: "Ver", criar: "Criar", editar: "Editar", excluir: "Excluir", aprovar: "Aprovar" } as const;

export type Modulo = keyof typeof MODULOS;
export type Acao = keyof typeof ACOES;
export type MatrizPermissoes = Partial<Record<Modulo, Acao[]>>;

export const TODAS_ACOES = Object.keys(ACOES) as Acao[];
export const TODOS_MODULOS = Object.keys(MODULOS) as Modulo[];

/** Ações que fazem sentido em cada módulo (as demais não aparecem na matriz). */
export const ACOES_POR_MODULO: Record<Modulo, Acao[]> = {
  dashboard: ["ver"],
  obras: ["ver", "criar", "editar", "excluir"],
  clientes: ["ver", "criar", "editar", "excluir"],
  fornecedores: ["ver", "criar", "editar", "excluir"],
  fornecedores_bancarios: ["ver", "editar"],
  orcamentos: TODAS_ACOES,
  financeiro: TODAS_ACOES,
  compras: TODAS_ACOES,
  planejamento: ["ver", "criar", "editar", "excluir"],
  medicoes: TODAS_ACOES,
  relatorios: TODAS_ACOES,
  usuarios: ["ver", "criar", "editar", "excluir"],
  configuracoes: ["ver", "editar"],
  auditoria: ["ver"],
};

export function pode(matriz: MatrizPermissoes | null | undefined, modulo: Modulo, acao: Acao = "ver"): boolean {
  if (!matriz) return false;
  return matriz[modulo]?.includes(acao) ?? false;
}

/** Remove módulos/ações desconhecidos e combinações inválidas (ex.: vindos de um formulário adulterado). */
export function normalizarMatriz(entrada: Record<string, unknown>): MatrizPermissoes {
  const saida: MatrizPermissoes = {};
  for (const modulo of TODOS_MODULOS) {
    const valor = entrada[modulo];
    if (!Array.isArray(valor)) continue;
    const validas = ACOES_POR_MODULO[modulo].filter((a) => valor.includes(a));
    // "ver" é pré-requisito de qualquer outra ação.
    if (validas.length > 0 && !validas.includes("ver")) validas.unshift("ver");
    if (validas.length) saida[modulo] = validas;
  }
  return saida;
}

const tudo = (): MatrizPermissoes =>
  Object.fromEntries(TODOS_MODULOS.map((m) => [m, [...ACOES_POR_MODULO[m]]])) as MatrizPermissoes;

export interface PerfilPadrao {
  nome: string;
  descricao: string;
  acessoTodasObras: boolean;
  permissoes: MatrizPermissoes;
}

/** Perfis iniciais definidos no briefing (seção 15). */
export const PERFIS_PADRAO: PerfilPadrao[] = [
  {
    nome: "Administrador",
    descricao: "Acesso completo, inclusive usuários, perfis e configurações.",
    acessoTodasObras: true,
    permissoes: tudo(),
  },
  {
    nome: "Diretoria",
    descricao: "Visualiza todos os indicadores, financeiro, orçamentos e obras; aprova orçamentos, medições e pagamentos.",
    acessoTodasObras: true,
    permissoes: {
      dashboard: ["ver"], obras: ["ver", "criar", "editar"], clientes: ["ver"], fornecedores: ["ver"],
      fornecedores_bancarios: ["ver"], orcamentos: ["ver", "aprovar"], financeiro: ["ver", "aprovar"],
      compras: ["ver", "aprovar"], planejamento: ["ver"], medicoes: ["ver", "aprovar"],
      relatorios: ["ver", "aprovar"], usuarios: ["ver"], configuracoes: ["ver"], auditoria: ["ver"],
    },
  },
  {
    nome: "Engenharia",
    descricao: "Módulos técnicos, planejamento, relatórios e controles das obras às quais está vinculado.",
    acessoTodasObras: false,
    permissoes: {
      dashboard: ["ver"], obras: ["ver", "criar", "editar"], clientes: ["ver", "criar", "editar"],
      fornecedores: ["ver", "criar", "editar"], orcamentos: ["ver", "criar", "editar"],
      compras: ["ver", "criar", "editar"], planejamento: ["ver", "criar", "editar", "excluir"],
      medicoes: ["ver", "criar", "editar"], relatorios: ["ver", "criar", "editar"],
    },
  },
  {
    nome: "Administrativo/Financeiro",
    descricao: "Financeiro, compras, notas fiscais, fornecedores e clientes de todas as obras.",
    acessoTodasObras: true,
    permissoes: {
      dashboard: ["ver"], obras: ["ver"], clientes: ["ver", "criar", "editar", "excluir"],
      fornecedores: ["ver", "criar", "editar", "excluir"], fornecedores_bancarios: ["ver", "editar"],
      orcamentos: ["ver"], financeiro: ["ver", "criar", "editar", "excluir"],
      compras: ["ver", "criar", "editar", "excluir"], medicoes: ["ver"], relatorios: ["ver"],
    },
  },
  {
    nome: "Colaborador de obra",
    descricao: "Acesso limitado às atividades e registros de execução das obras atribuídas.",
    acessoTodasObras: false,
    permissoes: { obras: ["ver"], planejamento: ["ver", "editar"], relatorios: ["ver", "criar"] },
  },
];

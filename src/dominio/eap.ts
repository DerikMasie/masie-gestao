/**
 * EAP única (decisão D11): as 16 etapas do Orçamento Padrão + Serviços adicionais, Aditivos e Faturamento direto.
 * `subitens` = de-para com o plano de contas (subitens de "Custos de material" e "MO Terceirizada" do Financeiro
 * e do Controle de NF), para controlar a verba por etapa automaticamente.
 */
export type TipoEtapa = "CONTRATO" | "ADITIVO" | "FATURAMENTO_DIRETO";

export const EAP_UNICA: { nome: string; tipo: TipoEtapa; antigos: string[]; subitens: string[] }[] = [
  { nome: "Serviços preliminares", tipo: "CONTRATO", antigos: ["Serviços iniciais"], subitens: ["Projetos", "ART/Taxas prefeitura", "Seguro de Obra", "Impressões de projetos"] },
  { nome: "Proteções", tipo: "CONTRATO", antigos: [], subitens: ["Proteções"] },
  { nome: "Remoções e demolições", tipo: "CONTRATO", antigos: [], subitens: ["Remoções e demolições"] },
  { nome: "Reforço estrutural", tipo: "CONTRATO", antigos: ["Estrutura", "Reforço estrutura"], subitens: ["Estrutural"] },
  { nome: "Cobertura/funilaria", tipo: "CONTRATO", antigos: ["Cobertura"], subitens: ["Cobertura", "MO Terceirizada - Telhamento/funilaria"] },
  { nome: "Alvenaria / reboco / contrapiso", tipo: "CONTRATO", antigos: [], subitens: ["Alvenaria/Reboco/Contrapiso", "MO Terceirizada - Civil"] },
  { nome: "Impermeabilização", tipo: "CONTRATO", antigos: [], subitens: ["Impermeabilização", "MO Terceirizada - Impermeabilização"] },
  { nome: "Instalações hidráulicas/gás", tipo: "CONTRATO", antigos: [], subitens: ["Hidráulico/gás", "MO Terceirizada - Hidráulica", "MO Terceirizada - Gás"] },
  { nome: "Instalações elétricas/lógicas", tipo: "CONTRATO", antigos: ["Instalações elétricas"], subitens: ["Elétrico", "MO Terceirizada - Elétrica"] },
  { nome: "Instalação de ar-condicionado", tipo: "CONTRATO", antigos: [], subitens: ["Instalações de ar-condicionado/exaustão", "MO Terceirizada - AC/Exaustão"] },
  { nome: "Esquadrias", tipo: "CONTRATO", antigos: [], subitens: ["Esquadrias", "MO Terceirizada - Esquadrias", "MO Terceirizada - Serralheria"] },
  { nome: "Gesso", tipo: "CONTRATO", antigos: [], subitens: ["Gesso", "MO Terceirizada - Gesso"] },
  { nome: "Revestimentos", tipo: "CONTRATO", antigos: [], subitens: ["Revestimentos", "MO Terceirizada - Revestimentos"] },
  { nome: "Pintura", tipo: "CONTRATO", antigos: [], subitens: ["Pintura", "MO Terceirizada - Pintura"] },
  { nome: "Serviços finais", tipo: "CONTRATO", antigos: [], subitens: ["Serviços finais/limpeza", "MO Terceirizada - Limpeza"] },
  { nome: "Aluguel de equipamentos", tipo: "CONTRATO", antigos: ["Alugueis de equipamentos"], subitens: ["Aluguel de equipamentos", "Aluguel Container"] },
  { nome: "Serviços adicionais", tipo: "CONTRATO", antigos: [], subitens: ["Outros materiais", "MO Terceirizada - Geral", "Marcenaria/marmoraria"] },
  { nome: "Aditivos", tipo: "ADITIVO", antigos: [], subitens: [] },
  { nome: "Faturamento direto", tipo: "FATURAMENTO_DIRETO", antigos: [], subitens: [] },
];

export const normalizarNome = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const SINONIMOS = new Map<string, string>();
for (const e of EAP_UNICA) {
  const canon = normalizarNome(e.nome);
  SINONIMOS.set(canon, canon);
  for (const a of e.antigos) SINONIMOS.set(normalizarNome(a), canon);
}
// Grafias do Orçamento Padrão
SINONIMOS.set("instalacao de ar condicionado", normalizarNome("Instalação de ar-condicionado"));
SINONIMOS.set("instalacoes de ar condicionado", normalizarNome("Instalação de ar-condicionado"));
SINONIMOS.set("cobertura funilaria", normalizarNome("Cobertura/funilaria"));

/** Chave canônica de uma etapa: nomes antigos (AO) e do Orçamento Padrão caem na mesma etapa. */
export function chaveEtapa(nome: string): string {
  const n = normalizarNome(nome);
  return SINONIMOS.get(n) ?? n;
}

/** Etapa da EAP correspondente a um subitem do plano de contas (de-para), ou null. */
export function etapaDoSubitem(subitem: string): string | null {
  const n = normalizarNome(subitem);
  return EAP_UNICA.find((e) => e.subitens.some((s) => normalizarNome(s) === n))?.nome ?? null;
}

/**
 * Regras do Quadro de atividades (kanban + calendário).
 */
import { diferencaDias, paraData, paraIso, segundaDaSemana, somarDias } from "./calendario";

/** Paleta fixa de etiquetas: fundo claro + texto escuro (contraste AA), cor nunca é a única pista (o nome vai junto). */
export const CORES_ETIQUETA = {
  amarelo: { fundo: "#fbf3d3", texto: "#6b5300", borda: "#f2d468" },
  grafite: { fundo: "#27272a", texto: "#ffffff", borda: "#27272a" },
  cinza: { fundo: "#e4e4e7", texto: "#27272a", borda: "#d4d4d8" },
  verde: { fundo: "#dcfce7", texto: "#14532d", borda: "#86efac" },
  vermelho: { fundo: "#fee2e2", texto: "#7f1d1d", borda: "#fca5a5" },
  azul: { fundo: "#dbeafe", texto: "#1e3a8a", borda: "#93c5fd" },
  laranja: { fundo: "#ffedd5", texto: "#7c2d12", borda: "#fdba74" },
  roxo: { fundo: "#ede9fe", texto: "#4c1d95", borda: "#c4b5fd" },
} as const;
export type CorEtiqueta = keyof typeof CORES_ETIQUETA;
export const corValida = (c: string): c is CorEtiqueta => c in CORES_ETIQUETA;

export const COLUNAS_PADRAO = [
  { nome: "A fazer", concluida: false },
  { nome: "Em andamento", concluida: false },
  { nome: "Aguardando terceiros", concluida: false },
  { nome: "Em revisão", concluida: false },
  { nome: "Concluído", concluida: true },
];

export const ETIQUETAS_PADRAO: { nome: string; cor: CorEtiqueta }[] = [
  { nome: "Administrativo", cor: "cinza" },
  { nome: "Financeiro", cor: "verde" },
  { nome: "Comercial", cor: "azul" },
  { nome: "Compras", cor: "laranja" },
  { nome: "Projetos", cor: "roxo" },
  { nome: "Urgente", cor: "vermelho" },
  { nome: "Destaque", cor: "amarelo" },
];

/**
 * Posição fracionária para inserir um cartão entre `antes` e `depois` (posições vizinhas na coluna).
 * Sem vizinhos → 1000; no fim → último + 1000; no início → primeiro / 2.
 */
export function posicaoEntre(antes: number | null, depois: number | null): number {
  if (antes == null && depois == null) return 1000;
  if (antes == null) return depois! / 2;
  if (depois == null) return antes + 1000;
  if (depois <= antes) throw new RangeError("Vizinhos fora de ordem");
  return (antes + depois) / 2;
}

/** Menor intervalo aceito entre posições (o banco guarda 10 casas decimais; deixamos folga). */
export const INTERVALO_MINIMO = 1e-4;

/** Verdadeiro quando os vizinhos ficaram próximos demais (inclusive do zero, ao inserir no topo) e convém renumerar a coluna. */
export function precisaRenumerar(antes: number | null, depois: number | null): boolean {
  if (depois == null) return false;
  return depois - (antes ?? 0) < INTERVALO_MINIMO * 2;
}

export type SituacaoPrazo = "SEM_DATA" | "ATRASADO" | "HOJE" | "PROXIMO" | "NO_PRAZO" | "CONCLUIDO";

/** Situação do cartão pela data de entrega; "PROXIMO" = vence em até 2 dias. */
export function situacaoCartao(c: { dataEntrega: string | null; concluido: boolean }, hoje: string): SituacaoPrazo {
  if (c.concluido) return "CONCLUIDO";
  if (!c.dataEntrega) return "SEM_DATA";
  const d = diferencaDias(hoje, c.dataEntrega);
  if (d < 0) return "ATRASADO";
  if (d === 0) return "HOJE";
  if (d <= 2) return "PROXIMO";
  return "NO_PRAZO";
}

export interface DiaCalendario { data: string; doMes: boolean; hoje: boolean; fimDeSemana: boolean }

/** Grade do mês (semanas de segunda a domingo), sempre com semanas completas. `mes` = "AAAA-MM". */
export function gradeDoMes(mes: string, hoje: string): DiaCalendario[][] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new RangeError(`Mês inválido: ${mes}`);
  const primeiro = `${mes}-01`;
  const d = paraData(primeiro);
  const ultimo = paraIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  const semanas: DiaCalendario[][] = [];
  let dia = segundaDaSemana(primeiro);
  while (diferencaDias(dia, ultimo) >= 0) {
    const semana: DiaCalendario[] = [];
    for (let i = 0; i < 7; i++) {
      semana.push({ data: dia, doMes: dia.slice(0, 7) === mes, hoje: dia === hoje, fimDeSemana: i >= 5 });
      dia = somarDias(dia, 1);
    }
    semanas.push(semana);
  }
  return semanas;
}

export function mesVizinho(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function nomeDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return `${MESES[m - 1]} de ${a}`;
}

export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p.at(-1)![0] : "")).toUpperCase();
}

/**
 * Painel por engenheiro (visão "sala de controle").
 *  E1  Engenheiro da obra = responsável técnico; sem ele, o gestor; sem nenhum, "Sem responsável".
 *  E2  Execução = Em andamento; Aguardando = Contratada (assinada, ainda não iniciada) + Paralisada;
 *      Total = todas, menos canceladas. Receita = valor de contrato.
 *  E3  Medidor de carga = obras ativas (contratada, em andamento ou paralisada) do engenheiro:
 *      verde até 3, amarelo de 4 a 6, vermelho a partir de 7 (escala até 10).
 */

import type { SituacaoObra } from "./obra";

export const CARGA = { verdeAte: 3, amareloAte: 6, maximo: 10 } as const;
export type ZonaCarga = "VERDE" | "AMARELO" | "VERMELHO";

export function zonaCarga(n: number): ZonaCarga {
  return n <= CARGA.verdeAte ? "VERDE" : n <= CARGA.amareloAte ? "AMARELO" : "VERMELHO";
}

/** Situações exibidas nas barras do engenheiro (na ordem do ciclo da obra). */
export const SITUACOES_BARRAS: { situacao: SituacaoObra; rotulo: string }[] = [
  { situacao: "PROSPECCAO", rotulo: "Prospecção" },
  { situacao: "EM_ORCAMENTO", rotulo: "Orçamento" },
  { situacao: "CONTRATADA", rotulo: "Contratada" },
  { situacao: "EM_ANDAMENTO", rotulo: "Andamento" },
  { situacao: "PARALISADA", rotulo: "Paralisada" },
  { situacao: "CONCLUIDA", rotulo: "Concluída" },
];

export interface ObraPainel { id: string; codigo: string; nome: string; situacao: SituacaoObra; valor: number; engenheiroId: string | null; engenheiro: string | null }

export interface ResumoEmpresa {
  emExecucao: number; aguardando: number; total: number;
  receitaTotal: number; receitaAguardando: number; receitaAndamento: number;
}

const ATIVAS: SituacaoObra[] = ["CONTRATADA", "EM_ANDAMENTO", "PARALISADA"];
const AGUARDANDO: SituacaoObra[] = ["CONTRATADA", "PARALISADA"];

export function resumoEmpresa(obras: ObraPainel[]): ResumoEmpresa {
  const validas = obras.filter((o) => o.situacao !== "CANCELADA");
  const soma = (l: ObraPainel[]) => l.reduce((t, o) => t + o.valor, 0);
  const exec = validas.filter((o) => o.situacao === "EM_ANDAMENTO");
  const ag = validas.filter((o) => AGUARDANDO.includes(o.situacao));
  return { emExecucao: exec.length, aguardando: ag.length, total: validas.length, receitaTotal: soma(validas), receitaAguardando: soma(ag), receitaAndamento: soma(exec) };
}

export interface GrupoEngenheiro {
  id: string | null; nome: string; iniciais: string;
  porSituacao: number[];
  obras: ObraPainel[];
  ativas: number; zona: ZonaCarga;
  valorTotal: number; percentual: number;
}

export const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";

/** E1–E3: agrupa as obras (menos canceladas) por engenheiro, do mais carregado para o menos. */
export function agruparPorEngenheiro(obras: ObraPainel[]): GrupoEngenheiro[] {
  const validas = obras.filter((o) => o.situacao !== "CANCELADA");
  const total = validas.reduce((t, o) => t + o.valor, 0);
  const m = new Map<string, ObraPainel[]>();
  for (const o of validas) {
    const k = o.engenheiroId ?? "";
    m.set(k, [...(m.get(k) ?? []), o]);
  }
  return [...m.entries()].map(([k, l]) => {
    const nome = k ? l[0]!.engenheiro ?? "?" : "Sem responsável";
    const ativas = l.filter((o) => ATIVAS.includes(o.situacao)).length;
    const valorTotal = l.reduce((t, o) => t + o.valor, 0);
    return {
      id: k || null, nome, iniciais: k ? iniciais(nome) : "—",
      porSituacao: SITUACOES_BARRAS.map((s) => l.filter((o) => o.situacao === s.situacao).length),
      obras: [...l].sort((a, b) => b.valor - a.valor), ativas, zona: zonaCarga(ativas), valorTotal,
      percentual: total > 0 ? valorTotal / total : 0,
    };
  }).sort((a, b) => (a.id == null ? 1 : 0) - (b.id == null ? 1 : 0) || b.ativas - a.ativas || b.valorTotal - a.valorTotal);
}

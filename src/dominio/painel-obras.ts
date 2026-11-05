/**
 * Painel de obras — situação de ritmo e pendências da rotina (decisões do cliente de 06/11/2026).
 *
 *  P1  Ritmo pela diferença realizado − previsto acumulados até a semana atual, em pontos percentuais:
 *        > +2 adiantada · de −2 a +2 no ritmo · de −5 a −2 atenção · abaixo de −5 atrasada.
 *      Obra sem planilha ou sem previsto: "sem cronograma".
 *  P2  Pendências da rotina já executada no sistema: lançar o realizado, emitir o relatório de sexta, fechar a medição,
 *      cobrar medição não paga, pagar fornecedor com serviço executado, acertado acima da verba, prazo apertado.
 */

export type Ritmo = "ADIANTADA" | "NO_RITMO" | "ATENCAO" | "ATRASADA" | "SEM_CRONOGRAMA";

export const RITMO: Record<Ritmo, { rotulo: string; ordem: number }> = {
  ATRASADA: { rotulo: "Atrasada", ordem: 0 },
  ATENCAO: { rotulo: "Atenção", ordem: 1 },
  SEM_CRONOGRAMA: { rotulo: "Sem cronograma", ordem: 2 },
  NO_RITMO: { rotulo: "No ritmo", ordem: 3 },
  ADIANTADA: { rotulo: "Adiantada", ordem: 4 },
};

/** P1. `diferenca` em fração (−0,03 = 3 pontos abaixo). */
export function classificarRitmo(realizado: number | null, previsto: number | null): Ritmo {
  if (realizado == null || previsto == null) return "SEM_CRONOGRAMA";
  const pp = (realizado - previsto) * 100;
  if (pp > 2 + 1e-9) return "ADIANTADA";
  if (pp >= -2 - 1e-9) return "NO_RITMO";
  if (pp >= -5 - 1e-9) return "ATENCAO";
  return "ATRASADA";
}

export type Gravidade = "ALTA" | "MEDIA" | "INFO";
export type TipoPendencia =
  | "REALIZADO_NAO_LANCADO" | "RELATORIO_NAO_EMITIDO" | "MEDICAO_A_FECHAR" | "MEDICAO_NAO_PAGA"
  | "FORNECEDOR_A_PAGAR" | "ACERTADO_ACIMA_VERBA" | "PRAZO" | "SEM_PLANILHA" | "SEM_PREVISTO";

export interface Pendencia { tipo: TipoPendencia; gravidade: Gravidade; texto: string; vista: string }

export interface EntradaPendencias {
  hoje: string;
  /** Dia da semana de hoje: 1 = segunda … 5 = sexta, 6/7 = fim de semana. */
  diaSemana: number;
  semanaAtual: number;
  temServicos: boolean;
  temPrevisto: boolean;
  /** Semanas com algum previsto e com algum realizado lançado. */
  semanasComPrevisto: Set<number>;
  semanasComRealizado: Set<number>;
  /** Semanas com relatório emitido (status EMITIDO). */
  relatoriosEmitidos: Set<number>;
  inicioObra: string;
  medicoes: { numero: number; estado: "FECHADA" | "A_FECHAR" | "EM_ANDAMENTO" | "FUTURA"; cobranca: number; situacao: "PAGA" | "NAO_PAGA"; data: string }[];
  fornecedoresExecutadoNaoPago: { nome: string; valor: number }[];
  acimaDaVerba: { quantidade: number; excesso: number };
  prazo: { status: string; prazoDecorrido: number; diasAtraso: number; dataFim: string };
  realizado: number | null;
}

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
const br = (iso: string) => iso.split("-").reverse().join("/");
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** P2: pendências da obra, da mais grave para a menos grave. */
export function pendenciasObra(e: EntradaPendencias): Pendencia[] {
  const p: Pendencia[] = [];
  if (e.prazo.status === "ATRASADA") {
    p.push({ tipo: "PRAZO", gravidade: "ALTA", texto: `Prazo contratual vencido em ${br(e.prazo.dataFim)} (${e.prazo.diasAtraso} dia(s) de atraso)`, vista: "avanco" });
  }
  if (!e.temServicos) {
    p.push({ tipo: "SEM_PLANILHA", gravidade: "INFO", texto: "Planilha da obra ainda não montada (gere do orçamento ou importe a planilha de controle)", vista: "planilha" });
    return ordenar(p);
  }
  if (!e.temPrevisto) p.push({ tipo: "SEM_PREVISTO", gravidade: "INFO", texto: "Previsto físico não preenchido: o ritmo da obra não pode ser avaliado", vista: "previsto" });

  // Realizado: semana passada (com previsto) sem lançamento = alta; semana atual a partir de quinta = média.
  const anterior = e.semanaAtual - 1;
  if (anterior >= 1 && e.semanasComPrevisto.has(anterior) && !e.semanasComRealizado.has(anterior)) {
    p.push({ tipo: "REALIZADO_NAO_LANCADO", gravidade: "ALTA", texto: `Realizado da semana ${anterior} não lançado`, vista: `semana&semana=${anterior}` });
  }
  if (e.diaSemana >= 4 && e.semanasComPrevisto.has(e.semanaAtual) && !e.semanasComRealizado.has(e.semanaAtual)) {
    p.push({ tipo: "REALIZADO_NAO_LANCADO", gravidade: "MEDIA", texto: `Lançar o realizado da semana ${e.semanaAtual} para o relatório de sexta`, vista: `semana&semana=${e.semanaAtual}` });
  }

  // Relatório de sexta: semana passada sem emissão = alta; semana atual a partir de sexta = média.
  if (anterior >= 1 && !e.relatoriosEmitidos.has(anterior)) {
    p.push({ tipo: "RELATORIO_NAO_EMITIDO", gravidade: "ALTA", texto: `Relatório da semana ${anterior} não emitido`, vista: "relatorio" });
  }
  if (e.diaSemana >= 5 && !e.relatoriosEmitidos.has(e.semanaAtual)) {
    p.push({ tipo: "RELATORIO_NAO_EMITIDO", gravidade: "MEDIA", texto: `Emitir o relatório da semana ${e.semanaAtual} (sexta-feira)`, vista: "relatorio" });
  }

  for (const m of e.medicoes) {
    if (m.estado === "A_FECHAR") p.push({ tipo: "MEDICAO_A_FECHAR", gravidade: "ALTA", texto: `Fechar a medição ${m.numero} (${moeda(m.cobranca)})`, vista: "medicoes" });
    if (m.estado === "FECHADA" && m.situacao === "NAO_PAGA" && m.cobranca > 0.005) {
      const dias = diasEntre(m.data, e.hoje);
      p.push({ tipo: "MEDICAO_NAO_PAGA", gravidade: dias > 7 ? "ALTA" : "MEDIA", texto: `Medição ${m.numero} de ${br(m.data)} não paga (${moeda(m.cobranca)}${dias > 0 ? `, há ${dias} dia(s)` : ""})`, vista: "medicoes" });
    }
  }

  const aPagar = e.fornecedoresExecutadoNaoPago.filter((f) => f.valor > 1);
  if (aPagar.length) {
    const total = aPagar.reduce((t, f) => t + f.valor, 0);
    p.push({ tipo: "FORNECEDOR_A_PAGAR", gravidade: "MEDIA", texto: `${aPagar.length} fornecedor(es) com serviço executado e não pago (${moeda(total)}): ${aPagar.slice(0, 3).map((f) => f.nome).join(", ")}${aPagar.length > 3 ? "…" : ""}`, vista: "gerencial" });
  }
  if (e.acimaDaVerba.quantidade > 0) {
    p.push({ tipo: "ACERTADO_ACIMA_VERBA", gravidade: "MEDIA", texto: `${e.acimaDaVerba.quantidade} serviço(s) com MO acertada acima da verba (+${moeda(e.acimaDaVerba.excesso)})`, vista: "planilha" });
  }

  if (e.prazo.status !== "ATRASADA" && e.prazo.prazoDecorrido >= 0.8 && e.realizado != null && e.realizado < 0.8) {
    p.push({ tipo: "PRAZO", gravidade: "ALTA", texto: `${Math.round(e.prazo.prazoDecorrido * 100)}% do prazo decorrido com ${Math.round(e.realizado * 100)}% executado (término ${br(e.prazo.dataFim)})`, vista: "avanco" });
  }
  return ordenar(p);
}

const PESO: Record<Gravidade, number> = { ALTA: 0, MEDIA: 1, INFO: 2 };
const ordenar = (p: Pendencia[]) => p.sort((a, b) => PESO[a.gravidade] - PESO[b.gravidade]);

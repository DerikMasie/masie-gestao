/**
 * Relatório semanal ao cliente (aba "Relatório Situação" da planilha + relatório fotográfico).
 *
 *  R1  Relatório fotográfico: até 6 fotos por página A4, sempre simétrico, todas no mesmo formato (4:3, recorte
 *      centralizado no ponto de foco escolhido):
 *        1 foto  → uma grande               4 fotos → 2 × 2
 *        2 fotos → lado a lado              5 fotos → 2 + 2 + 1 centralizada
 *        3 fotos → uma grande + 2 abaixo    6 fotos → 2 × 3
 *      Mais de 6: páginas de 6 e a última página segue a regra acima com o que sobrar.
 *  R2  Textos sugeridos a partir do físico (editáveis): serviços com avanço na semana, previstos para a próxima semana
 *      e previsão de término pelo previsto.
 */

export interface LinhaFotos { colunas: 1 | 2; fotos: number[] }
export type PaginaFotos = LinhaFotos[];

export const FOTOS_POR_PAGINA = 6;

function montarPagina(inicio: number, n: number): PaginaFotos {
  const i = (k: number) => inicio + k;
  switch (n) {
    case 1: return [{ colunas: 1, fotos: [i(0)] }];
    case 2: return [{ colunas: 2, fotos: [i(0), i(1)] }];
    case 3: return [{ colunas: 1, fotos: [i(0)] }, { colunas: 2, fotos: [i(1), i(2)] }];
    case 4: return [{ colunas: 2, fotos: [i(0), i(1)] }, { colunas: 2, fotos: [i(2), i(3)] }];
    case 5: return [{ colunas: 2, fotos: [i(0), i(1)] }, { colunas: 2, fotos: [i(2), i(3)] }, { colunas: 2, fotos: [i(4)] }];
    default: return [{ colunas: 2, fotos: [i(0), i(1)] }, { colunas: 2, fotos: [i(2), i(3)] }, { colunas: 2, fotos: [i(4), i(5)] }];
  }
}

/** R1: distribui N fotos em páginas simétricas. Linhas de 2 colunas com 1 foto ficam centralizadas. */
export function paginarFotos(n: number): PaginaFotos[] {
  const paginas: PaginaFotos[] = [];
  for (let inicio = 0; inicio < n; inicio += FOTOS_POR_PAGINA) paginas.push(montarPagina(inicio, Math.min(FOTOS_POR_PAGINA, n - inicio)));
  return paginas;
}

// ───────────── R2: sugestões de texto ─────────────

export interface ServicoTexto {
  descricao: string;
  etapa: string;
  previsto: Record<number, number>;
  realizado: Record<number, number>;
}

const pct = (v: number) => `${Math.round(v * 1000) / 10}`.replace(".", ",") + "%";
const somaAte = (r: Record<number, number>, ate: number) => Object.entries(r).filter(([k]) => Number(k) <= ate).reduce((t, [, v]) => t + v, 0);

/** Serviços com avanço lançado na semana: "Etapa — serviço: concluído" ou "em andamento (x%)". */
export function sugerirRealizadas(servicos: ServicoTexto[], semana: number): string {
  const linhas = servicos.filter((s) => (s.realizado[semana] ?? 0) > 0).map((s) => {
    const acum = somaAte(s.realizado, semana);
    return `• ${s.etapa} — ${s.descricao}: ${acum >= 1 - 1e-6 ? "concluído" : `em andamento (${pct(acum)} executado)`}`;
  });
  return linhas.join("\n");
}

/** Serviços com previsto na semana seguinte e ainda não concluídos. */
export function sugerirProximaSemana(servicos: ServicoTexto[], semana: number): string {
  return servicos.filter((s) => (s.previsto[semana + 1] ?? 0) > 0 && somaAte(s.realizado, semana) < 1 - 1e-6)
    .map((s) => `• ${s.etapa} — ${s.descricao}`).join("\n");
}

/** Situação do prazo pelo avanço: realizado × previsto até a semana e semana em que o previsto chega a 100%. */
export function sugerirPrazo(d: { realizado: number; previsto: number; semanaFimPrevisto: number | null; dataFimPrevisto: string | null; dataFimContratual: string }): string {
  const br = (iso: string) => iso.split("-").reverse().join("/");
  const dif = (d.realizado - d.previsto) * 100;
  const ritmo = Math.abs(dif) < 0.5 ? "no ritmo previsto" : dif > 0 ? `${Math.abs(dif).toFixed(1).replace(".", ",")} pontos à frente do previsto` : `${Math.abs(dif).toFixed(1).replace(".", ",")} pontos atrás do previsto`;
  const fim = d.dataFimPrevisto ? `Término previsto pelo cronograma: ${br(d.dataFimPrevisto)}` : "Cronograma previsto ainda incompleto";
  return `Avanço físico de ${pct(d.realizado)} (previsto ${pct(d.previsto)}), ${ritmo}. ${fim}; término contratual: ${br(d.dataFimContratual)}.`;
}

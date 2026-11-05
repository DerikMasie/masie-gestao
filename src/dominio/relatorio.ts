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

// ───────────── R3: cores do relatório por obra ─────────────

/**
 * Três cores personalizáveis por obra:
 *  principal = faixas de título, barras, rosca e linha do realizado (cor dominante);
 *  destaque  = marca nas faixas, borda das seções e traço do previsto (cor de realce);
 *  fundo     = fundo dos títulos das seções (tom claro).
 * O texto sobre a cor principal fica branco ou preto automaticamente, pelo contraste.
 */
export interface CoresRelatorio { principal: string; destaque: string; fundo: string }

export const PALETAS: { id: string; nome: string; cores: CoresRelatorio }[] = [
  { id: "masie", nome: "Masie (padrão)", cores: { principal: "#161616", destaque: "#f2d468", fundo: "#fbf3d3" } },
  { id: "grafite-azul", nome: "Grafite e azul", cores: { principal: "#1f2937", destaque: "#3b82f6", fundo: "#e3edfd" } },
  { id: "marinho-dourado", nome: "Marinho e dourado", cores: { principal: "#0b2545", destaque: "#c9a227", fundo: "#f6efd6" } },
  { id: "verde", nome: "Verde", cores: { principal: "#1d3b2a", destaque: "#7cb342", fundo: "#edf5e1" } },
  { id: "terracota", nome: "Terracota", cores: { principal: "#4a2c2a", destaque: "#e07a5f", fundo: "#fbe6de" } },
  { id: "vinho", nome: "Vinho", cores: { principal: "#4c1d2b", destaque: "#c08497", fundo: "#f6e8ec" } },
];
export const CORES_PADRAO: CoresRelatorio = PALETAS[0]!.cores;

const HEX = /^#[0-9a-f]{6}$/i;
export const corValida = (c: unknown): c is string => typeof c === "string" && HEX.test(c);

/** Aceita cores salvas (ou ausentes) e completa com o padrão Masie. */
export function normalizarCores(x: unknown): CoresRelatorio {
  const o = (x ?? {}) as Record<string, unknown>;
  return {
    principal: corValida(o.principal) ? o.principal.toLowerCase() : CORES_PADRAO.principal,
    destaque: corValida(o.destaque) ? o.destaque.toLowerCase() : CORES_PADRAO.destaque,
    fundo: corValida(o.fundo) ? o.fundo.toLowerCase() : CORES_PADRAO.fundo,
  };
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Luminância relativa (WCAG). */
export function luminancia(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
/** Cor do texto sobre um fundo: branco ou quase preto, o que tiver mais contraste. */
export function textoSobre(fundo: string): string {
  return contraste(fundo, "#ffffff") >= contraste(fundo, "#161616") ? "#ffffff" : "#161616";
}
/** Mistura a cor com preto (fator 0–1), para traços legíveis sobre fundo claro. */
export function escurecer(hex: string, fator: number): string {
  return "#" + rgb(hex).map((v) => Math.round(v * (1 - fator)).toString(16).padStart(2, "0")).join("");
}
/** Avisos de legibilidade para a escolha do usuário. */
export function avisosCores(c: CoresRelatorio): string[] {
  const a: string[] = [];
  if (contraste(c.principal, "#ffffff") < 3) a.push("A cor principal é clara: barras e linhas podem ficar fracas no papel. Prefira um tom mais escuro.");
  if (contraste(c.fundo, "#161616") < 7) a.push("O fundo das seções está escuro: os títulos podem perder leitura. Prefira um tom bem claro.");
  return a;
}

import type ExcelJS from "exceljs";
import { normalizarNome } from "@/dominio/eap";
import { abrirPlanilha, dataIso, numero, texto, valorBruto } from "./planilha";

/**
 * Leitor das abas "Realizado-Físico" e "Previsto físico" das planilhas de controle de obra (modelo AO e versões como
 * a do Palco). As colunas são localizadas pelo cabeçalho ("Nome da Tarefa", "Valor cliente"...), porque os modelos
 * têm colunas em posições diferentes. As semanas são as colunas cujo cabeçalho é uma data.
 */

export interface ServicoLido {
  linha: number;
  nome: string;
  fornecedor: string | null;
  acertada: number | null;
  verba: number;
  cliente: number;
  duracao: number;
  abc: "A" | "B" | "C" | null;
  /** data da semana (AAAA-MM-DD) → fração */
  realizado: Map<string, number>;
  previsto: Map<string, number>;
}

export interface EtapaLida { nome: string; ordem: number | null; servicos: ServicoLido[] }

export interface FisicoLido {
  etapas: EtapaLida[];
  datas: string[];
  temPrevisto: boolean;
  avisos: string[];
}

const CABECALHOS = {
  nome: ["nome da tarefa"],
  etapa: ["inserir manualmente"],
  fornecedor: ["fornecedor"],
  acertada: ["mao de obra acertada"],
  abc: ["curva abc"],
  verba: ["mao de obra verba"],
  cliente: ["valor cliente"],
  duracao: ["duracao dias", "duracao"],
} as const;

type Colunas = { -readonly [K in keyof typeof CABECALHOS]?: number } & { semanas: { col: number; data: string }[]; linhaCabecalho: number };

function localizarColunas(ws: ExcelJS.Worksheet): Colunas | null {
  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const achadas: Colunas = { semanas: [], linhaCabecalho: r };
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      const b = valorBruto(cell.value);
      if (b instanceof Date) { const d = dataIso(b); if (d) achadas.semanas.push({ col: c, data: d }); return; }
      const t = texto(cell.value);
      if (!t) return;
      const n = normalizarNome(t);
      for (const [campo, nomes] of Object.entries(CABECALHOS) as [keyof typeof CABECALHOS, readonly string[]][]) {
        if (achadas[campo] == null && nomes.includes(n)) achadas[campo] = c;
      }
    });
    if (achadas.nome != null) return achadas;
  }
  return null;
}

const abaPorNome = (wb: ExcelJS.Workbook, re: RegExp) => wb.worksheets.find((w) => re.test(normalizarNome(w.name)));

export async function lerFisicoPlanilha(arquivo: Buffer | ArrayBuffer): Promise<FisicoLido> {
  const wb = await abrirPlanilha(arquivo);
  const real = abaPorNome(wb, /^realizado fisico$/);
  if (!real) throw new Error("Aba \"Realizado-Físico\" não encontrada. Envie a planilha de controle da obra (modelo AO).");
  const c = localizarColunas(real);
  if (!c || c.cliente == null || c.semanas.length === 0) throw new Error("Cabeçalho da aba Realizado-Físico não reconhecido (esperado: Nome da Tarefa, Valor cliente, Duração e as datas das semanas).");
  const avisos: string[] = [];

  const prevAba = abaPorNome(wb, /^previsto fisico$/);
  const cp = prevAba ? localizarColunas(prevAba) : null;
  if (prevAba && (!cp || cp.semanas.length === 0)) avisos.push("Aba Previsto físico sem datas de semana reconhecíveis — previsto não importado.");

  const etapas: EtapaLida[] = [];
  let atual: EtapaLida | null = null;
  const num = (ws: ExcelJS.Worksheet, r: number, col?: number) => (col == null ? null : numero(ws.getRow(r).getCell(col).value));

  for (let r = c.linhaCabecalho + 1; r <= real.rowCount; r++) {
    const row = real.getRow(r);
    const nome = texto(row.getCell(c.nome!).value);
    if (nome && normalizarNome(nome) === "duracao total") break;
    const ordem = c.etapa != null ? numero(row.getCell(c.etapa).value) : null;
    if (ordem != null && nome && Number.isInteger(ordem)) {
      atual = { nome, ordem, servicos: [] };
      etapas.push(atual);
      continue;
    }
    if (!nome || /^0+$/.test(nome)) continue;
    if (!atual) { atual = { nome: "Outros", ordem: null, servicos: [] }; etapas.push(atual); }
    const semanas = (ws: ExcelJS.Worksheet, cols: Colunas["semanas"]) => {
      const m = new Map<string, number>();
      for (const s of cols) { const v = num(ws, r, s.col); if (v) m.set(s.data, v); }
      return m;
    };
    const abcTxt = c.abc != null ? texto(row.getCell(c.abc).value)?.toUpperCase() : null;
    const forn = c.fornecedor != null ? texto(row.getCell(c.fornecedor).value) : null;
    atual.servicos.push({
      linha: r, nome,
      fornecedor: forn && !/^0$/.test(forn) ? forn : null,
      acertada: num(real, r, c.acertada),
      verba: num(real, r, c.verba) ?? 0,
      cliente: num(real, r, c.cliente) ?? 0,
      duracao: num(real, r, c.duracao) ?? 0,
      abc: abcTxt === "A" || abcTxt === "B" || abcTxt === "C" ? abcTxt : null,
      realizado: semanas(real, c.semanas),
      // As duas abas têm o mesmo layout de linhas (o Previsto referencia as linhas do Realizado).
      previsto: prevAba && cp && cp.semanas.length ? semanas(prevAba, cp.semanas) : new Map(),
    });
  }
  const datas = [...new Set([...c.semanas.map((s) => s.data), ...(cp?.semanas.map((s) => s.data) ?? [])])].sort();
  return { etapas, datas, temPrevisto: !!(prevAba && cp && cp.semanas.length), avisos };
}

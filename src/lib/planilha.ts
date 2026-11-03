import ExcelJS from "exceljs";
import JSZip from "jszip";

/**
 * Abre .xlsx/.xlsm de forma tolerante. Algumas planilhas da empresa têm filtros de tabela
 * (autoFilter) que o leitor não suporta; eles são removidos em memória (os dados não mudam).
 * Macros (vbaProject.bin) são descartadas e nunca executadas.
 */
export async function abrirPlanilha(arquivo: Buffer | ArrayBuffer): Promise<ExcelJS.Workbook> {
  const zip = await JSZip.loadAsync(arquivo);
  zip.remove("xl/vbaProject.bin");
  for (const nome of Object.keys(zip.files).filter((n) => /^xl\/tables\/table\d+\.xml$/.test(n))) {
    const xml = await zip.file(nome)!.async("string");
    zip.file(nome, xml.replace(/<autoFilter\b[^>]*\/>/g, "").replace(/<autoFilter\b[\s\S]*?<\/autoFilter>/g, ""));
  }
  const limpo = await zip.generateAsync({ type: "nodebuffer" });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(limpo as unknown as ArrayBuffer);
  return wb;
}

type Valor = ExcelJS.CellValue;

export function valorBruto(v: Valor): unknown {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) return (v as { result?: unknown }).result;
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    if ("text" in v) return (v as { text: string }).text;
    if ("error" in v) return undefined;
    if ("formula" in v || "sharedFormula" in v) return undefined;
  }
  return v;
}

/** Número da célula; texto como "1.234,56" também é aceito. Retorna null se vazio ou inválido. */
export function numero(v: Valor): number | null {
  const b = valorBruto(v);
  if (typeof b === "number" && Number.isFinite(b)) return b;
  if (typeof b === "string" && b.trim()) {
    let t = b.trim().replace(/[R$\s]/g, "");
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function texto(v: Valor): string | null {
  const b = valorBruto(v);
  if (b == null) return null;
  if (b instanceof Date) return b.toISOString().slice(0, 10);
  const t = String(b).replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}

/** Data ISO (AAAA-MM-DD). Aceita Date, número serial do Excel e "dd/mm/aaaa". */
export function dataIso(v: Valor): string | null {
  const b = valorBruto(v);
  if (b instanceof Date) return Number.isNaN(b.getTime()) ? null : b.toISOString().slice(0, 10);
  if (typeof b === "number" && b > 20000 && b < 80000) return new Date(Math.round((b - 25569) * 86400000)).toISOString().slice(0, 10);
  if (typeof b === "string") {
    const m = b.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(b)) return b.slice(0, 10);
  }
  return null;
}

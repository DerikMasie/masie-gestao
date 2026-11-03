/**
 * Leitura do "Orçamento Padrão Masie.xlsx" (abas ORÇAMENTO e PROPOSTA).
 * Não executa fórmulas nem macros: usa os valores já calculados que o Excel grava no arquivo.
 */
import ExcelJS from "exceljs";
import { PARAMETROS_PADRAO, type ParametrosOrcamento } from "@/dominio/orcamento";

export interface ItemImportado {
  grupo: string | null;
  descricao: string;
  unidade: string | null;
  quantidade: number;
  quebra: number;
  custoUnitarioMaoDeObra: number;
  custoUnitarioMaterial: number;
  memoriaCalculo: string | null;
  linha: number;
}

export interface EtapaImportada { codigo: string; nome: string; itens: ItemImportado[] }

export interface OrcamentoImportado {
  parametros: ParametrosOrcamento;
  etapas: EtapaImportada[];
  /** Total "valor final" (sem imposto) calculado pela planilha, para conferência. */
  totalVendaPlanilha: number | null;
  /** "Investimento total" (com imposto) da aba PROPOSTA. */
  totalPropostaPlanilha: number | null;
  avisos: string[];
}

type Valor = ExcelJS.CellValue;

function bruto(v: Valor): unknown {
  if (v && typeof v === "object") {
    if ("result" in v) return (v as { result?: unknown }).result;
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    if ("text" in v) return (v as { text: string }).text;
    if ("formula" in v || "sharedFormula" in v) return undefined;
  }
  return v;
}

function num(v: Valor): number {
  const b = bruto(v);
  if (typeof b === "number" && Number.isFinite(b)) return b;
  if (typeof b === "string") {
    const n = Number(b.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function texto(v: Valor): string | null {
  const b = bruto(v);
  if (b == null) return null;
  const t = String(b).replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}

function formula(v: Valor): string | null {
  if (v && typeof v === "object" && "formula" in v && typeof (v as { formula?: string }).formula === "string") return `=${(v as { formula: string }).formula}`;
  return null;
}

const NOME_ABA_ORC = /^or[cç]amento$/i;

export async function lerOrcamentoPadrao(arquivo: Buffer | ArrayBuffer): Promise<OrcamentoImportado> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(arquivo as ArrayBuffer);
  } catch {
    throw new Error("Não foi possível ler o arquivo. Envie uma planilha .xlsx (salve como .xlsx se estiver em .xlsm/.xls).");
  }
  const ws = wb.worksheets.find((w) => NOME_ABA_ORC.test(w.name.trim()));
  if (!ws) throw new Error('A planilha não tem a aba "ORÇAMENTO" no formato do Orçamento Padrão Masie.');

  const avisos: string[] = [];
  const etapas: EtapaImportada[] = [];
  let etapa: EtapaImportada | null = null;
  let grupo: string | null = null;

  // Cabeçalho: localizar a linha "Item | Descrição | Unid. | Quant. | Quebra | Valor M.O. | Valor Material"
  let inicio = 1;
  ws.eachRow((row, n) => {
    if (inicio === 1 && texto(row.getCell(3).value)?.toLowerCase() === "item" && texto(row.getCell(4).value)?.toLowerCase().startsWith("descri")) inicio = n + 1;
  });

  for (let n = inicio; n <= ws.rowCount; n++) {
    const row = ws.getRow(n);
    const codigo = texto(row.getCell(3).value);
    if (!codigo || !/^\d+(\.\d+)*$/.test(codigo)) {
      if (texto(row.getCell(10).value)?.toUpperCase() === "M.O") break; // bloco de totais da planilha
      continue;
    }
    const descricao = texto(row.getCell(4).value);
    const nivel = codigo.split(".").length;
    if (nivel === 1) {
      if (!descricao) continue;
      etapa = { codigo, nome: descricao, itens: [] };
      etapas.push(etapa);
      grupo = null;
      continue;
    }
    if (!etapa) { avisos.push(`Linha ${n}: item ${codigo} fora de uma etapa — ignorado.`); continue; }
    if (!descricao) continue; // linhas vazias do modelo

    const unidade = texto(row.getCell(5).value);
    const quantidade = num(row.getCell(6).value);
    const quebraCel = num(row.getCell(7).value);
    const mo = num(row.getCell(8).value);
    const mat = num(row.getCell(9).value);
    const proximo = texto(ws.getRow(n + 1).getCell(3).value) ?? "";

    // Nível 2 sem unidade e sem valores, seguido de itens de nível 3 = subgrupo.
    if (nivel === 2 && !unidade && !quantidade && !mo && !mat && proximo.startsWith(`${codigo}.`)) {
      grupo = descricao;
      continue;
    }
    if (nivel === 2) grupo = null;
    if (quantidade < 0 || mo < 0 || mat < 0) avisos.push(`Linha ${n} (${codigo}): valor negativo importado como está.`);
    const fq = formula(row.getCell(6).value);
    etapa.itens.push({
      grupo: nivel >= 3 ? grupo : null,
      descricao, unidade, quantidade,
      quebra: quebraCel > 0 ? quebraCel : 1,
      custoUnitarioMaoDeObra: mo, custoUnitarioMaterial: mat,
      memoriaCalculo: fq ? `Planilha (linha ${n}): ${fq}` : null,
      linha: n,
    });
  }

  if (!etapas.length) throw new Error("Nenhuma etapa encontrada na aba ORÇAMENTO.");

  // Total da planilha: célula "TOTAL BDI" do bloco de totais (coluna O na linha seguinte ao rótulo).
  let totalVendaPlanilha: number | null = null;
  ws.eachRow((row, n) => {
    if (texto(row.getCell(15).value)?.toUpperCase() === "TOTAL BDI") totalVendaPlanilha = num(ws.getRow(n + 1).getCell(15).value);
  });

  // Parâmetros da aba PROPOSTA (D6 BDI MO, D7 gerenciamento de materiais, D8 imposto, D9 horário, D10 local, D11 mínimo).
  const parametros: ParametrosOrcamento = { ...PARAMETROS_PADRAO, formaImposto: "POR_FORA", arredondamento: "REAL_ACIMA" };
  let totalPropostaPlanilha: number | null = null;
  const prop = wb.worksheets.find((w) => /^proposta$/i.test(w.name.trim()));
  if (prop) {
    parametros.bdiMaoDeObra = num(prop.getCell("D6").value);
    parametros.bdiMaterial = num(prop.getCell("D7").value);
    parametros.impostos = num(prop.getCell("D8").value);
    parametros.adicionalHorario = num(prop.getCell("D9").value);
    parametros.adicionalLocal = num(prop.getCell("D10").value);
    parametros.minimoMaoDeObra = num(prop.getCell("D11").value);
    prop.eachRow((row) => {
      if (texto(row.getCell(5).value)?.toLowerCase() === "investimento total") totalPropostaPlanilha = num(row.getCell(6).value);
    });
    if (parametros.impostos === 0) avisos.push("A planilha está com imposto 0%. Ajuste a alíquota nos parâmetros (padrão da empresa: Simples, entre 9% e 12%).");
  } else {
    avisos.push('Aba "PROPOSTA" não encontrada: parâmetros da empresa aplicados.');
    Object.assign(parametros, { formaImposto: PARAMETROS_PADRAO.formaImposto, arredondamento: PARAMETROS_PADRAO.arredondamento });
  }
  return { parametros, etapas, totalVendaPlanilha, totalPropostaPlanilha, avisos };
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Nomes do Orçamento Padrão → nomes da EAP padrão do sistema (de-para do diagnóstico, ponto O-9). */
const SINONIMOS: Record<string, string> = {
  "servicos preliminares": "servicos iniciais",
  "reforco estrutura": "estrutura",
  "reforco estrutural": "estrutura",
  "cobertura funilaria": "cobertura",
  "instalacoes eletricas logicas": "instalacoes eletricas",
  "instalacao de ar condicionado": "instalacao de ar condicionado",
  "instalacoes de ar condicionado": "instalacao de ar condicionado",
  "alugueis de equipamentos": "aluguel de equipamentos",
  "instalacoes hidraulicas gas": "instalacoes hidraulicas gas",
};

export function chaveEtapa(nome: string): string {
  const n = normalizar(nome);
  return SINONIMOS[n] ?? n;
}

/**
 * Leitura do XML da NF-e (modelo 55) — layout nacional (nfeProc/NFe/infNFe).
 * Só extrai dados para conferência e preenchimento; o usuário confirma antes de gravar.
 */
import { XMLParser } from "fast-xml-parser";

export interface DadosNFe {
  chave: string;
  numero: string;
  serie: string;
  emissao: string;
  emitente: { documento: string; nome: string; fantasia: string | null };
  destinatario: { documento: string | null; nome: string | null };
  valorTotal: number;
  duplicatas: { numero: string; vencimento: string; valor: number }[];
  itens: { descricao: string; quantidade: number; unidade: string; valor: number }[];
}

const lista = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const txt = (v: unknown) => (v == null ? "" : String(v).trim());

export function lerNFe(xml: string): DadosNFe {
  if (xml.length > 5_000_000) throw new Error("XML muito grande");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true, parseTagValue: false, processEntities: false });
  let doc: Record<string, unknown>;
  try { doc = parser.parse(xml); } catch { throw new Error("XML inválido"); }
  const nfe = ((doc.nfeProc as Record<string, unknown>)?.NFe ?? doc.NFe) as Record<string, unknown> | undefined;
  const inf = nfe?.infNFe as Record<string, any> | undefined;
  if (!inf) throw new Error("O arquivo não é um XML de NF-e (infNFe não encontrado)");
  const chave = txt(inf["@Id"]).replace(/^NFe/, "") || txt((doc.nfeProc as any)?.protNFe?.infProt?.chNFe);
  if (!/^\d{44}$/.test(chave)) throw new Error("Chave de acesso inválida no XML");
  const ide = inf.ide ?? {};
  const emit = inf.emit ?? {};
  const dest = inf.dest ?? {};
  const total = Number(txt(inf.total?.ICMSTot?.vNF));
  if (!Number.isFinite(total) || total <= 0) throw new Error("Valor total (vNF) não encontrado");
  const emissao = txt(ide.dhEmi || ide.dEmi).slice(0, 10);
  return {
    chave,
    numero: txt(ide.nNF).replace(/^0+(?=\d)/, ""),
    serie: txt(ide.serie) || "1",
    emissao,
    emitente: { documento: txt(emit.CNPJ || emit.CPF), nome: txt(emit.xNome), fantasia: txt(emit.xFant) || null },
    destinatario: { documento: txt(dest.CNPJ || dest.CPF) || null, nome: txt(dest.xNome) || null },
    valorTotal: Math.round(total * 100) / 100,
    duplicatas: lista(inf.cobr?.dup).map((d: any) => ({ numero: txt(d.nDup), vencimento: txt(d.dVenc).slice(0, 10), valor: Number(txt(d.vDup)) })),
    itens: lista(inf.det).map((d: any) => ({ descricao: txt(d.prod?.xProd), quantidade: Number(txt(d.prod?.qCom)), unidade: txt(d.prod?.uCom), valor: Number(txt(d.prod?.vProd)) })),
  };
}

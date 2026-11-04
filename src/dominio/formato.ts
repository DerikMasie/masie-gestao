const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moedaCompacta = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Moeda em pt-BR. O sinal negativo usa o caractere de menos (U+2212) colado ao valor, para não quebrar linha no "-". */
export const formatarMoeda = (v: number | string | null | undefined) => (v == null || v === "" ? "—" : moeda.format(Number(v)).replace(/^-\s?/, "\u2212").replace(/\s/g, "\u00a0"));
export const formatarMoedaCompacta = (v: number) => moedaCompacta.format(v);
export const formatarPercentual = (v: number | string | null | undefined) => (v == null || v === "" ? "—" : pct.format(Number(v)));

export function formatarData(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  if (iso instanceof Date) return iso.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Converte texto digitado em número: aceita "1.234,56", "1234,56", "1234.56", "R$ 1.234,56", "20%".
 * Retorna null para vazio e NaN para inválido.
 */
export function lerNumero(texto: string | null | undefined): number | null {
  if (texto == null) return null;
  let t = String(texto).trim().replace(/[R$\s%]/g, "");
  if (t === "") return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

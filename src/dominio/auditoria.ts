/** Cálculo do que mudou entre duas versões de um registro, para a trilha de auditoria. */

/** Campos nunca gravados na auditoria (segredos) ou irrelevantes (carimbos automáticos). */
const CAMPOS_OCULTOS = new Set(["senhaHash", "dadosBancariosCifrado", "atualizadoEm", "criadoEm"]);

type Registro = Record<string, unknown>;

function normalizar(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (v === undefined || v === "") return null;
  return v;
}

export function limparParaAuditoria(r: Registro | null | undefined): Registro | null {
  if (!r) return null;
  const saida: Registro = {};
  for (const [k, v] of Object.entries(r)) {
    if (CAMPOS_OCULTOS.has(k)) {
      if (k === "dadosBancariosCifrado" && v) saida.dadosBancarios = "[protegido]";
      continue;
    }
    saida[k] = normalizar(v);
  }
  return saida;
}

/** Retorna apenas os campos alterados: { antes: {...}, depois: {...} }, ou null se nada mudou. */
export function diferencas(antes: Registro, depois: Registro): { antes: Registro; depois: Registro } | null {
  const a = limparParaAuditoria(antes) ?? {};
  const d = limparParaAuditoria(depois) ?? {};
  const campos = new Set([...Object.keys(a), ...Object.keys(d)]);
  const ra: Registro = {};
  const rd: Registro = {};
  for (const c of campos) {
    if (!(c in d)) continue; // campo não enviado na atualização
    if (JSON.stringify(a[c] ?? null) !== JSON.stringify(d[c] ?? null)) {
      ra[c] = a[c] ?? null;
      rd[c] = d[c] ?? null;
    }
  }
  if (antes.dadosBancariosCifrado !== depois.dadosBancariosCifrado && "dadosBancariosCifrado" in depois) {
    ra.dadosBancarios = "[protegido]";
    rd.dadosBancarios = "[alterado]";
  }
  return Object.keys(rd).length ? { antes: ra, depois: rd } : null;
}

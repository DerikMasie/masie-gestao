/**
 * Motor de cálculo do orçamento — reproduz o "Orçamento Padrão Masie.xlsx" (regras O1–O4 do diagnóstico).
 *
 *  O1  Custo de MO     = qtd × MO unitária × (1 + adicional de horário + adicional de local), com valor mínimo de MO
 *  O2  Custo material  = qtd × material unitário × quebra (fator de perda; 1 = sem perda)
 *  O3  Venda sem imposto = MO × (1 + BDI MO) + material × (1 + BDI material)
 *  O4  Imposto: "por dentro" (padrão) → total = venda ÷ (1 − alíquota); "por fora" (planilha) → total = venda × (1 + alíquota)
 *
 * Decisões do cliente (03/11/2026): BDI MO 30%, BDI material 10% (editáveis por orçamento e por item);
 * imposto do Simples (anexos III/IV) entre 9% e 12% — padrão 10,5%, editável por orçamento.
 *
 * Arredondamento: "CENTAVOS" (padrão do sistema) ou "REAL_ACIMA", que reproduz a planilha (ARRED.CIMA por linha)
 * e serve para conferir orçamentos importados.
 */

export type FormaImposto = "POR_DENTRO" | "POR_FORA";
export type Arredondamento = "CENTAVOS" | "REAL_ACIMA";

export interface ParametrosOrcamento {
  /** BDI/margem sobre o custo de mão de obra (0.30 = 30%). */
  bdiMaoDeObra: number;
  /** BDI/margem (gerenciamento) sobre o custo de material (0.10 = 10%). */
  bdiMaterial: number;
  /** Alíquota de impostos sobre o faturamento (0.105 = 10,5%). */
  impostos: number;
  formaImposto: FormaImposto;
  /** Adicional de MO por horário de trabalho (noturno/fim de semana). */
  adicionalHorario: number;
  /** Adicional de MO por local da obra (distância/acesso). */
  adicionalLocal: number;
  /** Valor mínimo de MO por item (R$); 0 = sem mínimo. */
  minimoMaoDeObra: number;
  arredondamento: Arredondamento;
}

export const PARAMETROS_PADRAO: ParametrosOrcamento = {
  bdiMaoDeObra: 0.3,
  bdiMaterial: 0.1,
  impostos: 0.105,
  formaImposto: "POR_DENTRO",
  adicionalHorario: 0,
  adicionalLocal: 0,
  minimoMaoDeObra: 0,
  arredondamento: "CENTAVOS",
};

/** Aceita parâmetros salvos em versões anteriores (campos antigos) e completa o que faltar. */
export function normalizarParametros(bruto: unknown): ParametrosOrcamento {
  const p = (bruto ?? {}) as Record<string, unknown>;
  if (!("bdiMaoDeObra" in p)) return { ...PARAMETROS_PADRAO };
  const num = (k: keyof ParametrosOrcamento) => (typeof p[k] === "number" && Number.isFinite(p[k]) ? (p[k] as number) : (PARAMETROS_PADRAO[k] as number));
  return {
    bdiMaoDeObra: num("bdiMaoDeObra"), bdiMaterial: num("bdiMaterial"), impostos: num("impostos"),
    formaImposto: p.formaImposto === "POR_FORA" ? "POR_FORA" : "POR_DENTRO",
    adicionalHorario: num("adicionalHorario"), adicionalLocal: num("adicionalLocal"), minimoMaoDeObra: num("minimoMaoDeObra"),
    arredondamento: p.arredondamento === "REAL_ACIMA" ? "REAL_ACIMA" : "CENTAVOS",
  };
}

export function validarParametros(p: ParametrosOrcamento): string | null {
  if (p.impostos < 0 || p.impostos >= 0.6) return "Alíquota de impostos deve estar entre 0% e 60%";
  for (const [k, v] of [["BDI de mão de obra", p.bdiMaoDeObra], ["BDI de material", p.bdiMaterial], ["Adicional de horário", p.adicionalHorario], ["Adicional de local", p.adicionalLocal]] as const) {
    if (v < 0 || v > 10) return `${k} deve estar entre 0% e 1000%`;
  }
  if (p.minimoMaoDeObra < 0) return "Valor mínimo de MO não pode ser negativo";
  return null;
}

export function arredondar(valor: number, casas = 2): number {
  const f = 10 ** casas;
  return Math.round((valor + Math.sign(valor) * Number.EPSILON) * f) / f;
}

/** ARRED.CIMA para inteiro, tolerando ruído de ponto flutuante (ex.: 291,50000000001). */
function arredondarParaCima(v: number): number {
  return Math.ceil(arredondar(v, 6));
}

const arred = (modo: Arredondamento) => (v: number) => (modo === "REAL_ACIMA" ? arredondarParaCima(v) : arredondar(v));

export interface EntradaItem {
  quantidade: number;
  /** Fator de perda (1 = sem perda; 1,05 = 5% de quebra). */
  quebra: number;
  custoUnitarioMaoDeObra: number;
  custoUnitarioMaterial: number;
  /** BDI específico do item; nulo = usa o do orçamento. */
  bdiMaoDeObra?: number | null;
  bdiMaterial?: number | null;
}

export interface ResultadoItem {
  custoMaoDeObra: number;
  custoMaterial: number;
  custo: number;
  vendaMaoDeObra: number;
  vendaMaterial: number;
  venda: number;
  /** Verdadeiro quando o valor mínimo de MO foi aplicado. */
  minimoAplicado: boolean;
}

export function calcularItem(i: EntradaItem, p: ParametrosOrcamento): ResultadoItem {
  const r = arred(p.arredondamento);
  const fatorAdicional = 1 + p.adicionalHorario + p.adicionalLocal;
  const bruto = i.quantidade * i.custoUnitarioMaoDeObra;
  const minimoAplicado = p.minimoMaoDeObra > 0 && bruto > 0 && bruto < p.minimoMaoDeObra;
  let custoMaoDeObra: number;
  if (p.arredondamento === "REAL_ACIMA") {
    // Fiel à planilha: o mínimo substitui o cálculo SEM os adicionais (ponto O-2 do diagnóstico).
    custoMaoDeObra = minimoAplicado ? arredondarParaCima(p.minimoMaoDeObra) : arredondarParaCima(arredondarParaCima(bruto) * fatorAdicional);
  } else {
    // Correção: os adicionais incidem também sobre o mínimo.
    custoMaoDeObra = r((minimoAplicado ? p.minimoMaoDeObra : bruto) * fatorAdicional);
  }
  const custoMaterial = r(i.quantidade * i.custoUnitarioMaterial * (i.quebra || 1));
  const vendaMaoDeObra = r(custoMaoDeObra * (1 + (i.bdiMaoDeObra ?? p.bdiMaoDeObra)));
  const vendaMaterial = r(custoMaterial * (1 + (i.bdiMaterial ?? p.bdiMaterial)));
  return {
    custoMaoDeObra, custoMaterial, custo: arredondar(custoMaoDeObra + custoMaterial),
    vendaMaoDeObra, vendaMaterial, venda: arredondar(vendaMaoDeObra + vendaMaterial), minimoAplicado,
  };
}

export interface TotaisOrcamento {
  custoMaoDeObra: number;
  custoMaterial: number;
  custo: number;
  vendaMaoDeObra: number;
  vendaMaterial: number;
  /** Venda sem imposto (soma dos itens). */
  venda: number;
  imposto: number;
  /** Valor total da proposta (com imposto). */
  total: number;
  /** Lucro bruto = venda sem imposto − custo. */
  lucro: number;
  /** Lucro ÷ total da proposta. */
  margem: number;
  /** Markup efetivo = total ÷ custo. */
  markup: number;
}

const soma = (xs: number[]) => arredondar(xs.reduce((a, b) => a + b, 0));

export function totalizar(resultados: ResultadoItem[], p: ParametrosOrcamento): TotaisOrcamento {
  const venda = soma(resultados.map((x) => x.venda));
  const custo = soma(resultados.map((x) => x.custo));
  let imposto: number;
  let total: number;
  if (p.formaImposto === "POR_DENTRO") {
    total = arredondar(venda / (1 - p.impostos));
    imposto = arredondar(total - venda);
  } else {
    imposto = arred(p.arredondamento)(venda * p.impostos);
    total = arredondar(venda + imposto);
  }
  const lucro = arredondar(venda - custo);
  return {
    custoMaoDeObra: soma(resultados.map((x) => x.custoMaoDeObra)),
    custoMaterial: soma(resultados.map((x) => x.custoMaterial)),
    custo,
    vendaMaoDeObra: soma(resultados.map((x) => x.vendaMaoDeObra)),
    vendaMaterial: soma(resultados.map((x) => x.vendaMaterial)),
    venda, imposto, total, lucro,
    margem: total > 0 ? lucro / total : 0,
    markup: custo > 0 ? total / custo : 0,
  };
}

/** Imposto efetivamente pago sobre o total ÷ ... — útil para comparar as duas formas de cálculo. */
export function compararFormasImposto(venda: number, aliquota: number) {
  const dentro = venda / (1 - aliquota);
  const fora = venda * (1 + aliquota);
  return { porDentro: arredondar(dentro), porFora: arredondar(fora), diferenca: arredondar(dentro - fora) };
}

export type ClasseABC = "A" | "B" | "C";

/** Curva ABC: ordena por valor decrescente; A até 80% acumulado, B até 95%, C o restante. */
export function curvaABC<T>(itens: T[], valor: (i: T) => number, limites = { a: 0.8, b: 0.95 }) {
  const comValor = itens.map((i) => ({ item: i, valor: valor(i) })).filter((x) => x.valor > 0).sort((x, y) => y.valor - x.valor);
  const total = comValor.reduce((t, x) => t + x.valor, 0);
  let acumulado = 0;
  return comValor.map((x, i) => {
    acumulado += x.valor;
    const pAcum = total ? acumulado / total : 0;
    // Regra da planilha (aba ABC): classe pelo % acumulado incluindo o item (≤ 80% A, ≤ 95% B).
    // Exceção: o maior item é sempre "A", mesmo que sozinho passe de 80%.
    const classe: ClasseABC = i === 0 || pAcum <= limites.a + 1e-9 ? "A" : pAcum <= limites.b + 1e-9 ? "B" : "C";
    return { ...x, percentual: total ? x.valor / total : 0, acumulado: pAcum, classe };
  });
}

/** Código hierárquico do item: etapa.grupo.item (ex.: 1.1.3) ou etapa.item (ex.: 2.4). */
export function codigosItens<T extends { etapaOrdem: number; grupo: string | null }>(itens: T[]): (T & { codigo: string })[] {
  const grupos = new Map<string, number>();
  const contadores = new Map<string, number>();
  return itens.map((i) => {
    let chave = `${i.etapaOrdem}`;
    let prefixo = `${i.etapaOrdem}`;
    if (i.grupo) {
      const gk = `${i.etapaOrdem}|${i.grupo.trim().toLowerCase()}`;
      if (!grupos.has(gk)) grupos.set(gk, [...grupos.keys()].filter((k) => k.startsWith(`${i.etapaOrdem}|`)).length + 1);
      prefixo = `${i.etapaOrdem}.${grupos.get(gk)}`;
      chave = gk;
    }
    const n = (contadores.get(chave) ?? 0) + 1;
    contadores.set(chave, n);
    return { ...i, codigo: `${prefixo}.${n}` };
  });
}

/**
 * Importação do histórico do "Financeiro 2026.xlsm" (decisão D13).
 * Lê: Aux.Listas (plano de contas), Aux.Bancos (contas), Centros de Custo, Fluxo De Caixa (razão) e Contas a Pagar.
 * Não importa abas derivadas/manuais (Provisão, Faturamento, gráficos) — elas passam a ser geradas pelo sistema.
 * Aplica as reclassificações D12 e gera um relatório de pendências (sem subitem, valor em texto, sem centro…).
 */
import { and, eq, sql } from "drizzle-orm";
import type { BancoDados } from "@/db";
import { centroCusto, contaFinanceira, fornecedor, importacao, lancamento, obra, obraEtapa, planoConta, titulo, tituloParcela } from "@/db/schema";
import { naturezaDoTipoPlanilha, RECLASSIFICACOES, resultado, type Natureza } from "@/dominio/financeiro";
import { PLANO_CONTAS_PADRAO } from "@/dominio/plano-contas-padrao";
import { sha256 } from "@/lib/cripto";
import { abrirPlanilha, dataIso, numero, texto } from "@/lib/planilha";
import { registrarAuditoria } from "./auditoria";
import { type Contexto, ErroNegocio } from "./contexto";
import { garantirPlanoPadrao } from "./financeiro";

export interface RelatorioImportacaoFinanceiro {
  importacaoId: string;
  lancamentos: number;
  periodo: { de: string | null; ate: string | null };
  contasCriadas: number;
  centrosCriados: number;
  centrosVinculadosAObras: number;
  contasAPagar: number;
  porAno: { ano: string; receitas: number; custos: number; despesas: number; impostos: number; resultadoOperacional: number; foraDoResultado: number }[];
  reclassificados: { subitem: string; para: string; quantidade: number; valor: number }[];
  pendencias: { tipo: string; quantidade: number; exemplos: string[] }[];
}

const nn = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function importarFinanceiro(banco: BancoDados, ctx: Contexto, arquivo: Buffer, nomeArquivo: string): Promise<RelatorioImportacaoFinanceiro> {
  const hash = sha256(arquivo);
  const [ja] = await banco.select({ id: importacao.id }).from(importacao)
    .where(and(eq(importacao.empresaId, ctx.empresaId), eq(importacao.sha256, hash), sql`${importacao.desfeitaEm} is null`));
  if (ja) throw new ErroNegocio("Este arquivo já foi importado. Desfaça a importação anterior se quiser importar de novo.");

  let wb;
  try { wb = await abrirPlanilha(arquivo); } catch { throw new ErroNegocio("Não foi possível ler o arquivo. Envie o Financeiro em .xlsm ou .xlsx."); }
  const aba = (nome: string) => wb.worksheets.find((w) => nn(w.name) === nn(nome));
  const fluxo = aba("Fluxo De Caixa");
  if (!fluxo) throw new ErroNegocio('Aba "Fluxo De Caixa" não encontrada: o arquivo não está no formato do Financeiro.');

  // Mapa ItemReferencia (código da planilha) → grupo/natureza
  const grupos = new Map<string, { grupo: string; natureza: Natureza }>();
  for (const g of PLANO_CONTAS_PADRAO) grupos.set(nn(g.codigoPlanilha), { grupo: g.grupo, natureza: g.natureza });
  const listas = aba("Aux.Listas");
  if (listas) {
    for (let r = 5; r < 60; r++) {
      const cod = texto(listas.getRow(r).getCell(2).value);
      const tipo = texto(listas.getRow(r).getCell(3).value);
      if (!cod) break;
      if (!grupos.has(nn(cod))) grupos.set(nn(cod), { grupo: cod.replace(/_/g, " "), natureza: naturezaDoTipoPlanilha(tipo ?? "") });
    }
  }

  const pend = new Map<string, string[]>();
  const pendencia = (tipo: string, exemplo: string) => { const l = pend.get(tipo) ?? []; l.push(exemplo); pend.set(tipo, l); };

  return banco.transaction(async (tx) => {
    await garantirPlanoPadrao(tx, ctx.empresaId);
    const [imp] = await tx.insert(importacao).values({ empresaId: ctx.empresaId, tipo: "FINANCEIRO_XLSM", arquivo: nomeArquivo.slice(0, 200), sha256: hash, resumo: {}, criadoPor: ctx.usuarioId }).returning();

    // ── Plano de contas (cache) ──
    const planos = new Map<string, string>();
    for (const p of await tx.select().from(planoConta).where(eq(planoConta.empresaId, ctx.empresaId))) planos.set(`${nn(p.grupo)}|${nn(p.subitem)}`, p.id);
    const reclass = new Map<string, { quantidade: number; valor: number; para: string }>();
    async function plano(itemRef: string, subitemBruto: string | null): Promise<string> {
      const g = grupos.get(nn(itemRef)) ?? { grupo: itemRef.replace(/_/g, " "), natureza: "DESPESA" as Natureza };
      const subitem = subitemBruto ?? "Não especificado";
      const r = RECLASSIFICACOES.find((x) => nn(x.grupoOrigem) === nn(g.grupo) && nn(x.subitem) === nn(subitem));
      const grupo = r?.grupo ?? g.grupo;
      const natureza = r?.natureza ?? g.natureza;
      const k = `${nn(grupo)}|${nn(subitem)}`;
      let id = planos.get(k);
      if (!id) {
        const [n] = await tx.insert(planoConta).values({ empresaId: ctx.empresaId, grupo, subitem, natureza }).onConflictDoNothing().returning();
        id = n?.id ?? (await tx.select({ id: planoConta.id }).from(planoConta).where(and(eq(planoConta.empresaId, ctx.empresaId), sql`lower(${planoConta.grupo}) = lower(${grupo})`, sql`lower(${planoConta.subitem}) = lower(${subitem})`)))[0]!.id;
        planos.set(k, id);
      }
      return id;
    }
    const naturezaDe = new Map((await tx.select({ id: planoConta.id, n: planoConta.natureza }).from(planoConta).where(eq(planoConta.empresaId, ctx.empresaId))).map((p) => [p.id, p.n]));

    // ── Contas financeiras ──
    const contas = new Map<string, string>();
    for (const c of await tx.select().from(contaFinanceira).where(eq(contaFinanceira.empresaId, ctx.empresaId))) contas.set(nn(c.nome), c.id);
    let contasCriadas = 0;
    async function conta(nomeBruto: string | null) {
      const nome = nomeBruto ?? "Não informada";
      const k = nn(nome);
      if (!contas.has(k)) {
        const tipo = /caixa/i.test(nome) ? "CAIXA" : /cart[aã]o/i.test(nome) ? "CARTAO" : /rdc|aplica|cdb|poupan/i.test(nome) ? "APLICACAO" : "BANCO";
        const [c] = await tx.insert(contaFinanceira).values({ empresaId: ctx.empresaId, nome, tipo, contaDeSocio: /\bPF\b/i.test(nome) || /^caixa\s+\S+/i.test(nome) && !/f[ií]sico/i.test(nome) }).returning();
        contas.set(k, c!.id); contasCriadas++;
        if (nome === "Não informada") pendencia("Lançamentos sem banco (conta \"Não informada\")", "");
      }
      return contas.get(k)!;
    }
    const auxBancos = aba("Aux.Bancos");
    if (auxBancos) for (let r = 5; r < 60; r++) { const n = texto(auxBancos.getRow(r).getCell(2).value); if (!n) break; await conta(n); }

    // ── Centros de custo ──
    const centros = new Map<string, string>(); // rótulo normalizado → id
    let centrosCriados = 0;
    let vinculados = 0;
    const obras = await tx.select({ id: obra.id, codigo: obra.codigo }).from(obra).where(eq(obra.empresaId, ctx.empresaId));
    for (const c of await tx.select().from(centroCusto).where(eq(centroCusto.empresaId, ctx.empresaId))) {
      centros.set(nn(c.rotuloOrigem ?? `${c.codigo} - ${c.nome}`), c.id);
    }
    const abaCC = aba("Centros de Custo");
    if (abaCC) {
      for (let r = 20; r <= abaCC.rowCount; r++) {
        const row = abaCC.getRow(r);
        const nContrato = texto(row.getCell(3).value);
        const nome = texto(row.getCell(4).value);
        if (!nContrato && !nome) continue;
        const rotulo = texto(row.getCell(8).value) ?? `${nContrato} - ${nome}`;
        if (centros.has(nn(rotulo))) continue;
        const tipoTxt = nn(texto(row.getCell(5).value) ?? "obra");
        const tipo = tipoTxt.startsWith("intern") ? "ADMINISTRATIVO" : tipoTxt.startsWith("consult") ? "CONSULTORIA" : tipoTxt.startsWith("projet") ? "PROJETO" : "OBRA";
        const ob = nContrato && /^\d{4}-\d{4}$/.test(nContrato) ? obras.find((o) => o.codigo === nContrato) : undefined;
        if (ob) {
          const [cc] = await tx.update(centroCusto).set({ rotuloOrigem: rotulo }).where(eq(centroCusto.obraId, ob.id)).returning();
          centros.set(nn(rotulo), cc!.id); vinculados++;
          continue;
        }
        const codigo = nContrato && /^\d{4}-\d{4}$/.test(nContrato) ? `HIST-${nContrato}` : `HIST-${String(nContrato ?? r).padStart(4, "0")}`;
        const [cc] = await tx.insert(centroCusto).values({
          empresaId: ctx.empresaId, codigo, nome: nome ?? rotulo, tipo, rotuloOrigem: rotulo,
          valorContrato: numero(row.getCell(6).value)?.toFixed(2) ?? null, valorAditivos: numero(row.getCell(7).value)?.toFixed(2) ?? null,
        }).onConflictDoNothing().returning();
        if (cc) { centros.set(nn(rotulo), cc.id); centrosCriados++; }
        else { const [ex] = await tx.select().from(centroCusto).where(and(eq(centroCusto.empresaId, ctx.empresaId), eq(centroCusto.codigo, codigo))); centros.set(nn(rotulo), ex!.id); }
      }
    }
    async function centro(rotulo: string | null) {
      if (!rotulo) {
        pendencia("Lançamentos sem centro de custo (lançados em \"SEM-CC\")", "");
        rotulo = "SEM-CC - Não classificado";
      }
      const k = nn(rotulo);
      if (!centros.has(k)) {
        const codigo = rotulo === "SEM-CC - Não classificado" ? "SEM-CC" : `HIST-X${centros.size + 1}`;
        const [cc] = await tx.insert(centroCusto).values({ empresaId: ctx.empresaId, codigo, nome: rotulo, tipo: "ADMINISTRATIVO", rotuloOrigem: rotulo }).onConflictDoNothing().returning();
        const id = cc?.id ?? (await tx.select().from(centroCusto).where(and(eq(centroCusto.empresaId, ctx.empresaId), eq(centroCusto.codigo, codigo))))[0]!.id;
        centros.set(k, id);
        if (cc && codigo !== "SEM-CC") { centrosCriados++; pendencia("Centros de custo usados no fluxo mas não cadastrados (criados)", rotulo); }
      }
      return centros.get(k)!;
    }

    // ── Fluxo de caixa ──
    let inicio = 28;
    for (let r = 1; r < 60; r++) if (nn(texto(fluxo.getRow(r).getCell(4).value) ?? "") === "data caixa") { inicio = r + 1; break; }
    const linhas: (typeof lancamento.$inferInsert)[] = [];
    const movs: { data: string; natureza: Natureza; valor: number }[] = [];
    for (let r = inicio; r <= fluxo.rowCount; r++) {
      const row = fluxo.getRow(r);
      const data = dataIso(row.getCell(4).value);
      const itemRef = texto(row.getCell(5).value);
      const cred = numero(row.getCell(10).value);
      const deb = numero(row.getCell(11).value);
      if (!data && !itemRef && cred == null && deb == null) continue;
      const credTxt = texto(row.getCell(10).value); const debTxt = texto(row.getCell(11).value);
      if ((credTxt && typeof (row.getCell(10).value) === "string") || (debTxt && typeof (row.getCell(11).value) === "string")) pendencia("Valores digitados como texto (convertidos)", `linha ${r}`);
      if (!data) { pendencia("Linhas sem data válida (ignoradas)", `linha ${r}`); continue; }
      if (!itemRef) { pendencia("Linhas sem ItemReferencia (ignoradas)", `linha ${r}`); continue; }
      const valor = (cred ?? 0) - (deb ?? 0);
      if (valor === 0) { pendencia("Linhas sem valor (ignoradas)", `linha ${r}`); continue; }
      const sub = texto(row.getCell(6).value);
      if (!sub) pendencia("Lançamentos sem SubItem (classificados como \"Não especificado\")", `linha ${r}`);
      const planoId = await plano(itemRef, sub);
      const natureza = naturezaDe.get(planoId) ?? (await tx.select({ n: planoConta.natureza }).from(planoConta).where(eq(planoConta.id, planoId)))[0]!.n;
      naturezaDe.set(planoId, natureza);
      const g = grupos.get(nn(itemRef));
      const rc = RECLASSIFICACOES.find((x) => g && nn(x.grupoOrigem) === nn(g.grupo) && nn(x.subitem) === nn(sub ?? ""));
      if (rc) { const k = `${sub}`; const v = reclass.get(k) ?? { quantidade: 0, valor: 0, para: rc.grupo }; v.quantidade++; v.valor += valor; reclass.set(k, v); }
      if (nn(itemRef).startsWith("receitas financeiras") && nn(sub ?? "") === "aplicacoes financeiras" && valor > 0) pendencia("Resgates de aplicação: confirmar se não há aplicações (saídas) sem lançamento (ponto F-2)", `linha ${r}`);
      if (nn(itemRef) === "impostos" && nn(sub ?? "") === "pro labore") pendencia("\"Pró-Labore\" classificado em Impostos: confirmar se é o INSS do pró-labore (ponto F-3)", `linha ${r}`);
      linhas.push({
        empresaId: ctx.empresaId, data, contaId: await conta(texto(row.getCell(9).value)), centroCustoId: await centro(texto(row.getCell(7).value)),
        planoContaId: planoId, valor: valor.toFixed(2), descricao: texto(row.getCell(8).value)?.slice(0, 500) ?? null,
        observacao: texto(row.getCell(12).value)?.slice(0, 500) ?? null, importacaoId: imp!.id, criadoPor: ctx.usuarioId,
      });
      movs.push({ data, natureza, valor });
    }
    for (let k = 0; k < linhas.length; k += 1000) await tx.insert(lancamento).values(linhas.slice(k, k + 1000));

    // ── Contas a pagar em aberto ──
    let contasAPagar = 0;
    const cap = aba("Contas a Pagar");
    if (cap) {
      const grupos2 = new Map<string, { linhas: { parcela: number; valor: number; vencimento: string; programado: boolean }[]; nf: string; empresa: string; emissao: string; total: number; item: string; sub: string | null; cc: string | null }>();
      for (let r = 7; r <= cap.rowCount; r++) {
        const row = cap.getRow(r);
        const nf = texto(row.getCell(2).value); const empresa = texto(row.getCell(4).value);
        const valorParcela = numero(row.getCell(9).value); const venc = dataIso(row.getCell(10).value);
        if (!empresa || !valorParcela || !venc) continue;
        const k = `${nf}|${empresa}`;
        const g = grupos2.get(k) ?? { linhas: [], nf: nf ?? "s/n", empresa, emissao: dataIso(row.getCell(3).value) ?? venc, total: numero(row.getCell(6).value) ?? 0, item: texto(row.getCell(11).value) ?? "Custos_de_material", sub: texto(row.getCell(12).value), cc: texto(row.getCell(13).value) };
        g.linhas.push({ parcela: numero(row.getCell(8).value) ?? g.linhas.length + 1, valor: valorParcela, vencimento: venc, programado: nn(texto(row.getCell(14).value) ?? "") === "sim" });
        grupos2.set(k, g);
      }
      for (const g of grupos2.values()) {
        let [f] = await tx.select().from(fornecedor).where(and(eq(fornecedor.empresaId, ctx.empresaId), sql`lower(${fornecedor.nome}) = lower(${g.empresa})`, sql`${fornecedor.excluidoEm} is null`));
        if (!f) [f] = await tx.insert(fornecedor).values({ empresaId: ctx.empresaId, nome: g.empresa, tipoPessoa: "PJ" }).returning();
        const [t] = await tx.insert(titulo).values({
          empresaId: ctx.empresaId, tipo: "PAGAR", fornecedorId: f!.id, centroCustoId: await centro(g.cc), planoContaId: await plano(g.item, g.sub),
          descricao: `NF ${g.nf} · ${g.empresa}`, documento: `NF ${g.nf}`, emissao: g.emissao,
          valorTotal: (g.total || g.linhas.reduce((s, l) => s + l.valor, 0)).toFixed(2), importacaoId: imp!.id, criadoPor: ctx.usuarioId,
        }).returning();
        const usados = new Set<number>();
        await tx.insert(tituloParcela).values(g.linhas.map((l, i) => {
          let n = l.parcela; while (usados.has(n)) n = Math.max(...usados) + 1; usados.add(n);
          return { tituloId: t!.id, numero: n || i + 1, vencimento: l.vencimento, valor: l.valor.toFixed(2), programado: l.programado };
        }));
        contasAPagar++;
      }
    }

    const anos = [...new Set(movs.map((m) => m.data.slice(0, 4)))].sort();
    const porAno = anos.map((ano) => {
      const r = resultado(movs.filter((m) => m.data.startsWith(ano)));
      return { ano, receitas: r.receitas, custos: r.custos, despesas: r.despesas, impostos: r.impostos, resultadoOperacional: r.resultadoOperacional, foraDoResultado: r.foraDoResultado.financiamento + r.foraDoResultado.investimento + r.foraDoResultado.ajuste };
    });
    const datas = movs.map((m) => m.data).sort();
    const rel: RelatorioImportacaoFinanceiro = {
      importacaoId: imp!.id, lancamentos: linhas.length, periodo: { de: datas[0] ?? null, ate: datas.at(-1) ?? null },
      contasCriadas, centrosCriados, centrosVinculadosAObras: vinculados, contasAPagar, porAno,
      reclassificados: [...reclass.entries()].map(([subitem, v]) => ({ subitem, para: v.para, quantidade: v.quantidade, valor: Math.round(v.valor * 100) / 100 })),
      pendencias: [...pend.entries()].map(([tipo, ex]) => ({ tipo, quantidade: ex.length, exemplos: ex.filter(Boolean).slice(0, 8) })),
    };
    await tx.update(importacao).set({ resumo: rel }).where(eq(importacao.id, imp!.id));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "importacao", entidadeId: imp!.id, descricao: `Histórico financeiro importado de ${nomeArquivo}: ${linhas.length} lançamentos`, ip: ctx.ip });
    return rel;
  }, { isolationLevel: "read committed" });
}

/** Desfaz uma importação: remove lançamentos e títulos importados (cadastros criados permanecem). */
export async function desfazerImportacao(banco: BancoDados, ctx: Contexto, id: string) {
  return banco.transaction(async (tx) => {
    const [imp] = await tx.select().from(importacao).where(and(eq(importacao.id, id), eq(importacao.empresaId, ctx.empresaId)));
    if (!imp || imp.desfeitaEm) throw new ErroNegocio("Importação não encontrada ou já desfeita");
    const r1 = await tx.delete(lancamento).where(eq(lancamento.importacaoId, id)).returning({ id: lancamento.id });
    await tx.delete(titulo).where(eq(titulo.importacaoId, id));
    await tx.update(importacao).set({ desfeitaEm: new Date() }).where(eq(importacao.id, id));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EXCLUIR", entidade: "importacao", entidadeId: id, descricao: `Importação de ${imp.arquivo} desfeita (${r1.length} lançamentos removidos)`, ip: ctx.ip });
    return r1.length;
  });
}

export async function listarImportacoes(banco: BancoDados, empresaId: string) {
  return banco.select().from(importacao).where(eq(importacao.empresaId, empresaId)).orderBy(sql`${importacao.criadoEm} desc`);
}


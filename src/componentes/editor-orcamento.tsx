"use client";

import clsx from "clsx";
import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { calcularItem, codigosItens, totalizar, type ParametrosOrcamento } from "@/dominio/orcamento";
import { formatarMoeda, formatarPercentual, lerNumero } from "@/dominio/formato";
import type { EstadoForm } from "@/lib/acoes";

export interface LinhaOrcamento {
  id: string; etapaId: string; grupo: string | null; descricao: string; unidade: string | null; quantidade: number;
  memoriaCalculo: string | null; quebra: number; custoUnitarioMaoDeObra: number; custoUnitarioMaterial: number;
  bdiMaoDeObra: number | null; bdiMaterial: number | null; observacao: string | null;
}
export interface EtapaOrcamento { id: string; ordem: number; nome: string }

type Texto = { descricao: string; unidade: string; quantidade: string; quebra: string; mo: string; mat: string; grupo: string; memoria: string; bdiMo: string; bdiMat: string; observacao: string; etapaId: string };
type Estado = { linha: LinhaOrcamento; txt: Texto; sujo: boolean; salvando: boolean; erro?: string };

const numTxt = (v: number | null | undefined, casas = 4) => (v == null ? "" : String(Number(v.toFixed(casas))).replace(".", ","));
const paraTexto = (l: LinhaOrcamento): Texto => ({
  descricao: l.descricao, unidade: l.unidade ?? "", quantidade: numTxt(l.quantidade), quebra: numTxt(l.quebra), mo: numTxt(l.custoUnitarioMaoDeObra),
  mat: numTxt(l.custoUnitarioMaterial), grupo: l.grupo ?? "", memoria: l.memoriaCalculo ?? "", observacao: l.observacao ?? "", etapaId: l.etapaId,
  bdiMo: l.bdiMaoDeObra == null ? "" : numTxt(l.bdiMaoDeObra * 100, 3), bdiMat: l.bdiMaterial == null ? "" : numTxt(l.bdiMaterial * 100, 3),
});
const n = (s: string, padrao: number) => { const v = lerNumero(s); return v == null || Number.isNaN(v) ? padrao : v; };
const nOuNull = (s: string) => { const v = lerNumero(s); return v == null || Number.isNaN(v) ? null : v / 100; };
/**
 * Converte o texto editado em valores. Campo numérico não alterado mantém o valor EXATO da base
 * (ex.: 500/3 = 166,666…), pois a tela mostra só 4 casas e reprocessar o texto mudaria o arredondamento.
 */
const paraLinha = (base: LinhaOrcamento, t: Texto): LinhaOrcamento => {
  const o = paraTexto(base);
  const v = (campo: keyof Texto, exato: number, padrao: number) => (t[campo] === o[campo] ? exato : n(t[campo], padrao));
  const b = (campo: "bdiMo" | "bdiMat", exato: number | null) => (t[campo] === o[campo] ? exato : nOuNull(t[campo]));
  return {
    ...base, etapaId: t.etapaId, descricao: t.descricao, unidade: t.unidade || null,
    quantidade: v("quantidade", base.quantidade, 0), quebra: v("quebra", base.quebra, 1) || 1,
    custoUnitarioMaoDeObra: v("mo", base.custoUnitarioMaoDeObra, 0), custoUnitarioMaterial: v("mat", base.custoUnitarioMaterial, 0),
    grupo: t.grupo.trim() || null, memoriaCalculo: t.memoria || null,
    bdiMaoDeObra: b("bdiMo", base.bdiMaoDeObra), bdiMaterial: b("bdiMat", base.bdiMaterial), observacao: t.observacao || null,
  };
};

type Salvar = (itemId: string | null, dados: Record<string, unknown>) => Promise<EstadoForm & { id?: string }>;

export function EditorOrcamento({ etapas, itens, parametros, editavel, salvar, excluir, mover }: {
  etapas: EtapaOrcamento[]; itens: LinhaOrcamento[]; parametros: ParametrosOrcamento; editavel: boolean;
  salvar: Salvar; excluir: (itemId: string) => Promise<EstadoForm>; mover: (itemId: string, direcao: -1 | 1) => Promise<EstadoForm>;
}) {
  const [linhas, setLinhas] = useState<Estado[]>(() => itens.map((l) => ({ linha: l, txt: paraTexto(l), sujo: false, salvando: false })));
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [vazias, setVazias] = useState(false);
  const [, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const focoNovo = useRef<string | null>(null);

  const ordemEtapa = useMemo(() => new Map(etapas.map((e) => [e.id, e.ordem])), [etapas]);
  const calculadas = useMemo(() => {
    const atuais = linhas.map((e) => paraLinha(e.linha, e.txt));
    const ordenadas = atuais.map((l, i) => ({ ...l, i, etapaOrdem: ordemEtapa.get(l.etapaId) ?? 0 }))
      .sort((a, b) => a.etapaOrdem - b.etapaOrdem || a.i - b.i);
    const codigos = new Map(codigosItens(ordenadas).map((x) => [x.id, x.codigo]));
    return atuais.map((l) => ({ l, calc: calcularItem(l, parametros), codigo: codigos.get(l.id) ?? "" }));
  }, [linhas, parametros, ordemEtapa]);
  const totais = useMemo(() => totalizar(calculadas.map((x) => x.calc), parametros), [calculadas, parametros]);

  const avisar = (m: string) => { setAviso(m); setTimeout(() => setAviso(null), 6000); };
  const atualizar = (id: string, f: (e: Estado) => Estado) => setLinhas((ls) => ls.map((e) => (e.linha.id === id ? f(e) : e)));
  const editar = (id: string, campo: keyof Texto, valor: string) => atualizar(id, (e) => ({ ...e, txt: { ...e.txt, [campo]: valor }, sujo: true }));

  function gravar(id: string) {
    const e = linhas.find((x) => x.linha.id === id);
    if (!e || !e.sujo || e.salvando) return;
    const t = e.txt;
    const l = paraLinha(e.linha, t);
    const dados = {
      etapaId: t.etapaId, grupo: t.grupo, descricao: t.descricao, unidade: t.unidade, quantidade: l.quantidade, memoriaCalculo: t.memoria,
      quebra: l.quebra, custoUnitarioMaoDeObra: l.custoUnitarioMaoDeObra, custoUnitarioMaterial: l.custoUnitarioMaterial,
      bdiMaoDeObra: l.bdiMaoDeObra == null ? "" : l.bdiMaoDeObra * 100, bdiMaterial: l.bdiMaterial == null ? "" : l.bdiMaterial * 100, observacao: t.observacao,
    };
    atualizar(id, (x) => ({ ...x, salvando: true, sujo: false, erro: undefined }));
    iniciar(async () => {
      const r = await salvar(id, dados);
      atualizar(id, (x) => {
        if (r.erro) return { ...x, salvando: false, erro: r.erro, sujo: true };
        const nova = paraLinha(x.linha, x.txt);
        return { ...x, salvando: false, erro: undefined, linha: nova, txt: x.sujo ? x.txt : paraTexto(nova) };
      });
    });
  }

  function adicionar(etapaId: string) {
    iniciar(async () => {
      const dados = { etapaId, descricao: "Novo item", quantidade: "0", quebra: "1", custoUnitarioMaoDeObra: "0", custoUnitarioMaterial: "0", bdiMaoDeObra: "", bdiMaterial: "", grupo: "", unidade: "", memoriaCalculo: "", observacao: "" };
      const r = await salvar(null, dados);
      if (r.erro || !r.id) return avisar(r.erro ?? "Não foi possível incluir o item");
      const linha: LinhaOrcamento = { id: r.id, etapaId, grupo: null, descricao: "Novo item", unidade: null, quantidade: 0, memoriaCalculo: null, quebra: 1, custoUnitarioMaoDeObra: 0, custoUnitarioMaterial: 0, bdiMaoDeObra: null, bdiMaterial: null, observacao: null };
      focoNovo.current = r.id;
      setLinhas((ls) => [...ls, { linha, txt: paraTexto(linha), sujo: false, salvando: false }]);
    });
  }

  function remover(id: string, descricao: string) {
    if (!confirm(`Excluir o item "${descricao}"?`)) return;
    const backup = linhas;
    setLinhas((ls) => ls.filter((e) => e.linha.id !== id));
    iniciar(async () => { const r = await excluir(id); if (r.erro) { setLinhas(backup); avisar(r.erro); } });
  }

  function deslocar(id: string, direcao: -1 | 1) {
    const e = linhas.find((x) => x.linha.id === id)!;
    const mesmos = linhas.filter((x) => x.txt.etapaId === e.txt.etapaId);
    const k = mesmos.findIndex((x) => x.linha.id === id);
    const alvo = mesmos[k + direcao];
    if (!alvo) return;
    const backup = linhas;
    setLinhas((ls) => {
      const a = ls.findIndex((x) => x.linha.id === id); const b = ls.findIndex((x) => x.linha.id === alvo.linha.id);
      const c = [...ls]; [c[a], c[b]] = [c[b]!, c[a]!]; return c;
    });
    iniciar(async () => { const r = await mover(id, direcao); if (r.erro) { setLinhas(backup); avisar(r.erro); } });
  }

  const termo = busca.trim().toLowerCase();
  const visiveis = (etapaId: string) => calculadas.filter((x) => x.l.etapaId === etapaId && (!termo || x.l.descricao.toLowerCase().includes(termo)));
  const inp = "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none hover:border-borda focus:border-zinc-900 focus:bg-white focus:ring-2 focus:ring-destaque/60 disabled:hover:border-transparent";
  const inpNum = clsx(inp, "tabular text-right");

  return (
    <div>
      {aviso && <div role="alert" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">{aviso}</div>}
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item…" aria-label="Buscar item" className="min-w-48 rounded-lg border border-borda bg-white px-3 py-1.5" />
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={vazias} onChange={(e) => setVazias(e.target.checked)} /> Mostrar etapas sem itens</label>
        {editavel && <span className="text-xs text-suave">Os valores são recalculados enquanto você digita e salvos ao sair da linha.</span>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-borda bg-white shadow-sm">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-suave">
            <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
              <th className="w-16">Item</th><th>Descrição</th><th className="w-20">Unid.</th><th className="w-24 !text-right">Quant.</th>
              <th className="w-20 !text-right">Quebra</th><th className="w-28 !text-right">MO unit.</th><th className="w-28 !text-right">Mat. unit.</th>
              <th className="w-28 !text-right">Custo</th><th className="w-28 !text-right">Venda</th><th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {etapas.map((et) => {
              const lista = visiveis(et.id);
              if (!lista.length && !vazias && !(editavel && !termo && linhas.length === 0)) return null;
              const sub = totalizar(lista.map((x) => x.calc), { ...parametros, impostos: 0 });
              return (
                <Fragment key={et.id}>
                  <tr className="border-t-2 border-zinc-900/80 bg-zinc-100">
                    <td className="px-2 py-2 font-semibold tabular">{et.ordem}</td>
                    <td className="px-2 py-2 font-semibold" colSpan={6}>{et.nome}</td>
                    <td className="tabular px-2 py-2 text-right font-semibold">{formatarMoeda(sub.custo)}</td>
                    <td className="tabular px-2 py-2 text-right font-semibold">{formatarMoeda(sub.venda)}</td>
                    <td className="px-2 py-2 text-right">
                      {editavel && <button onClick={() => adicionar(et.id)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-white" aria-label={`Adicionar item em ${et.nome}`}><Plus className="size-3.5" />Item</button>}
                    </td>
                  </tr>
                  {lista.map(({ l, calc, codigo }) => {
                    const e = linhas.find((x) => x.linha.id === l.id)!;
                    const aberto = abertos.has(l.id);
                    const t = e.txt;
                    return (
                      <Fragment key={l.id}>
                        <tr className={clsx("border-t border-borda align-top", e.erro && "bg-red-50", e.sujo && !e.erro && "bg-destaque-suave/40")}
                          onBlur={(ev) => { if (!(ev.relatedTarget as HTMLElement | null)?.closest(`[data-item="${l.id}"]`)) gravar(l.id); }}
                          data-item={l.id}>
                          <td className="px-2 py-1.5">
                            <button onClick={() => setAbertos((s) => { const c = new Set(s); if (c.has(l.id)) c.delete(l.id); else c.add(l.id); return c; })}
                              className="flex items-center gap-0.5 text-xs text-suave hover:text-texto" aria-expanded={aberto} aria-label={`Detalhes do item ${codigo}`}>
                              {aberto ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}<span className="tabular">{codigo}</span>
                            </button>
                          </td>
                          <td className="px-1 py-0.5">
                            <textarea rows={1} value={t.descricao} disabled={!editavel} onChange={(v) => editar(l.id, "descricao", v.target.value)} aria-label="Descrição"
                              ref={(el) => { if (el && focoNovo.current === l.id) { el.focus(); el.select(); focoNovo.current = null; } }}
                              className={clsx(inp, "resize-none [field-sizing:content]")} />
                            {(l.grupo || calc.minimoAplicado || l.bdiMaoDeObra != null || l.bdiMaterial != null) && (
                              <div className="flex flex-wrap gap-1 px-1.5 pb-1 text-[11px] text-suave">
                                {l.grupo && <span>{l.grupo}</span>}
                                {calc.minimoAplicado && <span className="rounded bg-destaque-suave px-1 text-destaque-texto">mínimo de MO aplicado</span>}
                                {(l.bdiMaoDeObra != null || l.bdiMaterial != null) && <span className="rounded bg-zinc-200 px-1 text-zinc-800">BDI próprio</span>}
                              </div>
                            )}
                          </td>
                          <td className="px-1 py-0.5"><input value={t.unidade} disabled={!editavel} onChange={(v) => editar(l.id, "unidade", v.target.value)} className={inp} aria-label="Unidade" /></td>
                          <td className="px-1 py-0.5"><input value={t.quantidade} disabled={!editavel} inputMode="decimal" onChange={(v) => editar(l.id, "quantidade", v.target.value)} className={inpNum} aria-label="Quantidade" /></td>
                          <td className="px-1 py-0.5"><input value={t.quebra} disabled={!editavel} inputMode="decimal" onChange={(v) => editar(l.id, "quebra", v.target.value)} className={inpNum} aria-label="Quebra" title="Fator de perda do material (1 = sem perda; 1,1 = 10%)" /></td>
                          <td className="px-1 py-0.5"><input value={t.mo} disabled={!editavel} inputMode="decimal" onChange={(v) => editar(l.id, "mo", v.target.value)} className={inpNum} aria-label="Valor unitário de mão de obra" /></td>
                          <td className="px-1 py-0.5"><input value={t.mat} disabled={!editavel} inputMode="decimal" onChange={(v) => editar(l.id, "mat", v.target.value)} className={inpNum} aria-label="Valor unitário de material" /></td>
                          <td className="tabular px-2 py-1.5 text-right text-suave" title={`MO ${formatarMoeda(calc.custoMaoDeObra)} + material ${formatarMoeda(calc.custoMaterial)}`}>{formatarMoeda(calc.custo)}</td>
                          <td className="tabular px-2 py-1.5 text-right font-medium" title={`MO ${formatarMoeda(calc.vendaMaoDeObra)} + material ${formatarMoeda(calc.vendaMaterial)}`}>{formatarMoeda(calc.venda)}</td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center justify-end gap-0.5 text-suave">
                              {e.salvando && <Loader2 className="size-3.5 animate-spin" aria-label="Salvando" />}
                              {e.erro && <span className="text-[11px] text-perigo" title={e.erro}>erro</span>}
                              {editavel && <>
                                <button onClick={() => deslocar(l.id, -1)} className="rounded p-0.5 hover:bg-zinc-100 hover:text-texto" aria-label="Mover para cima"><ArrowUp className="size-3.5" /></button>
                                <button onClick={() => deslocar(l.id, 1)} className="rounded p-0.5 hover:bg-zinc-100 hover:text-texto" aria-label="Mover para baixo"><ArrowDown className="size-3.5" /></button>
                                <button onClick={() => remover(l.id, t.descricao)} className="rounded p-0.5 hover:bg-red-50 hover:text-perigo" aria-label="Excluir item"><Trash2 className="size-3.5" /></button>
                              </>}
                            </div>
                          </td>
                        </tr>
                        {aberto && (
                          <tr className="bg-zinc-50/80" data-item={l.id} onBlur={(ev) => { if (!(ev.relatedTarget as HTMLElement | null)?.closest(`[data-item="${l.id}"]`)) gravar(l.id); }}>
                            <td />
                            <td colSpan={9} className="px-2 pb-3">
                              <div className="grid gap-3 pt-1 sm:grid-cols-6">
                                <label className="text-xs sm:col-span-2">Etapa
                                  <select value={t.etapaId} disabled={!editavel} onChange={(v) => editar(l.id, "etapaId", v.target.value)} className="mt-0.5 block w-full rounded border border-borda bg-white px-2 py-1 text-sm">
                                    {etapas.map((x) => <option key={x.id} value={x.id}>{x.ordem}. {x.nome}</option>)}
                                  </select>
                                </label>
                                <label className="text-xs sm:col-span-2">Grupo (subetapa)
                                  <input value={t.grupo} disabled={!editavel} onChange={(v) => editar(l.id, "grupo", v.target.value)} placeholder="Ex.: Projetos/plotagens" className="mt-0.5 block w-full rounded border border-borda bg-white px-2 py-1 text-sm" />
                                </label>
                                <label className="text-xs">BDI MO do item (%)
                                  <input value={t.bdiMo} disabled={!editavel} inputMode="decimal" onChange={(v) => editar(l.id, "bdiMo", v.target.value)} placeholder={numTxt(parametros.bdiMaoDeObra * 100, 2)} className="tabular mt-0.5 block w-full rounded border border-borda bg-white px-2 py-1 text-right text-sm" />
                                </label>
                                <label className="text-xs">BDI material do item (%)
                                  <input value={t.bdiMat} disabled={!editavel} inputMode="decimal" onChange={(v) => editar(l.id, "bdiMat", v.target.value)} placeholder={numTxt(parametros.bdiMaterial * 100, 2)} className="tabular mt-0.5 block w-full rounded border border-borda bg-white px-2 py-1 text-right text-sm" />
                                </label>
                                <label className="text-xs sm:col-span-3">Memória de cálculo da quantidade
                                  <textarea value={t.memoria} disabled={!editavel} rows={2} onChange={(v) => editar(l.id, "memoria", v.target.value)} placeholder="Ex.: sala 12,40 + quarto 9,80 + circulação 3,10" className="mt-0.5 block w-full rounded border border-borda bg-white px-2 py-1 text-sm" />
                                </label>
                                <label className="text-xs sm:col-span-3">Observação
                                  <textarea value={t.observacao} disabled={!editavel} rows={2} onChange={(v) => editar(l.id, "observacao", v.target.value)} className="mt-0.5 block w-full rounded border border-borda bg-white px-2 py-1 text-sm" />
                                </label>
                              </div>
                              <p className="mt-2 text-xs text-suave">
                                Custo MO {formatarMoeda(calc.custoMaoDeObra)}{calc.minimoAplicado ? " (mínimo)" : ""} · material {formatarMoeda(calc.custoMaterial)} → venda MO {formatarMoeda(calc.vendaMaoDeObra)} · material {formatarMoeda(calc.vendaMaterial)}. BDI em branco = usa o do orçamento.
                              </p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 z-20 mt-4 grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl border border-zinc-900 bg-lateral px-5 py-3 text-sm text-zinc-300 shadow-lg sm:grid-cols-3 lg:grid-cols-6">
        <div><div className="text-[11px] uppercase tracking-wide text-zinc-500">Custo</div><div className="tabular font-semibold text-white">{formatarMoeda(totais.custo)}</div></div>
        <div><div className="text-[11px] uppercase tracking-wide text-zinc-500">Venda s/ imposto</div><div className="tabular font-semibold text-white">{formatarMoeda(totais.venda)}</div></div>
        <div><div className="text-[11px] uppercase tracking-wide text-zinc-500">Impostos {formatarPercentual(parametros.impostos)}</div><div className="tabular font-semibold text-white">{formatarMoeda(totais.imposto)}</div></div>
        <div><div className="text-[11px] uppercase tracking-wide text-zinc-500">Total da proposta</div><div className="tabular text-base font-bold text-destaque">{formatarMoeda(totais.total)}</div></div>
        <div><div className="text-[11px] uppercase tracking-wide text-zinc-500">Lucro bruto</div><div className="tabular font-semibold text-white">{formatarMoeda(totais.lucro)}</div></div>
        <div><div className="text-[11px] uppercase tracking-wide text-zinc-500">Margem s/ total</div><div className="tabular font-semibold text-white">{formatarPercentual(totais.margem)}</div></div>
      </div>
    </div>
  );
}

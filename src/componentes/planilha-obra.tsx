"use client";

import clsx from "clsx";
import { Fragment, useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { metaFechamento, taxaDeUso } from "@/dominio/fisico";
import { formatarMoeda, lerNumero } from "@/dominio/formato";
import type { EstadoForm } from "@/lib/acoes";

export interface ServicoPlanilha {
  id: string; etapaId: string; descricao: string; fornecedorId: string | null; fornecedorNome: string | null;
  maoDeObraAcertada: number | null; maoDeObraVerba: number; valorCliente: number; duracaoDias: number;
  curvaAbc: "A" | "B" | "C" | null; observacao: string | null;
  /** Calculados no servidor: peso no avanço, % concluído, ABC pela verba. */
  peso: number; concluido: number; abcAuto: "A" | "B" | "C" | null;
}
export interface EtapaPlanilha { id: string; nome: string; tipo: string; exibirNoRelatorio: boolean }

type Txt = { descricao: string; fornecedorId: string; acertada: string; verba: string; cliente: string; duracao: string; abc: string };
type Linha = { id: string; novo: boolean; etapaId: string; base: ServicoPlanilha | null; txt: Txt; sujo: boolean; salvando: boolean; erro?: string };

/** Exibição com 2 casas (pt-BR, sem separador de milhar para facilitar a edição). */
const nTxt = (v: number | null | undefined) => (v == null ? "" : String(Number(v.toFixed(2))).replace(".", ","));
const paraTxt = (s: ServicoPlanilha): Txt => ({
  descricao: s.descricao, fornecedorId: s.fornecedorId ?? "", acertada: nTxt(s.maoDeObraAcertada), verba: nTxt(s.maoDeObraVerba),
  cliente: nTxt(s.valorCliente), duracao: nTxt(s.duracaoDias), abc: s.curvaAbc ?? "",
});
const num = (t: string) => { const v = lerNumero(t); return v == null || Number.isNaN(v) ? null : v; };
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
let seq = 0;

export function PlanilhaObra({ etapas, servicos, fornecedores, editavel, verValores, contrato, salvar, excluir, alternarRelatorio }: {
  etapas: EtapaPlanilha[]; servicos: ServicoPlanilha[]; fornecedores: { id: string; nome: string }[];
  editavel: boolean; verValores: boolean; contrato: number;
  salvar: (id: string | null, dados: Record<string, unknown>) => Promise<EstadoForm & { id?: string }>;
  excluir: (id: string) => Promise<EstadoForm>;
  alternarRelatorio: (etapaId: string, exibir: boolean) => Promise<EstadoForm>;
}) {
  const [linhas, setLinhas] = useState<Linha[]>(() => servicos.map((s) => ({ id: s.id, novo: false, etapaId: s.etapaId, base: s, txt: paraTxt(s), sujo: false, salvando: false })));
  const [fechadas, setFechadas] = useState<Set<string>>(new Set());
  const [vazias, setVazias] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  // Sincroniza com o servidor (ex.: após importar) mantendo as linhas em edição.
  const [origem, setOrigem] = useState(servicos);
  if (origem !== servicos) {
    setOrigem(servicos);
    setLinhas((ls) => {
      const editando = ls.filter((l) => l.sujo || l.novo);
      const ids = new Set(editando.map((l) => l.id));
      return [...servicos.filter((s) => !ids.has(s.id)).map((s) => ({ id: s.id, novo: false, etapaId: s.etapaId, base: s, txt: paraTxt(s), sujo: false, salvando: false })), ...editando];
    });
  }

  const atualizar = (id: string, f: (l: Linha) => Linha) => setLinhas((ls) => ls.map((l) => (l.id === id ? f(l) : l)));
  const editar = (id: string, campo: keyof Txt, v: string) => atualizar(id, (l) => ({ ...l, txt: { ...l.txt, [campo]: v }, sujo: true, erro: undefined }));

  function gravar(id: string) {
    const l = linhas.find((x) => x.id === id);
    if (!l || !l.sujo || l.salvando) return;
    if (l.novo && !l.txt.descricao.trim()) return;
    atualizar(id, (x) => ({ ...x, salvando: true }));
    const t = l.txt;
    // Campo numérico não alterado mantém o valor EXATO salvo (a tela mostra só 2 casas, ex.: 176,350625 → 176,35).
    const o = l.base ? paraTxt(l.base) : null;
    const exato = (campo: "acertada" | "verba" | "cliente" | "duracao", valor: number | null | undefined) => (o && t[campo] === o[campo] ? (valor ?? "") : t[campo]);
    const dados = {
      etapaId: l.etapaId, descricao: t.descricao, fornecedorId: t.fornecedorId, maoDeObraAcertada: exato("acertada", l.base?.maoDeObraAcertada),
      maoDeObraVerba: exato("verba", l.base?.maoDeObraVerba), valorCliente: exato("cliente", l.base?.valorCliente),
      duracaoDias: t.duracao === "" ? "1" : exato("duracao", l.base?.duracaoDias), curvaAbc: t.abc, observacao: l.base?.observacao ?? "",
    };
    iniciar(async () => {
      const r = await salvar(l.novo ? null : l.id, dados);
      if (r.erro) atualizar(id, (x) => ({ ...x, salvando: false, erro: r.erro }));
      else atualizar(id, (x) => ({ ...x, id: r.id ?? x.id, novo: false, salvando: false, sujo: false, erro: undefined }));
    });
  }

  function remover(l: Linha) {
    if (l.novo) { setLinhas((ls) => ls.filter((x) => x.id !== l.id)); return; }
    if (!confirm(`Excluir o serviço "${l.txt.descricao}" da planilha da obra?`)) return;
    iniciar(async () => {
      const r = await excluir(l.id);
      if (r.erro) { setAviso(r.erro); setTimeout(() => setAviso(null), 8000); }
      else setLinhas((ls) => ls.filter((x) => x.id !== l.id));
    });
  }

  function novo(etapaId: string) {
    const id = `novo-${++seq}`;
    setLinhas((ls) => [...ls, { id, novo: true, etapaId, base: null, txt: { descricao: "", fornecedorId: "", acertada: "", verba: "", cliente: "", duracao: "1", abc: "" }, sujo: true, salvando: false }]);
    setFechadas((f) => { const c = new Set(f); c.delete(etapaId); return c; });
    setTimeout(() => document.querySelector<HTMLInputElement>(`input[data-id="${id}"]`)?.focus(), 30);
  }

  const valores = (l: Linha) => ({ acertada: num(l.txt.acertada), verba: num(l.txt.verba) ?? 0, cliente: num(l.txt.cliente) ?? 0, duracao: num(l.txt.duracao) ?? 0 });
  const duracaoTotal = useMemo(() => linhas.reduce((t, l) => t + Math.max(valores(l).duracao, 0), 0), [linhas]);
  const totais = useMemo(() => linhas.reduce((t, l) => {
    const v = valores(l);
    return { acertada: t.acertada + (v.acertada ?? 0), verba: t.verba + v.verba, cliente: t.cliente + v.cliente, contrato: t.contrato + (etapas.find((e) => e.id === l.etapaId)?.tipo === "CONTRATO" ? v.cliente : 0) };
  }, { acertada: 0, verba: 0, cliente: 0, contrato: 0 }), [linhas, etapas]);

  const grupos = etapas.map((e) => ({ etapa: e, linhas: linhas.filter((l) => l.etapaId === e.id) })).filter((g) => g.linhas.length || vazias);
  const celula = "border-b border-borda px-1.5 py-1";
  const entrada = "tabular w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-right outline-none hover:border-borda focus:border-zinc-400 focus:bg-white";
  const diferencaContrato = totais.contrato - contrato;

  return (
    <div className="space-y-3">
      {aviso && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">{aviso}</div>}
      {verValores && contrato > 0 && Math.abs(diferencaContrato) >= 1 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          A soma do <b>valor cliente</b> das etapas de contrato ({formatarMoeda(totais.contrato)}) difere do contrato da obra ({formatarMoeda(contrato)}) em <b>{formatarMoeda(diferencaContrato)}</b>.
          As medições usam o valor cliente de cada serviço — ajuste os valores ou o contrato.
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-suave"><input type="checkbox" checked={vazias} onChange={(e) => setVazias(e.target.checked)} /> Mostrar etapas sem serviços{editavel && " (para incluir serviços nelas)"}</label>
      <div className="overflow-x-auto rounded-xl border border-borda bg-white shadow-sm">
        <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-[13px]">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-suave">
            <tr>
              <th className={clsx(celula, "w-[24%] text-left")}>Serviço</th>
              <th className={clsx(celula, "w-[11%] text-left")}>Fornecedor</th>
              {verValores && <>
                <th className={clsx(celula, "text-right")} title="Valor proposto ao prestador">MO acertada</th>
                <th className={clsx(celula, "w-14 text-center")} title="Curva ABC (vazio = calculada pela verba)">ABC</th>
                <th className={clsx(celula, "text-right")} title="Meta de fechamento: A 80%, B 90%, C 95% da verba">Meta</th>
                <th className={clsx(celula, "text-right")} title="Taxa de uso = acertada ÷ verba">TDU</th>
                <th className={clsx(celula, "text-right")}>MO verba</th>
                <th className={clsx(celula, "text-right")} title="Verba − acertada">Diferença</th>
                <th className={clsx(celula, "text-right")}>Valor cliente</th>
              </>}
              <th className={clsx(celula, "w-16 text-right")} title="Duração em dias — peso do serviço no avanço físico">Dur.</th>
              <th className={clsx(celula, "text-right")}>% concl.</th>
              {editavel && <th className={clsx(celula, "w-8")} />}
            </tr>
          </thead>
          <tbody>
            {grupos.map(({ etapa, linhas: ls }) => {
              const fechada = fechadas.has(etapa.id);
              const t = ls.reduce((a, l) => { const v = valores(l); return { acertada: a.acertada + (v.acertada ?? 0), verba: a.verba + v.verba, cliente: a.cliente + v.cliente, duracao: a.duracao + v.duracao }; }, { acertada: 0, verba: 0, cliente: 0, duracao: 0 });
              return (
                <Fragment key={etapa.id}>
                  <tr className="bg-zinc-100 font-semibold">
                    <td className={celula} colSpan={2}>
                      <div className="flex items-center gap-2">
                        <button type="button" className="flex min-w-0 items-center gap-1 text-left" onClick={() => setFechadas((f) => { const c = new Set(f); if (c.has(etapa.id)) c.delete(etapa.id); else c.add(etapa.id); return c; })}>
                          {fechada ? <ChevronRight className="size-4 shrink-0" /> : <ChevronDown className="size-4 shrink-0" />}
                          <span className="truncate uppercase tracking-wide">{etapa.nome}</span>
                          <span className="font-normal text-suave">({ls.length})</span>
                        </button>
                        <label className="ml-auto flex shrink-0 items-center gap-1 text-xs font-normal text-suave" title="Aparece em 'Evolução por tipo de serviço' no relatório semanal">
                          <input type="checkbox" defaultChecked={etapa.exibirNoRelatorio} disabled={!editavel}
                            onChange={(e) => { const v = e.target.checked; iniciar(async () => { const r = await alternarRelatorio(etapa.id, v); if (r.erro) setAviso(r.erro); }); }} />
                          no relatório
                        </label>
                      </div>
                    </td>
                    {verValores && <>
                      <td className={clsx(celula, "text-right tabular")}>{t.acertada ? formatarMoeda(t.acertada) : ""}</td>
                      <td className={celula} colSpan={3} />
                      <td className={clsx(celula, "text-right tabular")}>{t.verba ? formatarMoeda(t.verba) : ""}</td>
                      <td className={clsx(celula, "text-right tabular", t.verba - t.acertada < 0 && "text-perigo")}>{t.acertada ? formatarMoeda(t.verba - t.acertada) : ""}</td>
                      <td className={clsx(celula, "text-right tabular")}>{t.cliente ? formatarMoeda(t.cliente) : ""}</td>
                    </>}
                    <td className={clsx(celula, "text-right tabular")}>{t.duracao || ""}</td>
                    <td className={celula} />
                    {editavel && <td className={celula}><button type="button" title={`Incluir serviço em ${etapa.nome}`} onClick={() => novo(etapa.id)} className="rounded p-1 hover:bg-zinc-200"><Plus className="size-4" /></button></td>}
                  </tr>
                  {!fechada && ls.map((l) => {
                    const v = valores(l);
                    const abc = (l.txt.abc || l.base?.abcAuto || null) as "A" | "B" | "C" | null;
                    const meta = metaFechamento(v.verba, abc);
                    const tdu = taxaDeUso(v.acertada, v.verba);
                    const dif = v.acertada == null ? null : v.verba - v.acertada;
                    return (
                      <tr key={l.id} className={clsx("hover:bg-[#fdf8e6]", l.erro && "bg-red-50")}>
                        <td className={celula}>
                          {editavel ? (
                            <input data-id={l.id} value={l.txt.descricao} onChange={(e) => editar(l.id, "descricao", e.target.value)} onBlur={() => gravar(l.id)} placeholder="Nome do serviço"
                              className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 outline-none hover:border-borda focus:border-zinc-400 focus:bg-white" />
                          ) : <span className="px-1.5">{l.txt.descricao}</span>}
                          {l.erro && <div className="px-1.5 text-xs text-perigo">{l.erro}</div>}
                          {l.base?.observacao && <div className="truncate px-1.5 text-xs text-suave" title={l.base.observacao}>{l.base.observacao}</div>}
                        </td>
                        <td className={celula}>
                          {editavel ? (
                            <select value={l.txt.fornecedorId} onChange={(e) => editar(l.id, "fornecedorId", e.target.value)} onBlur={() => gravar(l.id)}
                              className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-sm outline-none hover:border-borda focus:border-zinc-400">
                              <option value="">—</option>
                              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                            </select>
                          ) : <span className="text-suave">{l.base?.fornecedorNome ?? "—"}</span>}
                        </td>
                        {verValores && <>
                          <td className={celula}>{editavel ? <input value={l.txt.acertada} inputMode="decimal" onChange={(e) => editar(l.id, "acertada", e.target.value)} onBlur={() => gravar(l.id)} placeholder="—" className={entrada} /> : <div className="text-right tabular">{formatarMoeda(v.acertada)}</div>}</td>
                          <td className={clsx(celula, "text-center")}>
                            {editavel ? (
                              <select value={l.txt.abc} onChange={(e) => editar(l.id, "abc", e.target.value)} onBlur={() => gravar(l.id)} title="Vazio = calculada pela verba" className="rounded border border-transparent bg-transparent py-1 text-sm outline-none hover:border-borda">
                                <option value="">{l.base?.abcAuto ? `${l.base.abcAuto}*` : "—"}</option><option>A</option><option>B</option><option>C</option>
                              </select>
                            ) : abc ?? "—"}
                          </td>
                          <td className={clsx(celula, "text-right tabular text-suave")}>{meta == null ? "" : formatarMoeda(meta)}</td>
                          <td className={clsx(celula, "text-right tabular", tdu != null && tdu > 1 && "font-semibold text-perigo", tdu != null && meta != null && v.acertada != null && v.acertada <= meta && "text-sucesso")}>{tdu == null ? "" : pct.format(tdu)}</td>
                          <td className={celula}>{editavel ? <input value={l.txt.verba} inputMode="decimal" onChange={(e) => editar(l.id, "verba", e.target.value)} onBlur={() => gravar(l.id)} className={entrada} /> : <div className="text-right tabular">{formatarMoeda(v.verba)}</div>}</td>
                          <td className={clsx(celula, "text-right tabular", dif != null && dif < 0 && "font-semibold text-perigo")}>{dif == null ? "" : formatarMoeda(dif)}</td>
                          <td className={celula}>{editavel ? <input value={l.txt.cliente} inputMode="decimal" onChange={(e) => editar(l.id, "cliente", e.target.value)} onBlur={() => gravar(l.id)} className={entrada} /> : <div className="text-right tabular">{formatarMoeda(v.cliente)}</div>}</td>
                        </>}
                        <td className={celula}>{editavel ? <input value={l.txt.duracao} inputMode="decimal" onChange={(e) => editar(l.id, "duracao", e.target.value)} onBlur={() => gravar(l.id)} className={entrada} /> : <div className="text-right tabular">{v.duracao}</div>}</td>
                        <td className={clsx(celula, "text-right tabular", (l.base?.concluido ?? 0) >= 1 - 1e-6 && "font-semibold text-sucesso")}>{l.base ? pct.format(l.base.concluido) : ""}</td>
                        {editavel && (
                          <td className={celula}>
                            {l.salvando ? <Loader2 className="size-4 animate-spin text-suave" /> : (
                              <button type="button" title="Excluir serviço" onClick={() => remover(l)} className="rounded p-1 text-suave hover:bg-red-50 hover:text-perigo"><Trash2 className="size-4" /></button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="bg-zinc-50 font-semibold">
            <tr>
              <td className="px-2 py-2" colSpan={2}>Total da obra</td>
              {verValores && <>
                <td className="px-2 text-right tabular">{formatarMoeda(totais.acertada)}</td>
                <td colSpan={3} />
                <td className="px-2 text-right tabular">{formatarMoeda(totais.verba)}</td>
                <td className={clsx("px-2 text-right tabular", totais.verba - totais.acertada < 0 && "text-perigo")}>{formatarMoeda(totais.verba - totais.acertada)}</td>
                <td className="px-2 text-right tabular">{formatarMoeda(totais.cliente)}</td>
              </>}
              <td className="px-2 text-right tabular">{Number(duracaoTotal.toFixed(2))}</td>
              <td colSpan={editavel ? 2 : 1} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-suave">
        Cada campo é salvo ao sair dele e fica registrado no histórico. ABC com * = calculada pela verba (A até 80% acumulado, B até 95%).
        Meta de fechamento: A = 80%, B = 90%, C = 95% da verba. TDU acima de 100% = acertado acima da verba (em vermelho).
      </p>
    </div>
  );
}

"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { AlertTriangle, ArrowRight, CircleAlert, Info, Search, X } from "lucide-react";
import { RITMO, type Gravidade, type Ritmo } from "@/dominio/painel-obras";
import type { CartaoObra } from "@/servicos/painel-obras";

const COR: Record<Ritmo, string> = { ATRASADA: "#b91c1c", ATENCAO: "#d97706", NO_RITMO: "#15803d", ADIANTADA: "#0f766e", SEM_CRONOGRAMA: "#a1a1aa" };
const FUNDO: Record<Ritmo, string> = { ATRASADA: "bg-red-50 text-red-800", ATENCAO: "bg-amber-50 text-amber-800", NO_RITMO: "bg-green-50 text-green-800", ADIANTADA: "bg-teal-50 text-teal-800", SEM_CRONOGRAMA: "bg-zinc-100 text-zinc-700" };
const ICONE: Record<Gravidade, typeof AlertTriangle> = { ALTA: AlertTriangle, MEDIA: CircleAlert, INFO: Info };
const COR_GRAV: Record<Gravidade, string> = { ALTA: "text-perigo", MEDIA: "text-alerta", INFO: "text-suave" };

const pct = (v: number | null) => (v == null ? "—" : `${(Math.round(v * 1000) / 10).toLocaleString("pt-BR")}%`);
const pp = (c: CartaoObra) => (c.realizado == null || c.previsto == null ? null : (c.realizado - c.previsto) * 100);
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).replace(/^-/, "−").replace(/\s/g, " ");
const br = (iso: string) => iso.split("-").reverse().join("/");
const prioridade = (c: CartaoObra) => RITMO[c.ritmo].ordem * 100 - c.pendencias.filter((p) => p.gravidade === "ALTA").length * 10 - c.pendencias.length;

function SeloRitmo({ r, c }: { r: Ritmo; c?: CartaoObra }) {
  const d = c ? pp(c) : null;
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", FUNDO[r])}>
      <span className="size-1.5 rounded-full" style={{ background: COR[r] }} />{RITMO[r].rotulo}{d != null && ` ${d > 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")} p.p.`}
    </span>
  );
}

/** Mini curva de avanço (previsto tracejado × realizado). */
function MiniCurva({ c, altura = 44, cor }: { c: CartaoObra; altura?: number; cor: string }) {
  const n = c.curva.length;
  if (n < 2 || c.ritmo === "SEM_CRONOGRAMA") return <div className="grid place-items-center text-xs text-suave" style={{ height: altura }}>sem cronograma</div>;
  const w = 200, h = altura;
  const x = (i: number) => (i / (n - 1)) * w;
  const y = (v: number) => h - 2 - Math.min(Math.max(v, 0), 1) * (h - 4);
  const prev = c.curva.map((p, i) => `${x(i).toFixed(1)},${y(p.previsto).toFixed(1)}`).join(" ");
  const real = c.curva.filter((p) => p.realizado != null).map((p) => `${x(c.curva.indexOf(p)).toFixed(1)},${y(p.realizado!).toFixed(1)}`).join(" ");
  const iAtual = Math.min(c.semanaAtual, n) - 1;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: altura }} preserveAspectRatio="none" aria-hidden>
      {iAtual >= 0 && <line x1={x(iAtual)} x2={x(iAtual)} y1={0} y2={h} stroke="#f2d468" strokeWidth={6} opacity={0.5} />}
      <polyline points={prev} fill="none" stroke="#a1a1aa" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      {real && <polyline points={real} fill="none" stroke={cor} strokeWidth={2.2} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

export function PainelObras({ cartoes, verValores, hoje }: { cartoes: CartaoObra[]; verValores: boolean; hoje: string }) {
  const [ritmo, setRitmo] = useState<Ritmo | "TODAS">("TODAS");
  const [gestor, setGestor] = useState("");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<"prioridade" | "codigo" | "prazo" | "avanco">("prioridade");
  const [aberta, setAberta] = useState<string | null>(null);

  // Preferências do painel guardadas no navegador (conveniência; o painel funciona sem elas).
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem("painel-obras") ?? "{}"); if (s.ordem) setOrdem(s.ordem); } catch { /* sem armazenamento */ }
  }, []);
  useEffect(() => { try { localStorage.setItem("painel-obras", JSON.stringify({ ordem })); } catch { /* sem armazenamento */ } }, [ordem]);

  const gestores = useMemo(() => [...new Set(cartoes.map((c) => c.gestor).filter((g): g is string => !!g))].sort(), [cartoes]);
  const base = useMemo(() => cartoes.filter((c) => (!gestor || c.gestor === gestor) && (!busca || `${c.codigo} ${c.nome} ${c.cliente} ${c.cidade ?? ""}`.toLowerCase().includes(busca.toLowerCase()))), [cartoes, gestor, busca]);
  const filtradas = useMemo(() => {
    const l = base.filter((c) => ritmo === "TODAS" || c.ritmo === ritmo);
    const cmp = {
      prioridade: (a: CartaoObra, b: CartaoObra) => prioridade(a) - prioridade(b) || a.codigo.localeCompare(b.codigo),
      codigo: (a: CartaoObra, b: CartaoObra) => a.codigo.localeCompare(b.codigo),
      prazo: (a: CartaoObra, b: CartaoObra) => a.prazo.dataFim.localeCompare(b.prazo.dataFim),
      avanco: (a: CartaoObra, b: CartaoObra) => (pp(a) ?? 999) - (pp(b) ?? 999),
    }[ordem];
    return [...l].sort(cmp);
  }, [base, ritmo, ordem]);
  const contagem = (r: Ritmo) => base.filter((c) => c.ritmo === r).length;
  const soma = (sel: (c: CartaoObra) => number) => filtradas.reduce((t, c) => t + sel(c), 0);
  const pendencias = filtradas.flatMap((c) => c.pendencias.map((p) => ({ ...p, obra: c }))).sort((a, b) => ({ ALTA: 0, MEDIA: 1, INFO: 2 })[a.gravidade] - ({ ALTA: 0, MEDIA: 1, INFO: 2 })[b.gravidade]);
  const altas = pendencias.filter((p) => p.gravidade === "ALTA").length;
  const sel = cartoes.find((c) => c.id === aberta) ?? null;
  const pontos = filtradas.filter((c) => c.realizado != null && c.previsto != null).map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome, x: c.previsto! * 100, y: c.realizado! * 100, ritmo: c.ritmo }));

  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") setAberta(null); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  if (!cartoes.length) return <p className="rounded-xl border border-borda bg-white px-6 py-12 text-center text-sm text-suave">Nenhuma obra ativa (contratada, em andamento ou paralisada) visível para você.</p>;

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-borda bg-white p-2.5 text-sm">
        {(["TODAS", "ATRASADA", "ATENCAO", "NO_RITMO", "ADIANTADA", "SEM_CRONOGRAMA"] as const).map((r) => {
          const n = r === "TODAS" ? base.length : contagem(r);
          if (r !== "TODAS" && n === 0) return null;
          return (
            <button key={r} type="button" onClick={() => setRitmo(r)} aria-pressed={ritmo === r}
              className={clsx("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium", ritmo === r ? "bg-marca text-white" : "text-suave hover:bg-zinc-100 hover:text-texto")}>
              {r !== "TODAS" && <span className="size-2 rounded-full" style={{ background: COR[r] }} />}
              {r === "TODAS" ? "Todas" : RITMO[r].rotulo} <span className={clsx("tabular text-xs", ritmo === r ? "text-zinc-300" : "text-suave")}>{n}</span>
            </button>
          );
        })}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="relative"><Search className="pointer-events-none absolute left-2 top-2 size-4 text-suave" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar obra, cliente…" aria-label="Buscar" className="w-48 rounded-lg border border-borda py-1.5 pl-8 pr-2" /></label>
          {gestores.length > 0 && (
            <select value={gestor} onChange={(e) => setGestor(e.target.value)} aria-label="Gestor" className="rounded-lg border border-borda px-2 py-1.5">
              <option value="">Todos os gestores</option>{gestores.map((g) => <option key={g}>{g}</option>)}
            </select>
          )}
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)} aria-label="Ordenar" className="rounded-lg border border-borda px-2 py-1.5">
            <option value="prioridade">Prioridade (atrasadas primeiro)</option><option value="avanco">Maior atraso no avanço</option>
            <option value="prazo">Término mais próximo</option><option value="codigo">Código</option>
          </select>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Kpi rotulo="Obras ativas" valor={String(filtradas.length)} detalhe={`${contagem("NO_RITMO") + contagem("ADIANTADA")} no ritmo ou adiantadas`} />
        <Kpi rotulo="Atrasadas" valor={String(filtradas.filter((c) => c.ritmo === "ATRASADA").length)} detalhe={`${filtradas.filter((c) => c.ritmo === "ATENCAO").length} em atenção`} tom={filtradas.some((c) => c.ritmo === "ATRASADA") ? "perigo" : undefined} />
        <Kpi rotulo="Pendências urgentes" valor={String(altas)} detalhe={`${pendencias.length} no total`} tom={altas ? "alerta" : undefined} />
        {verValores && <>
          <Kpi rotulo="A cobrar" valor={moeda(soma((c) => c.aCobrar))} detalhe="Executado − quitado" />
          <Kpi rotulo="Saldo dos contratos" valor={moeda(soma((c) => c.saldo))} detalhe={`de ${moeda(soma((c) => c.contrato))} contratados`} />
          <Kpi rotulo="Fornecedores" valor={moeda(soma((c) => c.executadoNaoPago))} detalhe="Executado e não pago" />
        </>}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Gráfico realizado × previsto */}
        <section className="min-w-0 rounded-xl border border-borda bg-white shadow-sm lg:col-span-2">
          <h2 className="border-b border-borda px-5 py-3 text-sm font-semibold">Avanço: realizado × previsto</h2>
          <div className="p-3">
            {pontos.length === 0 ? <p className="py-16 text-center text-sm text-suave">Nenhuma obra com cronograma no filtro.</p> : (
              <div style={{ height: 280 }} role="img" aria-label="Gráfico de dispersão: avanço previsto × realizado de cada obra">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke="#ececea" />
                    <XAxis type="number" dataKey="x" domain={[0, 100]} unit="%" tick={{ fontSize: 10, fill: "#6b6b6b" }} />
                    <YAxis type="number" dataKey="y" domain={[0, 100]} unit="%" tick={{ fontSize: 10, fill: "#6b6b6b" }} width={44} />
                    <ZAxis range={[90, 90]} />
                    <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="#a1a1aa" strokeDasharray="4 3" />
                    <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => {
                      const d = payload?.[0]?.payload as (typeof pontos)[number] | undefined;
                      return d ? <div className="rounded-lg border border-borda bg-white px-3 py-2 text-xs shadow"><b>{d.codigo}</b> · {d.nome}<br />Realizado {d.y.toFixed(1).replace(".", ",")}% · previsto {d.x.toFixed(1).replace(".", ",")}%</div> : null;
                    }} />
                    <Scatter data={pontos} onClick={(d: { id?: string }) => d?.id && setAberta(d.id)} cursor="pointer" isAnimationActive={false}>
                      {pontos.map((p) => <Cell key={p.id} fill={COR[p.ritmo]} />)}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="px-2 text-xs text-suave">Horizontal: previsto até hoje · vertical: realizado. Acima da diagonal = à frente do previsto; abaixo = atrás. Clique no ponto para ver a obra.</p>
          </div>
        </section>

        {/* Pendências */}
        <section className="min-w-0 rounded-xl border border-borda bg-white shadow-sm lg:col-span-3">
          <h2 className="flex items-center justify-between border-b border-borda px-5 py-3 text-sm font-semibold">Pendências da semana <span className="text-xs font-normal text-suave">{pendencias.length} item(ns)</span></h2>
          {pendencias.length === 0 ? <p className="px-5 py-10 text-center text-sm text-suave">Nada pendente nas obras do filtro.</p> : (
            <ul className="max-h-[316px] divide-y divide-borda overflow-y-auto">
              {pendencias.map((p, i) => {
                const I = ICONE[p.gravidade];
                return (
                  <li key={i}>
                    <Link href={`/obras/${p.obra.id}?aba=fisico&vista=${p.vista}`} className="flex items-start gap-3 px-5 py-2.5 text-sm hover:bg-[#fdf8e6]">
                      <I className={clsx("mt-0.5 size-4 shrink-0", COR_GRAV[p.gravidade])} aria-label={p.gravidade === "ALTA" ? "Urgente" : p.gravidade === "MEDIA" ? "Atenção" : "Informação"} />
                      <span className="min-w-0 flex-1"><b className="mr-1.5 tabular">{p.obra.codigo}</b>{p.texto}</span>
                      <ArrowRight className="mt-0.5 size-4 shrink-0 text-suave" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Cartões */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtradas.map((c) => {
          const altasObra = c.pendencias.filter((p) => p.gravidade === "ALTA").length;
          return (
            <button key={c.id} type="button" onClick={() => setAberta(c.id)} aria-label={`Detalhes da obra ${c.codigo}`}
              className="group flex flex-col rounded-xl border border-borda bg-white p-4 text-left shadow-sm transition hover:border-zinc-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-destaque"
              style={{ borderTopWidth: 4, borderTopColor: COR[c.ritmo] }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-suave">{c.codigo}{c.situacao === "PARALISADA" && " · paralisada"}</div>
                  <div className="truncate font-semibold">{c.nome}</div>
                  <div className="truncate text-xs text-suave">{c.cliente}{c.cidade ? ` · ${c.cidade}` : ""}</div>
                </div>
                <SeloRitmo r={c.ritmo} c={c} />
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <div className="tabular text-2xl font-semibold leading-none">{pct(c.realizado)}</div>
                  <div className="mt-1 text-xs text-suave">{c.realizado == null ? "planilha não montada" : `previsto ${pct(c.previsto)}`} · sem. {c.semanaAtual}/{c.nSemanas}</div>
                </div>
                <div className="w-1/2"><MiniCurva c={c} cor={COR[c.ritmo]} /></div>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-suave"><span>Prazo {Math.round(Math.min(c.prazo.prazoDecorrido, 9.99) * 100)}%</span><span>término {br(c.prazo.dataFim)}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-zinc-100"><div className={clsx("h-1.5 rounded-full", c.prazo.status === "ATRASADA" ? "bg-perigo" : "bg-zinc-700")} style={{ width: `${Math.min(c.prazo.prazoDecorrido, 1) * 100}%` }} /></div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-borda pt-3 text-xs">
                {verValores && c.realizado != null && <>
                  <dt className="text-suave">{c.medicaoAberta ? `Medição ${c.medicaoAberta.numero}` : "Medições"}</dt><dd className="tabular text-right font-medium">{c.medicaoAberta ? moeda(c.medicaoAberta.cobranca) : "—"}</dd>
                  <dt className="text-suave">A cobrar</dt><dd className="tabular text-right">{moeda(c.aCobrar)}</dd>
                </>}
                {verValores && <><dt className="text-suave">Saldo do contrato</dt><dd className="tabular text-right">{moeda(c.saldo)}</dd></>}
                <dt className="text-suave">Último relatório</dt><dd className="text-right">{c.ultimoRelatorio ? `sem. ${c.ultimoRelatorio.semana}` : "—"}</dd>
              </dl>
              <div className="mt-3 flex items-center gap-2 text-xs">
                {c.pendencias.length === 0 ? <span className="text-sucesso">Sem pendências</span> : (
                  <span className={altasObra ? "font-medium text-perigo" : "text-alerta"}>{c.pendencias.length} pendência(s){altasObra ? ` · ${altasObra} urgente(s)` : ""}</span>
                )}
                <span className="ml-auto text-suave group-hover:text-texto">Detalhes →</span>
              </div>
            </button>
          );
        })}
      </div>
      {filtradas.length === 0 && <p className="text-center text-sm text-suave">Nenhuma obra neste filtro.</p>}

      {/* Detalhe lateral */}
      {sel && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setAberta(null)}>
          <aside role="dialog" aria-modal="true" aria-label={`Obra ${sel.codigo}`} onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-borda bg-white px-5 py-4" style={{ borderTop: `4px solid ${COR[sel.ritmo]}` }}>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-suave">{sel.codigo} · {sel.cliente}</div>
                <h2 className="truncate text-lg font-semibold">{sel.nome}</h2>
                <div className="mt-1"><SeloRitmo r={sel.ritmo} c={sel} /></div>
              </div>
              <button type="button" onClick={() => setAberta(null)} aria-label="Fechar" className="rounded-lg p-1.5 hover:bg-zinc-100"><X className="size-5" /></button>
            </div>
            <div className="space-y-5 px-5 py-4 text-sm">
              <div className="grid grid-cols-3 gap-3">
                <Mini rotulo="Realizado" valor={pct(sel.realizado)} /><Mini rotulo="Previsto" valor={pct(sel.previsto)} /><Mini rotulo="Semana" valor={`${sel.semanaAtual}/${sel.nSemanas}`} />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-suave">Avanço acumulado</div>
                <MiniCurva c={sel} altura={120} cor={COR[sel.ritmo]} />
                <div className="mt-1 flex justify-between text-xs text-suave"><span>início {br(sel.prazo.dataInicio)}</span><span>— previsto · ━ realizado</span><span>término {br(sel.prazo.dataFim)}</span></div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-suave">Pendências</div>
                {sel.pendencias.length === 0 ? <p className="text-sucesso">Nenhuma pendência.</p> : (
                  <ul className="space-y-1.5">
                    {sel.pendencias.map((p, i) => { const I = ICONE[p.gravidade]; return (
                      <li key={i}><Link href={`/obras/${sel.id}?aba=fisico&vista=${p.vista}`} className="flex gap-2 hover:underline"><I className={clsx("mt-0.5 size-4 shrink-0", COR_GRAV[p.gravidade])} />{p.texto}</Link></li>
                    ); })}
                  </ul>
                )}
              </div>
              {verValores && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-suave">Contrato e medições</div>
                  <dl className="grid grid-cols-2 gap-y-1">
                    <dt className="text-suave">Contrato</dt><dd className="tabular text-right">{moeda(sel.contrato)}</dd>
                    <dt className="text-suave">Executado (cobrança)</dt><dd className="tabular text-right">{moeda(sel.executado)}</dd>
                    <dt className="text-suave">Quitado</dt><dd className="tabular text-right">{moeda(sel.quitado)}</dd>
                    <dt className="text-suave">Saldo do contrato</dt><dd className="tabular text-right font-semibold">{moeda(sel.saldo)}</dd>
                    <dt className="text-suave">Fornecedores a pagar</dt><dd className="tabular text-right">{moeda(sel.fornecedoresAPagar)}</dd>
                  </dl>
                  {sel.medicoes.length > 0 && (
                    <table className="mt-3 w-full text-xs">
                      <thead className="text-suave"><tr><th className="py-1 text-left font-medium">Medição</th><th className="text-left font-medium">Data</th><th className="text-right font-medium">Cobrança</th><th className="text-right font-medium">Situação</th></tr></thead>
                      <tbody>{sel.medicoes.map((m) => (
                        <tr key={m.numero} className="border-t border-borda"><td className="py-1">{m.numero}</td><td>{br(m.data)}</td><td className="tabular text-right">{moeda(m.cobranca)}</td>
                          <td className="text-right">{m.estado === "FECHADA" ? (m.situacao === "PAGA" ? "Paga" : "Não paga") : m.estado === "A_FECHAR" ? "A fechar" : "Em andamento"}</td></tr>
                      ))}</tbody>
                    </table>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2 border-t border-borda pt-4">
                <Link href={`/obras/${sel.id}?aba=fisico`} className="rounded-lg bg-marca px-4 py-2 font-medium text-white">Abrir a obra</Link>
                <Link href={`/obras/${sel.id}?aba=fisico&vista=semana`} className="rounded-lg border border-borda px-3 py-2 hover:bg-zinc-50">Lançar semana</Link>
                <Link href={`/obras/${sel.id}?aba=fisico&vista=relatorio`} className="rounded-lg border border-borda px-3 py-2 hover:bg-zinc-50">Relatório</Link>
              </div>
              <p className="text-xs text-suave">Dados de {br(hoje)}. Ritmo: até 2 pontos abaixo do previsto = no ritmo; 2 a 5 = atenção; acima de 5 = atrasada.</p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Kpi({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: string; detalhe?: string; tom?: "perigo" | "alerta" }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-borda bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-suave">{rotulo}</div>
      <div className={clsx("tabular mt-1 whitespace-nowrap text-lg font-semibold sm:text-xl", tom === "perigo" && "text-perigo", tom === "alerta" && "text-alerta")}>{valor}</div>
      {detalhe && <div className="mt-1 truncate text-xs text-suave">{detalhe}</div>}
    </div>
  );
}
function Mini({ rotulo, valor }: { rotulo: string; valor: string }) {
  return <div className="rounded-lg bg-zinc-50 px-3 py-2"><div className="text-xs text-suave">{rotulo}</div><div className="tabular text-lg font-semibold">{valor}</div></div>;
}

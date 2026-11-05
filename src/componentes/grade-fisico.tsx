"use client";

import clsx from "clsx";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Loader2, Save, Undo2, Wand2 } from "lucide-react";
import { calcularAvanco, concluido, distribuir, lerPercentual, medicaoDaSemana, percentualTexto, type Serie, type ServicoFisico } from "@/dominio/fisico";
import type { EstadoForm } from "@/lib/acoes";

export interface ServicoGrade {
  id: string; etapaId: string; descricao: string; duracao: number; valorCliente: number; fornecedorNome: string | null;
  previsto: Record<number, number>; realizado: Record<number, number>;
}
export interface SemanaGrade { numero: number; inicio: string; fim: string }
type Alteracao = { servicoId: string; semana: number; valor: number | null };

const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const fmt = (v: number) => (Math.abs(v) < 5e-7 ? "" : pct.format(v));
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const chave = (id: string, s: number) => `${id}|${s}`;

export function GradeFisico({ serie, etapas, servicos, semanas, semanaAtual, semanasPorMedicao, editavel, salvar }: {
  serie: Serie; etapas: { id: string; nome: string }[]; servicos: ServicoGrade[]; semanas: SemanaGrade[];
  semanaAtual: number; semanasPorMedicao: number; editavel: boolean;
  salvar: (alteracoes: Alteracao[]) => Promise<EstadoForm>;
}) {
  /** Texto digitado por célula alterada (sobrepõe o valor salvo). */
  const [edicao, setEdicao] = useState<Map<string, string>>(new Map());
  const [fechadas, setFechadas] = useState<Set<string>>(new Set());
  const [vazias, setVazias] = useState(false);
  const [msg, setMsg] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();
  const rolagem = useRef<HTMLDivElement>(null);

  // Valores efetivos = salvos + edição.
  const efetivos = useMemo<ServicoFisico[]>(() => servicos.map((s) => {
    const valores = { ...s[serie] };
    for (const [k, t] of edicao) {
      const [id, sem] = k.split("|");
      if (id !== s.id) continue;
      const v = lerPercentual(t);
      if (v == null || Number.isNaN(v) || v === 0) delete valores[Number(sem)]; else valores[Number(sem)] = v;
    }
    const base = { id: s.id, etapaId: s.etapaId, duracao: s.duracao, valorCliente: s.valorCliente };
    return serie === "realizado" ? { ...base, realizado: valores, previsto: s.previsto } : { ...base, previsto: valores, realizado: s.realizado };
  }), [servicos, edicao, serie]);

  const n = semanas.length;
  const avanco = useMemo(() => calcularAvanco(etapas, efetivos, n), [etapas, efetivos, n]);
  const porId = useMemo(() => new Map(efetivos.map((s) => [s.id, s])), [efetivos]);
  const invalidos = useMemo(() => {
    const m = new Set<string>();
    for (const [k, t] of edicao) { const v = lerPercentual(t); if (v != null && (Number.isNaN(v) || v > 1 || v < -1)) m.add(k); }
    return m;
  }, [edicao]);
  const acimaDe100 = useMemo(() => new Set(efetivos.filter((s) => concluido(s, serie) > 1 + 1e-9 || concluido(s, serie) < -1e-9).map((s) => s.id)), [efetivos, serie]);
  const alteracoes = useMemo<Alteracao[]>(() => {
    const out: Alteracao[] = [];
    for (const [k, t] of edicao) {
      const [id, sem] = k.split("|") as [string, string];
      const v = lerPercentual(t);
      if (v != null && Number.isNaN(v)) continue;
      const original = servicos.find((s) => s.id === id)?.[serie][Number(sem)] ?? null;
      if ((original ?? 0) !== (v ?? 0)) out.push({ servicoId: id, semana: Number(sem), valor: v });
    }
    return out;
  }, [edicao, servicos, serie]);

  const sujo = alteracoes.length > 0;
  useEffect(() => {
    if (!sujo) return;
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [sujo]);

  // Posiciona a rolagem na semana atual.
  useEffect(() => {
    const el = rolagem.current?.querySelector<HTMLElement>(`[data-semana="${Math.max(1, semanaAtual - 2)}"]`);
    if (el && rolagem.current) rolagem.current.scrollLeft = el.offsetLeft - 448; // 448px = largura das colunas fixas (28rem)
  }, [semanaAtual]);

  const linhas = useMemo(() => {
    const out: { etapa: { id: string; nome: string }; servicos: ServicoGrade[] }[] = [];
    for (const e of etapas) {
      const s = servicos.filter((x) => x.etapaId === e.id);
      if (s.length || vazias) out.push({ etapa: e, servicos: s });
    }
    return out;
  }, [etapas, servicos, vazias]);
  const visiveis = useMemo(() => linhas.flatMap((l) => (fechadas.has(l.etapa.id) ? [] : l.servicos)), [linhas, fechadas]);

  const texto = (id: string, s: number) => edicao.get(chave(id, s)) ?? percentualTexto(servicos.find((x) => x.id === id)?.[serie][s]);
  const definir = (pares: [string, string][]) => setEdicao((m) => { const c = new Map(m); for (const [k, t] of pares) c.set(k, t); return c; });

  function focar(linha: number, coluna: number) {
    const el = rolagem.current?.querySelector<HTMLInputElement>(`input[data-l="${linha}"][data-c="${coluna}"]`);
    if (el) { el.focus(); el.select(); }
  }
  function teclado(e: React.KeyboardEvent<HTMLInputElement>, l: number, c: number) {
    const t = e.currentTarget;
    if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); focar(l + (e.shiftKey && e.key === "Enter" ? -1 : 1), c); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focar(l - 1, c); }
    else if (e.key === "ArrowRight" && t.selectionStart === t.value.length) { e.preventDefault(); focar(l, c + 1); }
    else if (e.key === "ArrowLeft" && t.selectionEnd === 0) { e.preventDefault(); focar(l, c - 1); }
    else if (e.key === "Escape") { const k = chave(visiveis[l]!.id, c); setEdicao((m) => { const x = new Map(m); x.delete(k); return x; }); }
  }
  /** Colar um bloco copiado do Excel (linhas × semanas) a partir da célula. */
  function colar(e: React.ClipboardEvent<HTMLInputElement>, l: number, c: number) {
    const dados = e.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(dados.trim())) return;
    e.preventDefault();
    const blocos = dados.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((r) => r.split("\t"));
    const pares: [string, string][] = [];
    blocos.forEach((cols, i) => {
      const s = visiveis[l + i];
      if (!s) return;
      cols.forEach((v, j) => { if (c + j <= n) pares.push([chave(s.id, c + j), v.trim()]); });
    });
    definir(pares);
    setMsg({ tom: "ok", texto: `${pares.length} célula(s) coladas. Confira e salve.` });
  }

  function gravar() {
    if (invalidos.size || acimaDe100.size) return;
    iniciar(async () => {
      const r = await salvar(alteracoes);
      if (r.erro) setMsg({ tom: "erro", texto: r.erro });
      else { setEdicao(new Map()); setMsg({ tom: "ok", texto: r.mensagem ?? "Salvo." }); }
    });
  }

  // Ferramenta de distribuição (previsto): espalha o percentual igualmente entre semanas.
  const [dist, setDist] = useState({ servicoId: "", de: String(Math.max(semanaAtual, 1)), ate: String(Math.max(semanaAtual, 1) + 1), total: "100" });
  function aplicarDistribuicao() {
    const de = Number(dist.de), ate = Number(dist.ate), total = lerPercentual(dist.total);
    if (!dist.servicoId || !(de >= 1) || !(ate >= de) || ate > n || total == null || Number.isNaN(total) || total <= 0 || total > 1) {
      setMsg({ tom: "erro", texto: `Escolha o serviço, semanas entre 1 e ${n} e um percentual até 100%.` });
      return;
    }
    const valores = distribuir(de, ate, total);
    const s = servicos.find((x) => x.id === dist.servicoId)!;
    const pares: [string, string][] = [];
    for (let k = 1; k <= n; k++) {
      const novo = valores[k];
      const atual = porId.get(s.id)?.previsto[k];
      if (novo != null) pares.push([chave(s.id, k), percentualTexto(novo)]);
      else if (atual && (k < de || k > ate)) pares.push([chave(s.id, k), ""]);
    }
    definir(pares);
    setMsg({ tom: "ok", texto: `"${s.descricao}": ${pct.format(total)} distribuído entre as semanas ${de} e ${ate}. Salve para gravar.` });
  }

  if (!servicos.length) return null;

  const colunasFixas = "sticky z-10 bg-inherit";
  // Cabeçalho: fundo opaco explícito (a linha do cabeçalho não tem fundo para herdar).
  const cabFixa = "sticky z-30 bg-zinc-50";
  const larguraNome = "left-0 w-64 min-w-64 max-w-64";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {editavel && (
          <>
            <button type="button" onClick={gravar} disabled={!sujo || salvando || invalidos.size > 0 || acimaDe100.size > 0}
              className="inline-flex items-center gap-2 rounded-lg bg-marca px-4 py-2 font-medium text-white disabled:opacity-40">
              {salvando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {sujo ? `Salvar ${alteracoes.length} alteração(ões)` : "Nada a salvar"}
            </button>
            {sujo && <button type="button" onClick={() => setEdicao(new Map())} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-suave hover:bg-zinc-100"><Undo2 className="size-4" /> Descartar</button>}
          </>
        )}
        <label className="ml-auto inline-flex items-center gap-2 text-suave"><input type="checkbox" checked={vazias} onChange={(e) => setVazias(e.target.checked)} /> Mostrar etapas sem serviços</label>
      </div>
      {msg && <div role="status" className={clsx("rounded-lg border px-4 py-2 text-sm", msg.tom === "erro" ? "border-red-200 bg-red-50 text-red-900" : "border-green-200 bg-green-50 text-green-900")}>{msg.texto}</div>}
      {acimaDe100.size > 0 && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">Há serviço(s) com total acima de 100% (destacados em vermelho). Corrija antes de salvar.</div>}

      {editavel && serie === "previsto" && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-borda bg-white p-3 text-sm">
          <span className="flex items-center gap-1 self-center font-medium"><Wand2 className="size-4" /> Distribuir</span>
          <label className="flex flex-col gap-1"><span className="text-xs text-suave">Serviço (ou clique no nome na grade)</span>
            <select value={dist.servicoId} onChange={(e) => setDist({ ...dist, servicoId: e.target.value })} className="max-w-72 rounded-lg border border-borda px-2 py-1.5">
              <option value="">Selecione…</option>
              {etapas.map((et) => {
                const ss = servicos.filter((s) => s.etapaId === et.id);
                return ss.length ? <optgroup key={et.id} label={et.nome}>{ss.map((s) => <option key={s.id} value={s.id}>{s.descricao}</option>)}</optgroup> : null;
              })}
            </select></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-suave">Da semana</span><input inputMode="numeric" value={dist.de} onChange={(e) => setDist({ ...dist, de: e.target.value })} className="w-20 rounded-lg border border-borda px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-suave">até a semana</span><input inputMode="numeric" value={dist.ate} onChange={(e) => setDist({ ...dist, ate: e.target.value })} className="w-20 rounded-lg border border-borda px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-suave">Total (%)</span><input inputMode="decimal" value={dist.total} onChange={(e) => setDist({ ...dist, total: e.target.value })} className="w-20 rounded-lg border border-borda px-2 py-1.5" /></label>
          <button type="button" onClick={aplicarDistribuicao} className="rounded-lg border border-borda px-3 py-1.5 font-medium hover:bg-zinc-50">Aplicar</button>
          <span className="text-xs text-suave">Divide igualmente e substitui o previsto do serviço fora do intervalo. Você pode ajustar célula a célula depois.</span>
        </div>
      )}

      <div ref={rolagem} className="max-h-[70vh] overflow-auto rounded-xl border border-borda bg-white shadow-sm">
        <table className="border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-20 bg-zinc-50">
            <tr>
              <th className={clsx(cabFixa, larguraNome, "border-b border-borda px-3 py-1 text-left")} rowSpan={3}>Serviço</th>
              <th className={clsx(cabFixa, "left-64 w-14 min-w-14 max-w-14 border-b border-borda px-2 text-right")} rowSpan={3} title="Duração (dias) — peso no avanço">Dur.</th>
              <th className={clsx(cabFixa, "left-[19.5rem] w-16 min-w-16 max-w-16 border-b border-borda px-2 text-right")} rowSpan={3} title="Peso do serviço no avanço da obra = duração ÷ duração total">% rel.</th>
              <th className={clsx(cabFixa, "left-[23.5rem] w-18 min-w-18 max-w-18 border-r border-b border-borda px-2 text-right")} rowSpan={3}>{serie === "realizado" ? "% concl." : "% prev."}</th>
              {semanas.map((s) => {
                const m = medicaoDaSemana(s.numero, semanasPorMedicao);
                const primeira = (s.numero - 1) % Math.min(Math.max(semanasPorMedicao, 1), 4) === 0;
                return primeira ? (
                  <th key={`m${s.numero}`} colSpan={Math.min(semanasPorMedicao, n - s.numero + 1)} className={clsx("border-b border-l border-borda px-1 py-1 text-center font-semibold", m % 2 ? "bg-zinc-100" : "bg-zinc-50")}>
                    Medição {m}
                  </th>
                ) : null;
              })}
            </tr>
            <tr>
              {semanas.map((s) => <th key={s.numero} data-semana={s.numero} className={clsx("min-w-16 border-l border-borda px-1 pt-1 text-center font-semibold", s.numero === semanaAtual && "bg-destaque")}>Sem. {s.numero}</th>)}
            </tr>
            <tr>
              {semanas.map((s) => <th key={s.numero} className={clsx("border-b border-l border-borda px-1 pb-1 text-center font-normal text-suave", s.numero === semanaAtual && "bg-destaque text-zinc-800")} title={`${ddmm(s.inicio)} a ${ddmm(s.fim)}`}>{ddmm(s.inicio)}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ etapa, servicos: ss }) => {
              const ae = avanco.etapas.find((x) => x.etapaId === etapa.id)!;
              const fechada = fechadas.has(etapa.id);
              return (
                <Fragment key={etapa.id}>
                  <tr className="bg-zinc-100 font-semibold">
                    <td className={clsx(colunasFixas, larguraNome, "border-b border-borda px-2 py-1.5")}>
                      <button type="button" className="flex w-full items-center gap-1 text-left" onClick={() => setFechadas((f) => { const c = new Set(f); if (c.has(etapa.id)) c.delete(etapa.id); else c.add(etapa.id); return c; })}>
                        {fechada ? <ChevronRight className="size-3.5 shrink-0" /> : <ChevronDown className="size-3.5 shrink-0" />}
                        <span className="truncate uppercase tracking-wide">{etapa.nome}</span>
                      </button>
                    </td>
                    <td className={clsx(colunasFixas, "left-64 border-b border-borda px-2 text-right tabular")}>{ss.reduce((t, s) => t + s.duracao, 0) || ""}</td>
                    <td className={clsx(colunasFixas, "left-[19.5rem] border-b border-borda px-2 text-right tabular")}>{fmt(ae.peso)}</td>
                    <td className={clsx(colunasFixas, "left-[23.5rem] border-r border-b border-borda px-2 text-right tabular")}>{fmt(ae[serie])}</td>
                    {ae.semanal.map((p) => <td key={p.semana} className={clsx("border-b border-l border-borda px-1 text-right tabular text-suave", p.semana === semanaAtual && "bg-destaque-suave")}>{fmt(p[serie])}</td>)}
                  </tr>
                  {!fechada && ss.map((s) => {
                    const l = visiveis.findIndex((v) => v.id === s.id);
                    const total = concluido(porId.get(s.id)!, serie);
                    const erro = acimaDe100.has(s.id);
                    return (
                      <tr key={s.id} className="bg-white hover:bg-[#fdf8e6]">
                        <td className={clsx(colunasFixas, larguraNome, "border-b border-borda px-2 py-0.5")}>
                          <button type="button" disabled={serie !== "previsto" || !editavel} onClick={() => setDist((d) => ({ ...d, servicoId: s.id }))}
                            className="block w-full truncate pl-4 text-left disabled:cursor-default" title={`${s.descricao}${s.fornecedorNome ? ` · ${s.fornecedorNome}` : ""}`}>
                            {s.descricao}
                          </button>
                        </td>
                        <td className={clsx(colunasFixas, "left-64 border-b border-borda px-2 text-right tabular")}>{s.duracao || "—"}</td>
                        <td className={clsx(colunasFixas, "left-[19.5rem] border-b border-borda px-2 text-right tabular text-suave")}>{fmt(avanco.servicos.get(s.id)?.peso ?? 0)}</td>
                        <td className={clsx(colunasFixas, "left-[23.5rem] border-r border-b border-borda px-2 text-right tabular font-medium", erro && "bg-red-50 text-perigo", !erro && Math.abs(total - 1) < 1e-6 && "text-sucesso")}>{fmt(total) || "0%"}</td>
                        {semanas.map((sem) => {
                          const k = chave(s.id, sem.numero);
                          const alterada = edicao.has(k) && alteracoes.some((a) => a.servicoId === s.id && a.semana === sem.numero);
                          return (
                            <td key={sem.numero} className={clsx("border-b border-l border-borda p-0", sem.numero === semanaAtual && "bg-destaque-suave/60")}>
                              {editavel ? (
                                <input data-l={l} data-c={sem.numero} value={texto(s.id, sem.numero)} inputMode="decimal" aria-label={`${s.descricao}, semana ${sem.numero}, %`}
                                  onChange={(e) => definir([[k, e.target.value]])} onFocus={(e) => e.target.select()}
                                  onKeyDown={(e) => teclado(e, l, sem.numero)} onPaste={(e) => colar(e, l, sem.numero)}
                                  className={clsx("tabular h-7 w-16 bg-transparent px-1.5 text-right outline-none focus:bg-white focus:ring-2 focus:ring-destaque",
                                    alterada && "bg-amber-100 font-semibold", invalidos.has(k) && "bg-red-100 text-perigo")} />
                              ) : (
                                <div className="h-7 px-1.5 text-right leading-7 tabular">{texto(s.id, sem.numero) && `${texto(s.id, sem.numero)}%`}</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 z-20 bg-zinc-50 font-semibold">
            <LinhaTotal rotulo={`Avanço da obra na semana (${serie})`} valores={avanco.semanal.map((p) => p[serie])} total={avanco[serie]} semanaAtual={semanaAtual} />
            <LinhaTotal rotulo={`Acumulado ${serie}`} valores={avanco.acumulado.map((p) => (serie === "realizado" && p.semana > semanaAtual ? null : p[serie]))} semanaAtual={semanaAtual} forte />
            {serie === "realizado" && (
              <>
                <LinhaTotal rotulo="Acumulado previsto" valores={avanco.acumulado.map((p) => p.previsto)} semanaAtual={semanaAtual} suave />
                <LinhaTotal rotulo="Diferença (realizado − previsto)" valores={avanco.acumulado.map((p) => (p.semana > semanaAtual ? null : p.realizado - p.previsto))} semanaAtual={semanaAtual} sinal />
              </>
            )}
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-suave">
        Digite o percentual de cada semana (ex.: 25 ou 12,5). Enter/setas navegam; Esc desfaz a célula; dá para colar um bloco copiado do Excel.
        A semana atual está em amarelo. % rel. = duração do serviço ÷ duração total da obra (peso no avanço).
      </p>
    </div>
  );
}

function LinhaTotal({ rotulo, valores, total, semanaAtual, forte, suave, sinal }: { rotulo: string; valores: (number | null)[]; total?: number; semanaAtual: number; forte?: boolean; suave?: boolean; sinal?: boolean }) {
  return (
    <tr className={clsx(suave && "font-normal text-suave")}>
      <td colSpan={3} className="sticky left-0 z-10 border-t border-borda bg-zinc-50 px-3 py-1.5 text-left">{rotulo}</td>
      <td className="sticky left-[23.5rem] z-10 border-t border-r border-borda bg-zinc-50 px-2 text-right tabular">{total == null ? "" : pct.format(total)}</td>
      {valores.map((v, i) => (
        <td key={i} className={clsx("border-t border-l border-borda px-1 py-1.5 text-right tabular", i + 1 === semanaAtual && "bg-destaque", forte && "text-texto",
          sinal && v != null && v < -5e-7 && "text-perigo", sinal && v != null && v > 5e-7 && "text-sucesso")}>
          {v == null ? "" : sinal ? (Math.abs(v) < 5e-7 ? "0%" : `${v > 0 ? "+" : ""}${pct.format(v)}`) : fmt(v) || (forte ? "0%" : "")}
        </td>
      ))}
    </tr>
  );
}

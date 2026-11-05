"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Save } from "lucide-react";
import { lerPercentual, percentualTexto } from "@/dominio/fisico";
import type { EstadoForm } from "@/lib/acoes";
import type { ServicoGrade } from "./grade-fisico";

const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Lançamento do realizado de UMA semana, por serviço — feito pelo engenheiro ao longo da semana
 * para emitir o relatório na sexta. Mostra o acumulado anterior, o previsto da semana e o que falta.
 */
export function LancarSemana({ etapas, servicos, semana, totalSemanas, inicio, fim, base, editavel, salvar }: {
  etapas: { id: string; nome: string }[]; servicos: ServicoGrade[]; semana: number; totalSemanas: number; inicio: string; fim: string;
  base: string; editavel: boolean; salvar: (alteracoes: { servicoId: string; semana: number; valor: number | null }[]) => Promise<EstadoForm>;
}) {
  const [txt, setTxt] = useState<Map<string, string>>(new Map());
  const [filtro, setFiltro] = useState<"semana" | "andamento" | "todos">("semana");
  const [msg, setMsg] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();

  const info = useMemo(() => new Map(servicos.map((s) => {
    const anterior = Object.entries(s.realizado).filter(([k]) => Number(k) < semana).reduce((t, [, v]) => t + v, 0);
    const posterior = Object.entries(s.realizado).filter(([k]) => Number(k) > semana).reduce((t, [, v]) => t + v, 0);
    const salvo = s.realizado[semana] ?? 0;
    const digitado = txt.has(s.id) ? lerPercentual(txt.get(s.id)) : salvo;
    const atual = digitado == null ? 0 : digitado;
    return [s.id, { anterior, posterior, salvo, atual, invalido: Number.isNaN(atual), total: anterior + (Number.isNaN(atual) ? 0 : atual) + posterior, previsto: s.previsto[semana] ?? 0, previstoAte: Object.entries(s.previsto).filter(([k]) => Number(k) <= semana).reduce((t, [, v]) => t + v, 0) }];
  })), [servicos, semana, txt]);

  const alteracoes = useMemo(() => [...txt].flatMap(([id, t]) => {
    const v = lerPercentual(t);
    if (v != null && Number.isNaN(v)) return [];
    const salvo = info.get(id)!.salvo;
    return (v ?? 0) === salvo ? [] : [{ servicoId: id, semana, valor: v }];
  }), [txt, info, semana]);
  const problemas = servicos.filter((s) => { const i = info.get(s.id)!; return i.invalido || i.total > 1 + 1e-9 || i.total < -1e-9; });

  useEffect(() => {
    if (!alteracoes.length) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [alteracoes.length]);

  const visiveis = servicos.filter((s) => {
    const i = info.get(s.id)!;
    if (filtro === "todos") return true;
    if (filtro === "semana") return i.previsto > 0 || i.atual !== 0 || txt.has(s.id);
    return i.total < 1 - 1e-9 || txt.has(s.id);
  });

  function gravar() {
    iniciar(async () => {
      const r = await salvar(alteracoes);
      if (r.erro) setMsg({ tom: "erro", texto: r.erro });
      else { setTxt(new Map()); setMsg({ tom: "ok", texto: r.mensagem ?? "Salvo." }); }
    });
  }

  const durTotal = servicos.reduce((t, s) => t + Math.max(s.duracao, 0), 0);
  // Avanço da obra nesta semana = Σ peso × % da semana (peso = duração ÷ duração total).
  const avancoSemana = durTotal > 0 ? servicos.reduce((t, s) => t + Math.max(s.duracao, 0) * (info.get(s.id)!.atual || 0), 0) / durTotal : 0;
  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <Link aria-label="Semana anterior" href={`${base}&semana=${Math.max(1, semana - 1)}`} className={clsx("rounded-lg border border-borda bg-white p-2 hover:bg-zinc-50", semana <= 1 && "pointer-events-none opacity-40")}><ChevronLeft className="size-4" /></Link>
        <div className="rounded-lg border border-borda bg-white px-4 py-1.5 text-center">
          <div className="text-sm font-semibold">Semana {semana}</div>
          <div className="text-xs text-suave">{ddmm(inicio)} a {ddmm(fim)}</div>
        </div>
        <Link aria-label="Próxima semana" href={`${base}&semana=${Math.min(totalSemanas, semana + 1)}`} className={clsx("rounded-lg border border-borda bg-white p-2 hover:bg-zinc-50", semana >= totalSemanas && "pointer-events-none opacity-40")}><ChevronRight className="size-4" /></Link>
        <div className="ml-auto flex rounded-lg border border-borda bg-white p-0.5 text-sm">
          {([["semana", "Desta semana"], ["andamento", "Em aberto"], ["todos", "Todos"]] as const).map(([k, r]) => (
            <button key={k} type="button" onClick={() => setFiltro(k)} className={clsx("rounded-md px-3 py-1", filtro === k ? "bg-marca text-white" : "text-suave hover:text-texto")}>{r}</button>
          ))}
        </div>
      </div>
      <p className="text-xs text-suave">
        &quot;Desta semana&quot; = serviços com previsto nesta semana ou já lançados nela. Informe quanto de cada serviço foi executado <b>nesta semana</b> (não o acumulado).
      </p>
      {msg && <div role="status" className={clsx("rounded-lg border px-4 py-2 text-sm", msg.tom === "erro" ? "border-red-200 bg-red-50 text-red-900" : "border-green-200 bg-green-50 text-green-900")}>{msg.texto}</div>}

      {etapas.map((e) => {
        const ss = visiveis.filter((s) => s.etapaId === e.id);
        if (!ss.length) return null;
        return (
          <section key={e.id} className="overflow-hidden rounded-xl border border-borda bg-white shadow-sm">
            <h3 className="border-b border-borda bg-zinc-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide">{e.nome}</h3>
            <ul className="divide-y divide-borda">
              {ss.map((s) => {
                const i = info.get(s.id)!;
                const erro = i.invalido || i.total > 1 + 1e-9 || i.total < -1e-9;
                const falta = Math.max(0, 1 - i.anterior - i.posterior);
                return (
                  <li key={s.id} className={clsx("grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center", erro && "bg-red-50")}>
                    <div className="min-w-0">
                      <div className="font-medium">{s.descricao}</div>
                      <div className="text-xs text-suave">{s.fornecedorNome ?? "Sem fornecedor"} · previsto nesta semana {pct.format(i.previsto)} · previsto até aqui {pct.format(i.previstoAte)}</div>
                      <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-zinc-100" title={`Antes: ${pct.format(i.anterior)} · nesta semana: ${pct.format(i.atual || 0)}`}>
                        <div className="bg-zinc-700" style={{ width: `${Math.min(i.anterior, 1) * 100}%` }} />
                        <div className="bg-destaque" style={{ width: `${Math.max(0, Math.min(i.atual || 0, 1 - i.anterior)) * 100}%` }} />
                      </div>
                      <div className="mt-1 text-xs text-suave">Acumulado: <b className={clsx(erro ? "text-perigo" : i.total >= 1 - 1e-9 ? "text-sucesso" : "text-texto")}>{pct.format(i.total)}</b>{i.posterior > 0 && ` (inclui ${pct.format(i.posterior)} lançado em semanas seguintes)`}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1">
                        <input value={txt.get(s.id) ?? percentualTexto(i.salvo)} disabled={!editavel} inputMode="decimal" aria-label={`${s.descricao}: % executado na semana ${semana}`}
                          onChange={(ev) => setTxt((m) => new Map(m).set(s.id, ev.target.value))} onFocus={(ev) => ev.target.select()}
                          className={clsx("tabular w-20 rounded-lg border px-2 py-2 text-right text-base", erro ? "border-red-300" : "border-borda", txt.has(s.id) && i.atual !== i.salvo && "bg-amber-50")} placeholder="0" />
                        <span className="text-sm text-suave">%</span>
                      </label>
                      {editavel && falta > 1e-9 && (
                        <button type="button" onClick={() => setTxt((m) => new Map(m).set(s.id, percentualTexto(falta)))} title="Lançar o que falta para 100%"
                          className="inline-flex items-center gap-1 rounded-lg border border-borda px-2.5 py-2 text-sm hover:bg-zinc-50"><Check className="size-4" /> Concluir</button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!visiveis.length && <p className="rounded-xl border border-borda bg-white px-4 py-10 text-center text-sm text-suave">Nenhum serviço neste filtro. Veja &quot;Todos&quot;.</p>}

      {editavel && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-borda bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <div className="text-sm text-suave">
              {problemas.length ? <span className="text-perigo">{problemas.length} serviço(s) acima de 100% ou com valor inválido</span>
                : alteracoes.length ? `${alteracoes.length} alteração(ões) não salva(s)` : "Tudo salvo"}
              <span className="hidden sm:inline"> · avanço da obra nesta semana: {pct.format(avancoSemana)}</span>
            </div>
            <button type="button" onClick={gravar} disabled={!alteracoes.length || salvando || problemas.length > 0}
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-marca px-5 py-2.5 font-medium text-white disabled:opacity-40">
              {salvando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar semana {semana}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


"use client";

import clsx from "clsx";
import { useActionState, useEffect, useOptimistic, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, Star, Trash2 } from "lucide-react";
import type { EstadoForm } from "@/lib/acoes";

const moedaCurta = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).replace(/\s/g, " ");
const tooltip = { borderRadius: 8, border: "1px solid #3f3f46", background: "#18181b", color: "#fafafa", fontSize: 12 };

/** Cartão de indicador com fundo em degradê e mini gráfico de área (estilo dashboard). */
export function KpiGradiente({ titulo, valor, detalhe, destaque, serie, chave, gradiente, textoEscuro, formato = "moeda" }: {
  titulo: string; valor: string; detalhe?: string; destaque?: string; serie: { rotulo: string; [k: string]: number | string | null }[]; chave: string;
  gradiente: [string, string]; textoEscuro?: boolean; formato?: "moeda" | "pct";
}) {
  const cor = textoEscuro ? "#161616" : "#ffffff";
  const id = `g-${chave}-${titulo.length}`;
  return (
    <section className="relative min-w-0 overflow-hidden rounded-xl p-4 shadow-lg" style={{ background: `linear-gradient(135deg, ${gradiente[0]}, ${gradiente[1]})`, color: cor }} aria-label={titulo}>
      <div className="text-sm font-semibold opacity-90">{titulo}</div>
      <div className="tabular mt-1 whitespace-nowrap text-2xl font-bold xl:text-3xl">{valor}</div>
      {destaque && <div className="mt-1 text-xs opacity-80">{destaque}</div>}
      {detalhe && <div className="text-sm font-semibold">{detalhe}</div>}
      <div className="-mx-4 -mb-4 mt-2 h-20">
        {serie.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={serie} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={cor} stopOpacity={0.55} /><stop offset="100%" stopColor={cor} stopOpacity={0.05} /></linearGradient></defs>
              <XAxis dataKey="rotulo" hide />
              <Tooltip contentStyle={tooltip} formatter={(v) => [formato === "pct" ? `${(Number(v) * 100).toFixed(1).replace(".", ",")}%` : moeda(Number(v)), titulo]} />
              <Area type="monotone" dataKey={chave} stroke={cor} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        ) : <div className="grid h-full place-items-center text-xs opacity-70">sem histórico ainda</div>}
      </div>
    </section>
  );
}

/** Medições: previsto × realizado (barras). */
export function GraficoMedicoesObra({ dados }: { dados: { rotulo: string; previsto: number; realizado: number | null }[] }) {
  return (
    <div style={{ height: 230 }} role="img" aria-label="Medições: previsto e realizado">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid stroke="#27272a" vertical={false} />
          <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: "#a1a1aa" }} axisLine={{ stroke: "#3f3f46" }} tickLine={false} />
          <YAxis tickFormatter={(v) => `R$ ${moedaCurta.format(v)}`} tick={{ fontSize: 10, fill: "#a1a1aa" }} width={58} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltip} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={(v, n) => [v == null ? "—" : moeda(Number(v)), String(n)]} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
          <Bar dataKey="previsto" name="Previsto" fill="#52525b" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="realizado" name="Realizado" fill="#f2d468" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Rosca da composição do contrato (quitado, a cobrar, a executar). */
export function RoscaSaldos({ partes }: { partes: { nome: string; valor: number; cor: string }[] }) {
  const total = partes.reduce((t, p) => t + p.valor, 0);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative size-36 shrink-0" role="img" aria-label="Composição do contrato">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={partes.filter((p) => p.valor > 0)} dataKey="valor" innerRadius="62%" outerRadius="100%" stroke="none" isAnimationActive={false}>
              {partes.filter((p) => p.valor > 0).map((p) => <Cell key={p.nome} fill={p.cor} />)}
            </Pie>
            <Tooltip contentStyle={tooltip} formatter={(v, n) => [moeda(Number(v)), String(n)]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full min-w-0 space-y-1.5 text-xs">
        {partes.map((p) => (
          <li key={p.nome} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: p.cor }} />
            <span className="min-w-0 flex-1 truncate text-zinc-300">{p.nome}</span>
            <span className="tabular text-zinc-100">{moeda(p.valor)}</span>
            <span className="tabular w-10 text-right text-zinc-400">{total > 0 ? `${Math.round((p.valor / total) * 100)}%` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Lembrete = { id: string; texto: string; importante: boolean; feito: boolean; semana: number; autor: string | null };

/** Itens importantes para não esquecer na semana: lembretes da equipe (marcar, excluir, incluir). */
export function LembretesSemana({ lembretes, semana, editavel, criar, marcar, excluir }: {
  lembretes: Lembrete[]; semana: number; editavel: boolean;
  criar: (e: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  marcar: (id: string, feito: boolean) => Promise<EstadoForm>;
  excluir: (id: string) => Promise<EstadoForm>;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [estado, executar, pendente] = useActionState(criar, {});
  const [lista, otimista] = useOptimistic(lembretes, (l: Lembrete[], m: { id: string; feito?: boolean; remover?: boolean }) =>
    m.remover ? l.filter((x) => x.id !== m.id) : l.map((x) => (x.id === m.id ? { ...x, feito: m.feito ?? x.feito } : x)));
  const [, iniciar] = useTransition();
  useEffect(() => { if (estado.ok) { form.current?.reset(); router.refresh(); } }, [estado, router]);

  return (
    <div className="space-y-2">
      {lista.length === 0 && <p className="text-xs text-zinc-500">Nenhum lembrete para esta semana.</p>}
      <ul className="space-y-1">
        {lista.map((l) => (
          <li key={l.id} className="group flex items-start gap-2 rounded-md px-1 py-1 hover:bg-white/5">
            <input type="checkbox" checked={l.feito} disabled={!editavel} aria-label={`Concluir: ${l.texto}`}
              onChange={(e) => { const v = e.target.checked; iniciar(async () => { otimista({ id: l.id, feito: v }); await marcar(l.id, v); router.refresh(); }); }}
              className="mt-0.5 size-4 shrink-0 accent-[#f2d468]" />
            <span className={clsx("min-w-0 flex-1 text-sm", l.feito ? "text-zinc-500 line-through" : "text-zinc-100")}>
              {l.importante && <Star className="mr-1 inline size-3.5 fill-[#f2d468] text-[#f2d468]" aria-label="Importante" />}
              {l.texto}
              {l.semana < semana && !l.feito && <span className="ml-1.5 rounded bg-amber-500/20 px-1 text-[10px] text-amber-300">da semana {l.semana}</span>}
            </span>
            {editavel && (
              <button type="button" title="Excluir" onClick={() => iniciar(async () => { otimista({ id: l.id, remover: true }); await excluir(l.id); router.refresh(); })}
                className="shrink-0 rounded p-0.5 text-zinc-500 opacity-0 hover:text-red-400 group-hover:opacity-100 focus:opacity-100"><Trash2 className="size-3.5" /></button>
            )}
          </li>
        ))}
      </ul>
      {editavel && (
        <form ref={form} action={executar} className="flex items-center gap-2 pt-1">
          <input name="texto" placeholder="Novo lembrete para a semana…" maxLength={300} aria-label="Novo lembrete" required
            className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-[#f2d468] focus:outline-none" />
          <label className="flex items-center gap-1 text-xs text-zinc-400" title="Marcar como importante"><input type="checkbox" name="importante" className="accent-[#f2d468]" /><Star className="size-3.5" /></label>
          <button disabled={pendente} className="inline-flex items-center gap-1 rounded-md bg-[#f2d468] px-2.5 py-1.5 text-sm font-medium text-zinc-900 disabled:opacity-50"><Plus className="size-4" />Incluir</button>
        </form>
      )}
      {estado.erro && <p role="alert" className="text-xs text-red-400">{estado.erro}</p>}
    </div>
  );
}

/** Seletor de semana (navega pela URL). */
export function SeletorSemana({ semana, total, atual, base }: { semana: number; total: number; atual: number; base: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-xs text-zinc-400">Semana
      <select aria-label="Semana" value={semana} onChange={(e) => router.push(`${base}?semana=${e.target.value}`)} className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100">
        {Array.from({ length: total }, (_, i) => i + 1).map((s) => <option key={s} value={s}>Semana {s}{s === atual ? " (atual)" : ""}</option>)}
      </select>
    </label>
  );
}

"use client";

import { CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const PRETO = "#161616";
const CINZA = "#a1a1aa";
const AMARELO = "#f2d468";
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Curva de avanço físico acumulado: previsto (cinza tracejado) × realizado (preto, até a semana atual). */
export function CurvaAvanco({ pontos, semanaAtual, altura = 280 }: {
  pontos: { semana: number; inicio: string; previsto: number; realizado: number | null }[]; semanaAtual: number; altura?: number;
}) {
  if (!pontos.length) return null;
  const dados = pontos.map((p) => ({ ...p, rotulo: ddmm(p.inicio) }));
  const atual = dados.find((d) => d.semana === semanaAtual)?.rotulo;
  return (
    <div style={{ height: altura }} role="img" aria-label="Curva de avanço físico acumulado, previsto e realizado">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#ececea" vertical={false} />
          <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: "#6b6b6b" }} interval="preserveStartEnd" minTickGap={12} tickLine={false} axisLine={{ stroke: "#e4e4e2" }} />
          <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v) => pct.format(v)} tick={{ fontSize: 10, fill: "#6b6b6b" }} width={40} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v, nome) => [v == null ? "—" : pct.format(Number(v)), nome === "previsto" ? "Previsto" : "Realizado"]}
            labelFormatter={(l, p) => `Semana ${(p?.[0]?.payload as { semana?: number })?.semana ?? ""} · ${l}`} contentStyle={{ borderRadius: 8, border: "1px solid #e4e4e2", fontSize: 12 }} />
          <Legend formatter={(v) => (v === "previsto" ? "Previsto" : "Realizado")} wrapperStyle={{ fontSize: 12 }} />
          {atual && <ReferenceLine x={atual} stroke={AMARELO} strokeWidth={8} strokeOpacity={0.6} />}
          <Line type="monotone" dataKey="previsto" stroke={CINZA} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="realizado" stroke={PRETO} strokeWidth={2.5} dot={{ r: 2.5, fill: PRETO }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Rosca de progresso da obra (realizado acumulado). */
export function RoscaProgresso({ valor, tamanho = 180 }: { valor: number; tamanho?: number }) {
  const v = Math.max(0, Math.min(valor, 1));
  return (
    <div className="relative mx-auto" style={{ width: tamanho, height: tamanho }} role="img" aria-label={`Progresso da obra: ${pct.format(v)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={[{ v }, { v: 1 - v }]} dataKey="v" innerRadius="72%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
            <Cell fill={PRETO} />
            <Cell fill="#ececea" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-3xl font-semibold">{pct.format(v)}</span>
        <span className="text-xs text-suave">concluído</span>
      </div>
    </div>
  );
}

/** Evolução por tipo de serviço: barra do realizado por etapa, com marca do previsto até a semana. */
export function EvolucaoEtapas({ etapas }: { etapas: { nome: string; realizado: number; previsto: number }[] }) {
  if (!etapas.length) return <p className="text-sm text-suave">Nenhuma etapa marcada para o relatório.</p>;
  return (
    <ul className="space-y-2" aria-label="Evolução por tipo de serviço">
      {etapas.map((e) => {
        const atrasada = e.realizado + 1e-6 < e.previsto;
        return (
          <li key={e.nome} className="grid grid-cols-[minmax(0,7.5rem)_1fr_3rem] items-center gap-2 text-sm sm:grid-cols-[minmax(0,11rem)_1fr_3.5rem] sm:gap-3">
            <span className="truncate text-xs uppercase tracking-wide text-suave" title={e.nome}>{e.nome}</span>
            <div className="relative h-3 rounded-full bg-zinc-100">
              <div className="h-3 rounded-full bg-zinc-800" style={{ width: `${Math.min(e.realizado, 1) * 100}%` }} />
              {e.previsto > 0 && <div className="absolute -top-1 h-5 w-0.5 bg-destaque-texto" style={{ left: `calc(${Math.min(e.previsto, 1) * 100}% - 1px)` }} title={`Previsto até a semana: ${pct.format(e.previsto)}`} />}
            </div>
            <span className={`tabular text-right font-medium ${atrasada ? "text-alerta" : ""}`}>{pct.format(e.realizado)}</span>
          </li>
        );
      })}
    </ul>
  );
}

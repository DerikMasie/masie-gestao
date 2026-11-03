"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const AZUL = "#2a78d6"; // passo 450 da rampa sequencial azul (série única)
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const compacta = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/** Barras horizontais de série única: valor contratado por situação da obra. */
export function GraficoSituacoes({ dados }: { dados: { rotulo: string; quantidade: number; valor: number }[] }) {
  const linhas = dados.filter((d) => d.quantidade > 0);
  if (!linhas.length) return <p className="py-8 text-center text-sm text-suave">Nenhuma obra no filtro selecionado.</p>;
  return (
    <div style={{ height: Math.max(linhas.length * 44 + 30, 140) }} role="img" aria-label="Valor contratado por situação da obra">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={linhas} layout="vertical" margin={{ top: 4, right: 72, bottom: 4, left: 4 }} barCategoryGap={10}>
          <CartesianGrid horizontal={false} stroke="#e2e8f0" />
          <XAxis type="number" tickFormatter={(v) => `R$ ${compacta.format(v)}`} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="rotulo" width={110} tick={{ fontSize: 12, fill: "#0f172a" }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(15,23,42,0.04)" }}
            formatter={(v, _n, item) => [`${moeda.format(Number(v))} · ${(item.payload as { quantidade: number }).quantidade} obra(s)`, "Contratado"]}
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
          />
          <Bar dataKey="valor" fill={AZUL} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            <LabelList dataKey="quantidade" position="right" formatter={(v) => `${v} obra(s)`} style={{ fontSize: 11, fill: "#64748b" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

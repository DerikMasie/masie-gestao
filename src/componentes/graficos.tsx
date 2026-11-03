"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COR_SERIE = "#3f3f46"; // série única em grafite (identidade preto/cinza); o amarelo fica para destaques
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
          <CartesianGrid horizontal={false} stroke="#e4e4e2" />
          <XAxis type="number" tickFormatter={(v) => `R$ ${compacta.format(v)}`} tick={{ fontSize: 11, fill: "#6b6b6b" }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="rotulo" width={110} tick={{ fontSize: 12, fill: "#161616" }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(15,23,42,0.04)" }}
            formatter={(v, _n, item) => [`${moeda.format(Number(v))} · ${(item.payload as { quantidade: number }).quantidade} obra(s)`, "Contratado"]}
            contentStyle={{ borderRadius: 8, border: "1px solid #e4e4e2", fontSize: 12 }}
          />
          <Bar dataKey="valor" fill={COR_SERIE} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            <LabelList dataKey="quantidade" position="right" formatter={(v) => `${v} obra(s)`} style={{ fontSize: 11, fill: "#6b6b6b" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import clsx from "clsx";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2, Save, Undo2 } from "lucide-react";
import { formatarMoeda, lerNumero } from "@/dominio/formato";
import type { EstadoForm } from "@/lib/acoes";

type AcaoForm = (estado: EstadoForm, fd: FormData) => Promise<EstadoForm>;

/** Situação da medição fechada: paga (com data) ou não paga. */
export function SituacaoMedicao({ acao, situacao, pagaEm, editavel, hoje }: { acao: AcaoForm; situacao: "PAGA" | "NAO_PAGA"; pagaEm: string | null; editavel: boolean; hoje: string }) {
  const [estado, executar, pendente] = useActionState(acao, {});
  const [sit, setSit] = useState(situacao);
  const [data, setData] = useState(pagaEm ?? hoje);
  if (!editavel) return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", situacao === "PAGA" ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-700")}>{situacao === "PAGA" ? `Paga ${pagaEm?.split("-").reverse().join("/")}` : "Não paga"}</span>;
  const mudou = sit !== situacao || (sit === "PAGA" && data !== pagaEm);
  return (
    <form action={executar} className="flex flex-wrap items-center gap-1.5">
      <select name="situacao" value={sit} onChange={(e) => setSit(e.target.value as "PAGA" | "NAO_PAGA")} aria-label="Situação"
        className={clsx("rounded-lg border px-2 py-1 text-xs font-medium", sit === "PAGA" ? "border-green-200 bg-green-50 text-green-800" : "border-borda bg-white")}>
        <option value="NAO_PAGA">Não paga</option>
        <option value="PAGA">Paga</option>
      </select>
      {sit === "PAGA" && <input type="date" name="pagaEm" value={data} onChange={(e) => setData(e.target.value)} aria-label="Data do pagamento" className="rounded-lg border border-borda px-1.5 py-0.5 text-xs" />}
      {mudou && <button disabled={pendente} className="rounded-lg bg-marca px-2 py-1 text-xs font-medium text-white disabled:opacity-50">{pendente ? "…" : "Salvar"}</button>}
      {estado.erro && <span role="alert" className="w-full text-xs text-perigo">{estado.erro}</span>}
    </form>
  );
}

/** Pagamentos a fornecedores por semana (bloco "Pagamentos – informar manualmente" do Gerencial). */
export function GradePagamentos({ fornecedores, semanas, semanaAtual, valores, apropriado, editavel, salvar }: {
  fornecedores: { id: string; nome: string }[]; semanas: { numero: number; inicio: string }[]; semanaAtual: number;
  valores: { fornecedorId: string; semana: number; valor: number }[]; apropriado: number[];
  editavel: boolean; salvar: (alteracoes: { fornecedorId: string; semana: number; valor: number | null }[]) => Promise<EstadoForm>;
}) {
  const [edicao, setEdicao] = useState<Map<string, string>>(new Map());
  const [msg, setMsg] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();
  const base = useMemo(() => new Map(valores.map((v) => [`${v.fornecedorId}|${v.semana}`, v.valor])), [valores]);
  const txt = (k: string) => edicao.get(k) ?? (base.has(k) ? String(base.get(k)).replace(".", ",") : "");
  const val = (k: string) => { const t = edicao.get(k); if (t == null) return base.get(k) ?? 0; const v = lerNumero(t); return v == null || Number.isNaN(v) ? 0 : v; };
  const alteracoes = [...edicao].flatMap(([k, t]) => {
    const [fornecedorId, s] = k.split("|") as [string, string];
    const v = lerNumero(t);
    if (v != null && (Number.isNaN(v) || v < 0)) return [];
    return (v ?? 0) === (base.get(k) ?? 0) ? [] : [{ fornecedorId, semana: Number(s), valor: v }];
  });
  const invalidas = [...edicao.values()].some((t) => { const v = lerNumero(t); return v != null && (Number.isNaN(v) || v < 0); });
  useEffect(() => {
    if (!alteracoes.length) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [alteracoes.length]);
  const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const curto = (v: number) => (Math.abs(v) < 0.005 ? "" : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }));

  if (!fornecedores.length) return <p className="px-5 py-6 text-sm text-suave">Nenhum fornecedor vinculado aos serviços da obra. Escolha o fornecedor de cada serviço na Planilha da obra.</p>;
  return (
    <div className="space-y-2">
      {editavel && (
        <div className="flex items-center gap-2 px-5 pt-3 text-sm">
          <button type="button" disabled={!alteracoes.length || salvando || invalidas} onClick={() => iniciar(async () => { const r = await salvar(alteracoes); if (r.erro) setMsg({ tom: "erro", texto: r.erro }); else { setEdicao(new Map()); setMsg({ tom: "ok", texto: r.mensagem ?? "Salvo." }); } })}
            className="inline-flex items-center gap-2 rounded-lg bg-marca px-3 py-1.5 font-medium text-white disabled:opacity-40">
            {salvando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{alteracoes.length ? `Salvar ${alteracoes.length} pagamento(s)` : "Nada a salvar"}
          </button>
          {alteracoes.length > 0 && <button type="button" onClick={() => setEdicao(new Map())} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-suave hover:bg-zinc-100"><Undo2 className="size-4" /> Descartar</button>}
          {msg && <span role="status" className={msg.tom === "erro" ? "text-perigo" : "text-sucesso"}>{msg.texto}</span>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0 text-xs">
          <thead className="bg-zinc-50">
            <tr>
              <th className="sticky left-0 z-10 min-w-40 border-b border-borda bg-zinc-50 px-3 py-1.5 text-left">Fornecedor</th>
              <th className="sticky left-40 z-10 min-w-24 border-r border-b border-borda bg-zinc-50 px-2 text-right">Total pago</th>
              {semanas.map((s) => <th key={s.numero} className={clsx("min-w-20 border-b border-l border-borda px-1 text-center font-semibold", s.numero === semanaAtual && "bg-destaque")}>Sem. {s.numero}<div className="font-normal text-suave">{ddmm(s.inicio)}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {fornecedores.map((f) => {
              const total = semanas.reduce((t, s) => t + val(`${f.id}|${s.numero}`), 0);
              return (
                <tr key={f.id}>
                  <td className="sticky left-0 z-10 border-b border-borda bg-white px-3 py-1 font-medium">{f.nome}</td>
                  <td className="sticky left-40 z-10 border-r border-b border-borda bg-white px-2 text-right tabular">{formatarMoeda(total)}</td>
                  {semanas.map((s) => {
                    const k = `${f.id}|${s.numero}`;
                    return (
                      <td key={s.numero} className={clsx("border-b border-l border-borda p-0", s.numero === semanaAtual && "bg-destaque-suave/60")}>
                        {editavel ? (
                          <input value={txt(k)} inputMode="decimal" aria-label={`Pagamento a ${f.nome} na semana ${s.numero}`} onFocus={(e) => e.target.select()}
                            onChange={(e) => setEdicao((m) => new Map(m).set(k, e.target.value))}
                            className={clsx("tabular h-7 w-20 bg-transparent px-1.5 text-right outline-none focus:bg-white focus:ring-2 focus:ring-destaque", edicao.has(k) && "bg-amber-100 font-semibold")} />
                        ) : <div className="h-7 px-1.5 text-right leading-7 tabular">{curto(val(k))}</div>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-zinc-50 font-semibold">
            <tr>
              <td className="sticky left-0 z-10 bg-zinc-50 px-3 py-1.5">Total pagamentos</td>
              <td className="sticky left-40 z-10 border-r border-borda bg-zinc-50 px-2 text-right tabular">{formatarMoeda(fornecedores.reduce((t, f) => t + semanas.reduce((x, s) => x + val(`${f.id}|${s.numero}`), 0), 0))}</td>
              {semanas.map((s) => <td key={s.numero} className="border-l border-borda px-1.5 text-right tabular">{curto(fornecedores.reduce((t, f) => t + val(`${f.id}|${s.numero}`), 0))}</td>)}
            </tr>
            <tr className="font-normal text-suave">
              <td className="sticky left-0 z-10 bg-zinc-50 px-3 py-1.5">Medições dos fornecedores</td>
              <td className="sticky left-40 z-10 border-r border-borda bg-zinc-50 px-2 text-right tabular">{formatarMoeda(apropriado.reduce((a, b) => a + b, 0))}</td>
              {semanas.map((s) => <td key={s.numero} className="border-l border-borda px-1.5 text-right tabular">{curto(apropriado[s.numero - 1] ?? 0)}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="px-5 pb-3 text-xs text-suave">Informe o valor pago a cada prestador na semana do pagamento. &quot;Medições dos fornecedores&quot; = MO acertada × % executado na semana (o que cada um produziu).</p>
    </div>
  );
}

const moedaCurta = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/** Cobrança por medição: previsto × realizado/fechado × reprojetado, com acumulados. */
export function GraficoCobranca({ dados }: { dados: { rotulo: string; previsto: number; realizado: number | null; reprojetado: number | null; acumPrevisto: number; acumReal: number | null }[] }) {
  return (
    <div style={{ height: 300 }} role="img" aria-label="Cobrança por medição: previsto, realizado e reprojetado">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#ececea" vertical={false} />
          <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: "#6b6b6b" }} tickLine={false} axisLine={{ stroke: "#e4e4e2" }} interval="preserveStartEnd" />
          <YAxis yAxisId="v" tickFormatter={(v) => `R$ ${moedaCurta.format(v)}`} tick={{ fontSize: 10, fill: "#6b6b6b" }} width={62} axisLine={false} tickLine={false} />
          <YAxis yAxisId="a" orientation="right" tickFormatter={(v) => `R$ ${moedaCurta.format(v)}`} tick={{ fontSize: 10, fill: "#a1a1aa" }} width={62} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v, n) => [v == null ? "—" : formatarMoeda(Number(v)), String(n)]} contentStyle={{ borderRadius: 8, border: "1px solid #e4e4e2", fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="v" dataKey="previsto" name="Previsto" fill="#d4d4d8" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar yAxisId="v" dataKey="realizado" name="Realizado" fill="#161616" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar yAxisId="v" dataKey="reprojetado" name="Reprojetado" fill="#f2d468" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Line yAxisId="a" type="monotone" dataKey="acumPrevisto" name="Acumulado previsto" stroke="#a1a1aa" strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          <Line yAxisId="a" type="monotone" dataKey="acumReal" name="Acumulado realizado" stroke="#161616" dot={false} connectNulls={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

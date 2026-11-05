import Link from "next/link";
import clsx from "clsx";
import { Building2, Hourglass, HardHat, Landmark, PiggyBank, Wallet } from "lucide-react";
import { CARGA, SITUACOES_BARRAS, type GrupoEngenheiro, type ResumoEmpresa, type ZonaCarga } from "@/dominio/painel-engenheiros";
import type { Ritmo } from "@/dominio/painel-obras";

/**
 * Painel por engenheiro em estilo "sala de controle" (fundo escuro), inspirado no modelo enviado pelo cliente.
 * Componente sem estado: funciona no painel da tela inicial e no modo TV.
 */

const COR_RITMO: Record<Ritmo, string> = { ATRASADA: "#ef4444", ATENCAO: "#f59e0b", NO_RITMO: "#22c55e", ADIANTADA: "#14b8a6", SEM_CRONOGRAMA: "#71717a" };
const COR_ZONA: Record<ZonaCarga, string> = { VERDE: "#22c55e", AMARELO: "#f59e0b", VERMELHO: "#ef4444" };
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).replace(/\s/g, " ");
const curta = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

function Kpi({ icone: I, valor, rotulo }: { icone: typeof HardHat; valor: string; rotulo: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-zinc-800 bg-[#1b1b1d] px-4 py-3">
      <I className="size-8 shrink-0 text-zinc-300" strokeWidth={1.5} aria-hidden />
      <div className="min-w-0">
        <div className="tabular whitespace-nowrap text-lg font-semibold text-destaque 2xl:text-xl">{valor}</div>
        <div className="text-xs leading-tight text-zinc-400">{rotulo}</div>
      </div>
    </div>
  );
}

/** Medidor (velocímetro) da quantidade de obras ativas do engenheiro. */
function Medidor({ n }: { n: number }) {
  const max = CARGA.maximo;
  const cx = 100, cy = 100, r = 78, esp = 26;
  const ang = (v: number) => Math.PI * (1 - Math.min(Math.max(v, 0), max) / max); // 0 → esquerda, max → direita
  const ponto = (v: number, raio: number) => [cx + raio * Math.cos(ang(v)), cy - raio * Math.sin(ang(v))] as const;
  const arco = (de: number, ate: number) => {
    const [x1, y1] = ponto(de, r), [x2, y2] = ponto(ate, r);
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const zonas: [number, number, string][] = [[0, CARGA.verdeAte + 0.5, COR_ZONA.VERDE], [CARGA.verdeAte + 0.5, CARGA.amareloAte + 0.5, COR_ZONA.AMARELO], [CARGA.amareloAte + 0.5, max, COR_ZONA.VERMELHO]];
  const [px, py] = ponto(n, r - 8);
  return (
    <svg viewBox="0 -14 200 142" className="h-32 w-full max-w-[220px]" role="img" aria-label={`Quantidade de obras ativas: ${n}`}>
      <text x={100} y={-3} textAnchor="middle" fontSize={10} fill="#a1a1aa">Obras ativas</text>
      {zonas.map(([a, b, c]) => <path key={a} d={arco(a, b)} stroke={c} strokeWidth={esp} fill="none" />)}
      {Array.from({ length: max + 1 }, (_, i) => { const [x1, y1] = ponto(i, r + esp / 2 - 1), [x2, y2] = ponto(i, r + esp / 2 - 6); return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0d0d0d" strokeWidth={1.2} />; })}
      <line x1={cx} y1={cy} x2={px} y2={py} stroke="#f4f4f5" strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={6} fill="#f4f4f5" />
      <rect x={84} y={108} width={32} height={18} rx={3} fill="#3f3f46" />
      <text x={100} y={121} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fafafa">{n}{n > max ? "+" : ""}</text>
    </svg>
  );
}

/** Barras verticais: quantidade de obras por situação. */
function BarrasSituacao({ valores, maximo }: { valores: number[]; maximo: number }) {
  const w = 236, h = 112, base = 64, larg = 18, esq = 16;
  const passo = (w - esq) / valores.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full" role="img" aria-label={`Obras por situação: ${SITUACOES_BARRAS.map((s, i) => `${s.rotulo} ${valores[i]}`).join(", ")}`}>
      <line x1={0} x2={w} y1={base} y2={base} stroke="#3f3f46" />
      {valores.map((v, i) => {
        const alt = maximo > 0 ? (v / maximo) * (base - 14) : 0;
        const x = esq + i * passo + (passo - larg) / 2;
        return (
          <g key={i}>
            {v > 0 && <rect x={x} y={base - alt} width={larg} height={alt} fill={SITUACOES_BARRAS[i]!.situacao === "EM_ANDAMENTO" ? "#f2d468" : "#38bdf8"} rx={1.5} />}
            <text x={x + larg / 2} y={base - alt - 3} textAnchor="middle" fontSize={9} fill="#e4e4e7">{v}</text>
            <text x={x + larg / 2 + 3} y={base + 8} textAnchor="end" fontSize={8} fill="#a1a1aa" transform={`rotate(-40 ${x + larg / 2 + 3} ${base + 8})`}>{SITUACOES_BARRAS[i]!.rotulo}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function PainelEngenheiros({ resumo, grupos, ritmos, linkObras = true }: {
  resumo: ResumoEmpresa; grupos: GrupoEngenheiro[]; ritmos: Record<string, { ritmo: Ritmo; realizado: number | null }>; linkObras?: boolean;
}) {
  const maxSituacao = Math.max(1, ...grupos.flatMap((g) => g.porSituacao));
  const maxValor = Math.max(1, ...grupos.flatMap((g) => g.obras.map((o) => o.valor)));
  return (
    <div className="rounded-2xl bg-[#0d0d0d] p-4 text-zinc-100 sm:p-5">
      <h2 className="mb-4 text-center text-sm font-semibold tracking-[0.3em] text-zinc-300">OBRAS DA EMPRESA</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icone={HardHat} valor={String(resumo.emExecucao)} rotulo="Obras em execução" />
        <Kpi icone={Hourglass} valor={String(resumo.aguardando)} rotulo="Obras aguardando" />
        <Kpi icone={Building2} valor={String(resumo.total)} rotulo="Total de obras" />
        <Kpi icone={Landmark} valor={moeda(resumo.receitaTotal)} rotulo="Receita total (contratos)" />
        <Kpi icone={PiggyBank} valor={moeda(resumo.receitaAguardando)} rotulo="Receita aguardando" />
        <Kpi icone={Wallet} valor={moeda(resumo.receitaAndamento)} rotulo="Receita em andamento" />
      </div>

      <div className="mt-4 space-y-3">
        {grupos.length === 0 && <p className="py-10 text-center text-sm text-zinc-400">Nenhuma obra visível.</p>}
        {grupos.map((g) => (
          <section key={g.id ?? "sem"} className="grid items-center gap-4 rounded-xl border border-zinc-800 bg-[#161618] p-3 md:grid-cols-[130px_minmax(0,1fr)_200px] 2xl:grid-cols-[140px_minmax(0,1fr)_minmax(0,1.6fr)_200px_190px]" aria-label={`Engenheiro ${g.nome}`}>
            <div className="flex items-center gap-3 md:flex-col md:items-center md:text-center">
              <div className="grid size-14 shrink-0 place-items-center rounded-full border-2 border-zinc-600 bg-zinc-800 text-lg font-semibold text-zinc-100">{g.iniciais}</div>
              <div className="min-w-0 text-sm font-medium leading-tight text-zinc-100">{g.nome}</div>
            </div>
            <div className="min-w-0"><BarrasSituacao valores={g.porSituacao} maximo={maxSituacao} /></div>
            <ul className="min-w-0 space-y-1 md:col-span-2 md:row-start-2 2xl:col-span-1 2xl:row-start-auto" aria-label="Obras e valores de contrato">
              {g.obras.slice(0, 8).map((o) => {
                const r = ritmos[o.id];
                const cor = r ? COR_RITMO[r.ritmo] : "#52525b";
                const conteudo = (
                  <>
                    <span className="w-40 shrink-0 truncate text-[11px] text-zinc-300" title={`${o.codigo} · ${o.nome}`}>{o.codigo} · {o.nome}</span>
                    <span className="relative h-3 min-w-16 flex-1 rounded-sm bg-zinc-800">
                      <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${Math.max((o.valor / maxValor) * 100, 1.5)}%`, background: cor }} />
                    </span>
                    <span className="tabular w-20 shrink-0 text-right text-[11px] text-zinc-200">{curta(o.valor)}</span>
                    <span className="tabular w-11 shrink-0 text-right text-[11px]" style={{ color: cor }}>{r?.realizado != null ? `${Math.round(r.realizado * 100)}%` : ""}</span>
                  </>
                );
                return <li key={o.id}>{linkObras ? <Link href={`/obras/${o.id}/painel`} className="flex items-center gap-2 rounded hover:bg-zinc-800/60">{conteudo}</Link> : <div className="flex items-center gap-2">{conteudo}</div>}</li>;
              })}
              {g.obras.length > 8 && <li className="text-[11px] text-zinc-400">+ {g.obras.length - 8} obra(s)</li>}
            </ul>
            <div className="flex justify-center md:col-start-3 md:row-start-1 2xl:col-start-auto 2xl:row-start-auto"><Medidor n={g.ativas} /></div>
            <div className="flex flex-col items-stretch gap-2 text-center md:col-start-3 md:row-start-2 2xl:col-start-auto 2xl:row-start-auto">
              <div className={clsx("tabular rounded-md px-3 py-2 text-2xl font-bold text-zinc-900")} style={{ background: "#f2d468" }}>
                {(g.percentual * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
              </div>
              <div className="text-[11px] text-zinc-400">Valor total de obras</div>
              <div className="tabular text-lg font-semibold text-zinc-100">{moeda(g.valorTotal)}</div>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[11px] text-zinc-400">
        <span>Barras das obras pelo ritmo:</span>
        {(["ATRASADA", "ATENCAO", "NO_RITMO", "ADIANTADA", "SEM_CRONOGRAMA"] as Ritmo[]).map((r) => (
          <span key={r} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: COR_RITMO[r] }} />{{ ATRASADA: "atrasada", ATENCAO: "atenção", NO_RITMO: "no ritmo", ADIANTADA: "adiantada", SEM_CRONOGRAMA: "sem cronograma / inativa" }[r]}</span>
        ))}
        <span>· Medidor: verde até {CARGA.verdeAte} obras ativas, amarelo até {CARGA.amareloAte}, vermelho acima · % = participação na receita total</span>
      </div>
    </div>
  );
}

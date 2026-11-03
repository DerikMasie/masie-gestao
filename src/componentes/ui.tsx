import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

export function CabecalhoPagina({ titulo, subtitulo, acoes, voltar }: { titulo: ReactNode; subtitulo?: ReactNode; acoes?: ReactNode; voltar?: { href: string; rotulo: string } }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {voltar && <Link href={voltar.href} className="mb-1 inline-block text-sm text-suave hover:text-texto">← {voltar.rotulo}</Link>}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-suave">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Cartao({ titulo, acoes, children, className, semPadding }: { titulo?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string; semPadding?: boolean }) {
  return (
    <section className={clsx("min-w-0 rounded-xl border border-borda bg-superficie shadow-sm", className)}>
      {(titulo || acoes) && (
        <div className="flex items-center justify-between gap-2 border-b border-borda px-5 py-3">
          <h2 className="text-sm font-semibold">{titulo}</h2>
          {acoes}
        </div>
      )}
      <div className={semPadding ? "" : "p-5"}>{children}</div>
    </section>
  );
}

type Variante = "primario" | "secundario" | "perigo" | "fantasma";
const estiloBotao: Record<Variante, string> = {
  primario: "bg-marca text-white hover:opacity-90",
  secundario: "border border-borda bg-white text-texto hover:bg-zinc-50",
  perigo: "bg-perigo text-white hover:opacity-90",
  fantasma: "text-texto hover:bg-zinc-100",
};
const baseBotao = "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

export function Botao({ variante = "primario", className, ...p }: ComponentProps<"button"> & { variante?: Variante }) {
  return <button className={clsx(baseBotao, estiloBotao[variante], className)} {...p} />;
}

export function LinkBotao({ variante = "primario", className, ...p }: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={clsx(baseBotao, estiloBotao[variante], className)} {...p} />;
}

const tons = {
  cinza: "bg-zinc-100 text-zinc-700",
  destaque: "bg-destaque-suave text-destaque-texto",
  azul: "bg-zinc-800 text-white",
  verde: "bg-green-50 text-green-700",
  amarelo: "bg-amber-50 text-amber-800",
  vermelho: "bg-red-50 text-red-700",
  roxo: "bg-zinc-200 text-zinc-800",
} as const;
export type Tom = keyof typeof tons;

export function Selo({ tom = "cinza", children }: { tom?: Tom; children: ReactNode }) {
  return <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tons[tom])}>{children}</span>;
}

export function Indicador({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; tom?: "perigo" | "alerta" | "sucesso" }) {
  return (
    <div className="min-w-0 rounded-xl border border-borda bg-superficie p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-suave">{rotulo}</div>
      <div className={clsx("tabular mt-1 text-lg font-semibold [overflow-wrap:normal] sm:text-2xl", tom === "perigo" && "text-perigo", tom === "alerta" && "text-alerta", tom === "sucesso" && "text-sucesso")}>{valor}</div>
      {detalhe && <div className="mt-1 text-xs text-suave">{detalhe}</div>}
    </div>
  );
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-medium">{titulo}</p>
      {children && <div className="mt-2 text-sm text-suave">{children}</div>}
    </div>
  );
}

export function Tabela({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm [&_td]:px-4 [&_td]:py-2.5 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-suave [&_thead]:bg-zinc-50 [&_tbody_tr]:border-t [&_tbody_tr]:border-borda [&_tbody_tr:hover]:bg-destaque-suave/40">
        {children}
      </table>
    </div>
  );
}

/** Cabeçalho de coluna ordenável via query string (?ordem=campo&dir=asc). */
export function ColunaOrdenavel({ campo, rotulo, params, base, className }: { campo: string; rotulo: string; params: Record<string, string | undefined>; base: string; className?: string }) {
  const ativa = params.ordem === campo;
  const dir = ativa && params.dir === "asc" ? "desc" : "asc";
  const q = new URLSearchParams(Object.entries({ ...params, ordem: campo, dir }).filter(([, v]) => v) as [string, string][]);
  return (
    <th className={className}>
      <Link href={`${base}?${q}`} className="inline-flex items-center gap-1 hover:text-texto">
        {rotulo}
        <span aria-hidden className={ativa ? "text-texto" : "opacity-30"}>{ativa && params.dir === "asc" ? "▲" : "▼"}</span>
      </Link>
    </th>
  );
}

export function Dl({ itens }: { itens: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {itens.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium uppercase tracking-wide text-suave">{k}</dt>
          <dd className="mt-0.5 text-sm">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Abas({ abas, ativa, base }: { abas: { id: string; rotulo: string }[]; ativa: string; base: string }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-borda">
      {abas.map((a) => (
        <Link key={a.id} href={`${base}?aba=${a.id}`}
          className={clsx("whitespace-nowrap border-b-[3px] px-4 py-2 text-sm font-medium", a.id === ativa ? "border-destaque text-texto" : "border-transparent text-suave hover:text-texto")}>
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}

export function Aviso({ tom = "info", children }: { tom?: "info" | "alerta" | "perigo" | "sucesso"; children: ReactNode }) {
  const c = { info: "border-blue-200 bg-blue-50 text-blue-900", alerta: "border-amber-200 bg-amber-50 text-amber-900", perigo: "border-red-200 bg-red-50 text-red-900", sucesso: "border-green-200 bg-green-50 text-green-900" }[tom];
  return <div className={clsx("rounded-lg border px-4 py-3 text-sm", c)}>{children}</div>;
}

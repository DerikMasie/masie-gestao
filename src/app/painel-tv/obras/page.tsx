import Link from "next/link";
import clsx from "clsx";
import { db } from "@/db";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { dadosPainelObra } from "@/servicos/painel-obra";
import { painelObras } from "@/servicos/painel-obras";
import { LogoMasie } from "@/componentes/logo";
import { RolagemTv } from "@/componentes/rolagem-tv";
import { ConteudoPainelObra } from "@/app/(app)/obras/[id]/painel/conteudo";

export const metadata = { title: "Painel por obra — modo TV" };
export const dynamic = "force-dynamic";

/**
 * Modo TV por obra: mostra o painel de cada obra ativa em tela cheia e passa para a próxima a cada `intervalo`
 * segundos (padrão 60; de 15 a 600). A troca recarrega a página, então os dados estão sempre atualizados.
 * Parâmetros: ?i=posição&intervalo=segundos.
 */
export default async function TvPorObra({ searchParams }: { searchParams: Promise<{ i?: string; intervalo?: string }> }) {
  const sp = await searchParams;
  const u = await exigirPermissaoPagina("dashboard");
  const acesso = { id: u.id, empresaId: u.empresaId, acessoTodasObras: u.perfil.acessoTodasObras };
  const obras = (await painelObras(db, acesso)).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const intervalo = Math.min(Math.max(Number(sp.intervalo) || 60, 15), 600);
  if (!obras.length) {
    return <main className="grid min-h-screen place-items-center bg-[#0d0d11] text-zinc-300"><meta httpEquiv="refresh" content={String(intervalo)} />Nenhuma obra ativa para exibir.</main>;
  }
  const i = ((Math.trunc(Number(sp.i) || 0) % obras.length) + obras.length) % obras.length;
  const proxima = (i + 1) % obras.length;
  const d = await dadosPainelObra(db, acesso, obras[i]!.id);
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  const url = (k: number) => `/painel-tv/obras?i=${k}&intervalo=${intervalo}`;

  return (
    <main className="min-h-screen bg-[#0d0d11] px-6 pb-6 pt-4">
      <meta httpEquiv="refresh" content={`${intervalo};url=${url(proxima)}`} />
      <style>{`@keyframes masie-barra { from { width: 0% } to { width: 100% } }`}</style>
      <div className="fixed inset-x-0 top-0 h-1 bg-zinc-800"><div className="h-1 bg-[#f2d468]" style={{ animation: `masie-barra ${intervalo}s linear forwards` }} /></div>
      <header className="mb-4 flex flex-wrap items-center gap-4">
        <LogoMasie claro compacto />
        <nav className="flex flex-wrap items-center gap-1.5" aria-label="Obras em exibição">
          {obras.map((o, k) => (
            <Link key={o.id} href={url(k)} className={clsx("rounded-full px-2.5 py-1 text-xs font-medium", k === i ? "bg-[#f2d468] text-zinc-900" : "bg-zinc-800 text-zinc-400 hover:text-zinc-100")}>{o.codigo}</Link>
          ))}
        </nav>
        <div className="ml-auto text-right text-xs text-zinc-400">
          <div>Obra {i + 1} de {obras.length} · próxima em {intervalo}s: <span className="text-zinc-200">{obras[proxima]!.codigo}</span></div>
          <div>Atualizado em {agora}</div>
        </div>
      </header>
      <RolagemTv segundos={intervalo} />
      <ConteudoPainelObra d={d} tv verValores={temPermissao(u, "medicoes") && temPermissao(u, "orcamentos")} editaLembretes={false} />
    </main>
  );
}

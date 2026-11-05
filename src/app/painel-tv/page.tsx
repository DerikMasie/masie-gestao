import { db } from "@/db";
import { hojeIso } from "@/dominio/calendario";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { painelEngenheiros } from "@/servicos/painel-engenheiros";
import { painelObras } from "@/servicos/painel-obras";
import { PainelEngenheiros } from "@/componentes/painel-engenheiros";
import { LogoMasie } from "@/componentes/logo";

export const metadata = { title: "Painel — modo TV" };
export const dynamic = "force-dynamic";

/** Painel por engenheiro em tela cheia para a TV do escritório; recarrega sozinho a cada 5 minutos. */
export default async function PainelTv() {
  const u = await exigirPermissaoPagina("dashboard");
  const acesso = { id: u.id, empresaId: u.empresaId, acessoTodasObras: u.perfil.acessoTodasObras };
  if (!temPermissao(u, "medicoes") || !temPermissao(u, "orcamentos")) {
    return <main className="grid min-h-screen place-items-center bg-[#0d0d0d] text-zinc-300">Seu perfil não tem acesso aos valores das obras.</main>;
  }
  const [eng, cartoes] = await Promise.all([painelEngenheiros(db, acesso), painelObras(db, acesso, hojeIso())]);
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  return (
    <main className="min-h-screen bg-[#0d0d0d] p-4 sm:p-6">
      <meta httpEquiv="refresh" content="300" />
      <div className="mb-3 flex items-center justify-between">
        <LogoMasie claro compacto />
        <span className="text-xs text-zinc-400">Atualizado em {agora} · atualiza a cada 5 minutos</span>
      </div>
      <PainelEngenheiros resumo={eng.resumo} grupos={eng.grupos} linkObras={false}
        ritmos={Object.fromEntries(cartoes.map((c) => [c.id, { ritmo: c.ritmo, realizado: c.realizado }]))} />
    </main>
  );
}

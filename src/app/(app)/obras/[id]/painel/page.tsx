import { notFound } from "next/navigation";
import { db } from "@/db";
import { exigirPermissaoPagina, podeAcessarObra, temPermissao } from "@/lib/auth/atual";
import { dadosPainelObra } from "@/servicos/painel-obra";
import { ConteudoPainelObra } from "./conteudo";

export const metadata = { title: "Painel da obra" };

export default async function PainelDaObra({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ semana?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const u = await exigirPermissaoPagina("obras");
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await podeAcessarObra(u, id))) notFound();
  const acesso = { id: u.id, empresaId: u.empresaId, acessoTodasObras: u.perfil.acessoTodasObras };
  const d = await dadosPainelObra(db, acesso, id, sp.semana ? Number(sp.semana) : undefined).catch(() => null);
  if (!d) notFound();
  return <ConteudoPainelObra d={d} verValores={temPermissao(u, "medicoes") && temPermissao(u, "orcamentos")} editaLembretes={temPermissao(u, "planejamento", "editar")} />;
}

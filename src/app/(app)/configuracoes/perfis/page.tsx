import Link from "next/link";
import { db } from "@/db";
import { MODULOS, type Modulo } from "@/dominio/permissoes";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { listarPerfis } from "@/servicos/usuarios";
import { Aviso, CabecalhoPagina, Cartao, LinkBotao, Selo } from "@/componentes/ui";

export const metadata = { title: "Perfis e permissões" };

export default async function PaginaPerfis({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const u = await exigirPermissaoPagina("usuarios");
  const { salvo } = await searchParams;
  const perfis = await listarPerfis(db, u.empresaId);
  return (
    <>
      <CabecalhoPagina titulo="Perfis e permissões" subtitulo="Permissões configuráveis por módulo; o acesso por obra é definido no perfil e nos vínculos de cada obra."
        acoes={temPermissao(u, "usuarios", "criar") && <LinkBotao href="/configuracoes/perfis/novo">+ Novo perfil</LinkBotao>} />
      {salvo && <div className="mb-4"><Aviso tom="sucesso">Perfil salvo.</Aviso></div>}
      <div className="grid gap-4 md:grid-cols-2">
        {perfis.map((p) => (
          <Cartao key={p.id} titulo={<Link href={`/configuracoes/perfis/${p.id}`} className="hover:text-marca">{p.nome}</Link>}
            acoes={<span className="flex gap-1">{p.sistema && <Selo>Padrão</Selo>}<Selo tom="azul">{p.usuarios} usuário(s)</Selo></span>}>
            <p className="text-sm text-suave">{p.descricao}</p>
            <p className="mt-2 text-sm">{p.acessoTodasObras ? "Acesso a todas as obras" : "Somente obras vinculadas"}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {(Object.keys(p.permissoes) as Modulo[]).map((m) => <Selo key={m}>{MODULOS[m]}</Selo>)}
            </div>
          </Cartao>
        ))}
      </div>
    </>
  );
}

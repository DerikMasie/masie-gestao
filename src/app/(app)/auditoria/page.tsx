import Link from "next/link";
import { db } from "@/db";
import { exigirPermissaoPagina } from "@/lib/auth/atual";
import { listarAuditoria } from "@/servicos/painel";
import { listarUsuarios } from "@/servicos/usuarios";
import { AuditoriaLista } from "@/componentes/auditoria-lista";
import { CabecalhoPagina, Cartao } from "@/componentes/ui";

export const metadata = { title: "Auditoria" };

const ENTIDADES = [["obra", "Obras"], ["cliente", "Clientes"], ["fornecedor", "Fornecedores"], ["usuario", "Usuários"], ["perfil", "Perfis"], ["empresa", "Empresa"], ["etapa_padrao", "Etapas padrão"], ["usuario_obra", "Equipe de obra"]] as const;

export default async function PaginaAuditoria({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirPermissaoPagina("auditoria");
  const p = await searchParams;
  const pagina = Math.max(1, Number(p.pagina) || 1);
  const [linhas, usuarios] = await Promise.all([
    listarAuditoria(db, u.empresaId, { entidade: p.entidade || undefined, usuarioId: p.usuario || undefined, de: p.de || undefined, ate: p.ate || undefined, pagina, limite: 50 }),
    listarUsuarios(db, u.empresaId),
  ]);
  const temMais = linhas.length > 50;
  const qs = (n: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(p).filter(([, v]) => v)) as Record<string, string>, pagina: String(n) })}`;
  return (
    <>
      <CabecalhoPagina titulo="Auditoria" subtitulo="Registro de ações dos usuários: criações, edições (com valor anterior e novo), exclusões, logins e acessos a dados sensíveis." />
      <Cartao semPadding>
        <form className="flex flex-wrap items-end gap-2 border-b border-borda p-3 text-sm">
          <select name="entidade" defaultValue={p.entidade ?? ""} className="rounded-lg border border-borda px-2 py-1.5"><option value="">Todos os registros</option>{ENTIDADES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
          <select name="usuario" defaultValue={p.usuario ?? ""} className="rounded-lg border border-borda px-2 py-1.5"><option value="">Todos os usuários</option>{usuarios.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
          <input type="date" name="de" defaultValue={p.de} className="rounded-lg border border-borda px-2 py-1.5" aria-label="De" />
          <input type="date" name="ate" defaultValue={p.ate} className="rounded-lg border border-borda px-2 py-1.5" aria-label="Até" />
          <button className="rounded-lg bg-marca px-3 py-1.5 font-medium text-white">Filtrar</button>
        </form>
        <AuditoriaLista linhas={linhas.slice(0, 50)} mostrarEntidade />
        <div className="flex justify-between border-t border-borda px-5 py-3 text-sm">
          {pagina > 1 ? <Link href={qs(pagina - 1)} className="font-medium underline decoration-destaque decoration-2 underline-offset-4">← Mais recentes</Link> : <span />}
          {temMais && <Link href={qs(pagina + 1)} className="font-medium underline decoration-destaque decoration-2 underline-offset-4">Mais antigos →</Link>}
        </div>
      </Cartao>
    </>
  );
}

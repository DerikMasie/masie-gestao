import Link from "next/link";
import { db } from "@/db";
import { formatarDocumento } from "@/dominio/documentos";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { listarClientes } from "@/servicos/cadastros";
import { Aviso, CabecalhoPagina, Cartao, LinkBotao, Tabela, Vazio } from "@/componentes/ui";

export const metadata = { title: "Clientes" };

export default async function PaginaClientes({ searchParams }: { searchParams: Promise<{ q?: string; salvo?: string }> }) {
  const u = await exigirPermissaoPagina("clientes");
  const { q, salvo } = await searchParams;
  const clientes = await listarClientes(db, u.empresaId, q?.slice(0, 100));
  return (
    <>
      <CabecalhoPagina titulo="Clientes" subtitulo={`${clientes.length} cliente(s)`} acoes={temPermissao(u, "clientes", "criar") && <LinkBotao href="/clientes/novo">+ Novo cliente</LinkBotao>} />
      {salvo && <div className="mb-4"><Aviso tom="sucesso">Cliente “{salvo}” salvo.</Aviso></div>}
      <Cartao semPadding>
        <form className="flex gap-2 border-b border-borda p-3">
          <input name="q" defaultValue={q} placeholder="Buscar por nome, CPF/CNPJ ou e-mail…" className="flex-1 rounded-lg border border-borda px-3 py-1.5 text-sm" />
          <button className="rounded-lg bg-marca px-3 py-1.5 text-sm font-medium text-white">Buscar</button>
        </form>
        {clientes.length === 0 ? <Vazio titulo="Nenhum cliente encontrado" /> : (
          <Tabela>
            <thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>E-mail</th><th>Telefone</th></tr></thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/clientes/${c.id}`} className="font-medium text-texto underline-offset-4 hover:underline decoration-destaque decoration-2">{c.nome}</Link></td>
                  <td className="tabular whitespace-nowrap">{c.documento ? formatarDocumento(c.documento) : "—"}</td>
                  <td className="text-suave">{c.email ?? "—"}</td><td className="whitespace-nowrap text-suave">{c.telefone ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Cartao>
    </>
  );
}

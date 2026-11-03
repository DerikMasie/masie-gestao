import Link from "next/link";
import { Lock } from "lucide-react";
import { db } from "@/db";
import { formatarDocumento } from "@/dominio/documentos";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { especialidadesFornecedores, listarFornecedores } from "@/servicos/cadastros";
import { Aviso, CabecalhoPagina, Cartao, LinkBotao, Selo, Tabela, Vazio } from "@/componentes/ui";

export const metadata = { title: "Fornecedores" };

export default async function PaginaFornecedores({ searchParams }: { searchParams: Promise<{ q?: string; esp?: string; salvo?: string; inativos?: string }> }) {
  const u = await exigirPermissaoPagina("fornecedores");
  const p = await searchParams;
  const [lista, especialidades] = await Promise.all([
    listarFornecedores(db, u.empresaId, { q: p.q?.slice(0, 100), especialidade: p.esp || undefined, ativos: !p.inativos }),
    especialidadesFornecedores(db, u.empresaId),
  ]);
  return (
    <>
      <CabecalhoPagina titulo="Fornecedores" subtitulo={`${lista.length} fornecedor(es) · cadastro único para todas as obras`}
        acoes={temPermissao(u, "fornecedores", "criar") && <LinkBotao href="/fornecedores/novo">+ Novo fornecedor</LinkBotao>} />
      {p.salvo && <div className="mb-4"><Aviso tom="sucesso">Fornecedor “{p.salvo}” salvo.</Aviso></div>}
      <Cartao semPadding>
        <form className="flex flex-wrap gap-2 border-b border-borda p-3 text-sm">
          <input name="q" defaultValue={p.q} placeholder="Buscar por nome, razão social, especialidade ou documento…" className="min-w-60 flex-1 rounded-lg border border-borda px-3 py-1.5" />
          <select name="esp" defaultValue={p.esp ?? ""} className="rounded-lg border border-borda px-2 py-1.5">
            <option value="">Todas as especialidades</option>
            {especialidades.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <label className="flex items-center gap-1.5 px-1"><input type="checkbox" name="inativos" value="1" defaultChecked={Boolean(p.inativos)} /> Incluir inativos</label>
          <button className="rounded-lg bg-marca px-3 py-1.5 font-medium text-white">Filtrar</button>
        </form>
        {lista.length === 0 ? <Vazio titulo="Nenhum fornecedor encontrado" /> : (
          <Tabela>
            <thead><tr><th>Nome</th><th>Especialidade</th><th>CPF/CNPJ</th><th>Contato</th><th>Situação</th></tr></thead>
            <tbody>
              {lista.map((f) => (
                <tr key={f.id}>
                  <td><Link href={`/fornecedores/${f.id}`} className="font-medium text-texto underline-offset-4 hover:underline decoration-destaque decoration-2">{f.nome}</Link>{f.razaoSocial && <div className="text-xs text-suave">{f.razaoSocial}</div>}</td>
                  <td>{f.especialidade ?? "—"}</td>
                  <td className="tabular whitespace-nowrap">{f.documento ? formatarDocumento(f.documento) : "—"}</td>
                  <td className="text-suave">{f.telefone ?? f.email ?? "—"}{f.temDadosBancarios && <Lock className="ml-1 inline size-3" aria-label="Possui dados bancários protegidos" />}</td>
                  <td>{f.ativo ? <Selo tom="verde">Ativo</Selo> : <Selo>Inativo</Selo>}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Cartao>
    </>
  );
}

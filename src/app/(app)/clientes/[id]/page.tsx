import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { obra } from "@/db/schema";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { obterCliente } from "@/servicos/cadastros";
import { filtroAcessoObras } from "@/servicos/obras";
import { AcaoConfirmada } from "@/componentes/formulario";
import { SeloSituacao } from "@/componentes/rotulos";
import { CabecalhoPagina, Cartao } from "@/componentes/ui";
import { excluirClienteAcao, salvarClienteAcao } from "../acoes";
import { FormCliente } from "../form-cliente";

export const metadata = { title: "Cliente" };

export default async function EditarCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await exigirPermissaoPagina("clientes");
  const c = /^[0-9a-f-]{36}$/.test(id) ? await obterCliente(db, u.empresaId, id) : null;
  if (!c) notFound();
  const obras = await db.select({ id: obra.id, codigo: obra.codigo, nome: obra.nome, situacao: obra.situacao }).from(obra)
    .where(and(eq(obra.clienteId, id), isNull(obra.excluidoEm), filtroAcessoObras(u.id, u.perfil.acessoTodasObras)));
  const podeEditar = temPermissao(u, "clientes", "editar");
  return (
    <div className="max-w-4xl space-y-6">
      <CabecalhoPagina titulo={c.nome} voltar={{ href: "/clientes", rotulo: "Clientes" }}
        acoes={temPermissao(u, "clientes", "excluir") && obras.length === 0 && <AcaoConfirmada acao={excluirClienteAcao.bind(null, id)} confirmacao={`Excluir o cliente ${c.nome}?`} variante="secundario">Excluir</AcaoConfirmada>} />
      {podeEditar ? <FormCliente acao={salvarClienteAcao.bind(null, id)} c={c} /> : <Cartao><p className="text-sm">{c.email} · {c.telefone}</p></Cartao>}
      <Cartao titulo={`Obras do cliente · ${obras.length}`}>
        {obras.length === 0 ? <p className="text-sm text-suave">Nenhuma obra.</p> : (
          <ul className="space-y-1 text-sm">{obras.map((o) => <li key={o.id} className="flex items-center gap-2"><Link href={`/obras/${o.id}`} className="text-marca hover:underline">{o.codigo} · {o.nome}</Link><SeloSituacao situacao={o.situacao} /></li>)}</ul>
        )}
      </Cartao>
    </div>
  );
}

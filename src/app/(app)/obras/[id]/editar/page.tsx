import { notFound } from "next/navigation";
import { db } from "@/db";
import { exigirPermissaoPagina, podeAcessarObra } from "@/lib/auth/atual";
import { listarClientes } from "@/servicos/cadastros";
import { obterObra } from "@/servicos/obras";
import { listarUsuariosAtivos } from "@/servicos/usuarios";
import { CabecalhoPagina } from "@/componentes/ui";
import { editarObraAcao } from "../../acoes";
import { FormObra } from "../../form-obra";

export const metadata = { title: "Editar obra" };

export default async function EditarObra({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await exigirPermissaoPagina("obras", "editar");
  const dados = /^[0-9a-f-]{36}$/.test(id) ? await obterObra(db, u.empresaId, id) : null;
  if (!dados || !(await podeAcessarObra(u, id))) notFound();
  const [clientes, usuarios] = await Promise.all([listarClientes(db, u.empresaId), listarUsuariosAtivos(db, u.empresaId)]);
  return (
    <div className="max-w-5xl">
      <CabecalhoPagina titulo={`Editar ${dados.obra.codigo}`} subtitulo={dados.obra.nome} voltar={{ href: `/obras/${id}`, rotulo: "Voltar à obra" }} />
      <FormObra acao={editarObraAcao.bind(null, id)} obra={dados.obra} clientes={clientes} usuarios={usuarios} cancelar={`/obras/${id}`} />
    </div>
  );
}

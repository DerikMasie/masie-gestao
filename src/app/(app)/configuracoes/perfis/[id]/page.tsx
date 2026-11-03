import { notFound } from "next/navigation";
import { db } from "@/db";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { listarPerfis } from "@/servicos/usuarios";
import { AcaoConfirmada } from "@/componentes/formulario";
import { Aviso, CabecalhoPagina } from "@/componentes/ui";
import { excluirPerfilAcao, salvarPerfilAcao } from "../../acoes";
import { FormPerfil } from "../form-perfil";

export const metadata = { title: "Perfil" };

export default async function EditarPerfil({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await exigirPermissaoPagina("usuarios");
  const p = (await listarPerfis(db, u.empresaId)).find((x) => x.id === id);
  if (!p) notFound();
  const admin = p.nome === "Administrador";
  return (
    <div className="max-w-4xl">
      <CabecalhoPagina titulo={p.nome} subtitulo={`${p.usuarios} usuário(s) com este perfil`} voltar={{ href: "/configuracoes/perfis", rotulo: "Perfis" }}
        acoes={!p.sistema && temPermissao(u, "usuarios", "excluir") && <AcaoConfirmada acao={excluirPerfilAcao.bind(null, id)} confirmacao={`Excluir o perfil ${p.nome}?`} variante="secundario">Excluir</AcaoConfirmada>} />
      {admin && <div className="mb-4"><Aviso>O perfil Administrador tem acesso completo e não pode ser alterado, para evitar que a empresa perca o controle do sistema.</Aviso></div>}
      <FormPerfil acao={salvarPerfilAcao.bind(null, id)} perfil={p} bloqueado={admin || !temPermissao(u, "usuarios", "editar")} />
    </div>
  );
}

import { exigirPermissaoPagina } from "@/lib/auth/atual";
import { CabecalhoPagina } from "@/componentes/ui";
import { salvarPerfilAcao } from "../../acoes";
import { FormPerfil } from "../form-perfil";

export const metadata = { title: "Novo perfil" };

export default async function NovoPerfil() {
  await exigirPermissaoPagina("usuarios", "criar");
  return (
    <div className="max-w-4xl">
      <CabecalhoPagina titulo="Novo perfil" voltar={{ href: "/configuracoes/perfis", rotulo: "Perfis" }} />
      <FormPerfil acao={salvarPerfilAcao.bind(null, null)} />
    </div>
  );
}

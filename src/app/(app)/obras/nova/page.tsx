import { db } from "@/db";
import { exigirPermissaoPagina } from "@/lib/auth/atual";
import { listarClientes } from "@/servicos/cadastros";
import { listarUsuariosAtivos } from "@/servicos/usuarios";
import { Aviso, CabecalhoPagina } from "@/componentes/ui";
import { criarObraAcao } from "../acoes";
import { FormObra } from "../form-obra";

export const metadata = { title: "Nova obra" };

export default async function NovaObra() {
  const u = await exigirPermissaoPagina("obras", "criar");
  const [clientes, usuarios] = await Promise.all([listarClientes(db, u.empresaId), listarUsuariosAtivos(db, u.empresaId)]);
  return (
    <div className="max-w-5xl">
      <CabecalhoPagina titulo="Nova obra" voltar={{ href: "/obras", rotulo: "Obras" }} />
      <div className="mb-4">
        <Aviso>Ao salvar, o sistema gera automaticamente: centro de custo exclusivo, EAP com as etapas padrão, calendário semanal do prazo, orçamento nº 1 (rev. 0) em rascunho e o vínculo da equipe responsável.</Aviso>
      </div>
      <FormObra acao={criarObraAcao} clientes={clientes} usuarios={usuarios} cancelar="/obras" />
    </div>
  );
}

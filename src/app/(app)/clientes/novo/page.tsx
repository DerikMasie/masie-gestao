import { exigirPermissaoPagina } from "@/lib/auth/atual";
import { CabecalhoPagina } from "@/componentes/ui";
import { salvarClienteAcao } from "../acoes";
import { FormCliente } from "../form-cliente";

export const metadata = { title: "Novo cliente" };

export default async function NovoCliente() {
  await exigirPermissaoPagina("clientes", "criar");
  return (
    <div className="max-w-4xl">
      <CabecalhoPagina titulo="Novo cliente" voltar={{ href: "/clientes", rotulo: "Clientes" }} />
      <FormCliente acao={salvarClienteAcao.bind(null, null)} />
    </div>
  );
}

import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { CabecalhoPagina } from "@/componentes/ui";
import { salvarFornecedorAcao } from "../acoes";
import { FormFornecedor } from "../form-fornecedor";

export const metadata = { title: "Novo fornecedor" };

export default async function NovoFornecedor() {
  const u = await exigirPermissaoPagina("fornecedores", "criar");
  return (
    <div className="max-w-4xl">
      <CabecalhoPagina titulo="Novo fornecedor" voltar={{ href: "/fornecedores", rotulo: "Fornecedores" }} />
      <FormFornecedor acao={salvarFornecedorAcao.bind(null, null)}
        bancarios={temPermissao(u, "fornecedores_bancarios", "editar") ? { modo: "editar", dados: null } : { modo: "bloqueado" }} />
    </div>
  );
}

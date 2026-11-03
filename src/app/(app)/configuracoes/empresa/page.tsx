import { db } from "@/db";
import { formatarDocumento } from "@/dominio/documentos";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { obterEmpresa } from "@/servicos/cadastros";
import { BotaoEnviar, Campo, Formulario } from "@/componentes/formulario";
import { CamposParametros } from "@/componentes/campos-parametros";
import { normalizarParametros } from "@/dominio/orcamento";
import { CabecalhoPagina, Cartao } from "@/componentes/ui";
import { salvarEmpresaAcao } from "../acoes";

export const metadata = { title: "Empresa" };

export default async function PaginaEmpresa() {
  const u = await exigirPermissaoPagina("configuracoes");
  const e = (await obterEmpresa(db, u.empresaId))!;
  const editar = temPermissao(u, "configuracoes", "editar");
  return (
    <div className="max-w-4xl">
      <CabecalhoPagina titulo="Empresa" subtitulo="Dados usados em relatórios, propostas e como padrão dos novos orçamentos" />
      <Formulario acao={salvarEmpresaAcao}>
        <fieldset disabled={!editar} className="space-y-4">
          <Cartao titulo="Identificação">
            <div className="grid gap-4 sm:grid-cols-6">
              <div className="sm:col-span-3"><Campo nome="razaoSocial" rotulo="Razão social" obrigatorio defaultValue={e.razaoSocial} /></div>
              <div className="sm:col-span-3"><Campo nome="nomeFantasia" rotulo="Nome fantasia" obrigatorio defaultValue={e.nomeFantasia} /></div>
              <div className="sm:col-span-2"><Campo nome="cnpj" rotulo="CNPJ" defaultValue={e.cnpj ? formatarDocumento(e.cnpj) : ""} /></div>
              <div className="sm:col-span-2"><Campo nome="telefone" rotulo="Telefone" defaultValue={e.telefone ?? ""} /></div>
              <div className="sm:col-span-2"><Campo nome="email" rotulo="E-mail" type="email" defaultValue={e.email ?? ""} /></div>
              <div className="sm:col-span-4"><Campo nome="endereco" rotulo="Endereço" defaultValue={e.endereco ?? ""} /></div>
              <div className="sm:col-span-2"><Campo nome="corPrimaria" rotulo="Cor da marca" type="color" defaultValue={e.corPrimaria} className="h-10 p-1" /></div>
            </div>
          </Cartao>
          <Cartao titulo="Dados para depósito (exibidos no relatório ao cliente)">
            <div className="grid gap-4 sm:grid-cols-4">
              <Campo nome="banco" rotulo="Banco" defaultValue={e.banco ?? ""} />
              <Campo nome="agencia" rotulo="Agência" defaultValue={e.agencia ?? ""} />
              <Campo nome="conta" rotulo="Conta" defaultValue={e.conta ?? ""} />
              <Campo nome="pix" rotulo="PIX" defaultValue={e.pix ?? ""} />
            </div>
          </Cartao>
          <Cartao titulo="Parâmetros padrão de orçamento">
            <CamposParametros p={normalizarParametros(e.parametrosOrcamento)} />
            <p className="mt-3 text-xs text-suave">Valem para os orçamentos criados a partir de agora; cada orçamento pode ter os seus próprios valores. Na forma <b>por dentro</b> o imposto incide sobre o valor final da proposta (como no faturamento real); na forma <b>por fora</b>, como na planilha, ele é somado sobre o preço sem imposto e fica cerca de 1% do contrato abaixo do devido.</p>
          </Cartao>
        </fieldset>
        {editar && <BotaoEnviar>Salvar</BotaoEnviar>}
      </Formulario>
    </div>
  );
}

import { db } from "@/db";
import { formatarDocumento } from "@/dominio/documentos";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { obterEmpresa } from "@/servicos/cadastros";
import { BotaoEnviar, Campo, CampoSelecao, Formulario } from "@/componentes/formulario";
import { CabecalhoPagina, Cartao } from "@/componentes/ui";
import { salvarEmpresaAcao } from "../acoes";

export const metadata = { title: "Empresa" };
const pct = (v: number) => String(Number((v * 100).toFixed(2))).replace(".", ",");

export default async function PaginaEmpresa() {
  const u = await exigirPermissaoPagina("configuracoes");
  const e = (await obterEmpresa(db, u.empresaId))!;
  const p = e.parametrosOrcamento;
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
            <div className="grid gap-4 sm:grid-cols-4">
              <Campo nome="lucroMaoDeObra" rotulo="Lucro mão de obra (%)" obrigatorio defaultValue={pct(p.lucroMaoDeObra)} inputMode="decimal" />
              <Campo nome="lucroMaterial" rotulo="Lucro material (%)" obrigatorio defaultValue={pct(p.lucroMaterial)} inputMode="decimal" />
              <Campo nome="impostos" rotulo="Impostos (%)" obrigatorio defaultValue={pct(p.impostos)} inputMode="decimal" />
              <CampoSelecao nome="formula" rotulo="Fórmula de preço" defaultValue={p.formula} opcoes={[
                { valor: "POR_DENTRO", rotulo: "Por dentro (recomendada)" }, { valor: "PLANILHA_LEGADA", rotulo: "Legada da planilha" },
              ]} />
            </div>
            <p className="mt-3 text-xs text-suave">
              <b>Por dentro:</b> preço = custo × (1 + lucro) ÷ (1 − impostos), o imposto incide sobre o preço. <b>Legada:</b> preço = custo × (1 + lucro + impostos), como na planilha AO. Com 50% de lucro e 10% de impostos, a legada gera margem líquida de 27,5% em vez de 30%.
              Valores iniciais extraídos da obra Palco: MO ×1,60 (50% + 10%) e material ×1,22 (12% + 10%).
            </p>
          </Cartao>
        </fieldset>
        {editar && <BotaoEnviar>Salvar</BotaoEnviar>}
      </Formulario>
    </div>
  );
}

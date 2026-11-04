import { db } from "@/db";
import { hojeIso } from "@/dominio/calendario";
import { exigirPermissaoPagina } from "@/lib/auth/atual";
import { opcoesFinanceiras } from "@/servicos/opcoes-financeiras";
import { FormNota } from "@/componentes/form-nota";
import { CabecalhoPagina } from "@/componentes/ui";
import { fornecedorPorDocumentoAcao, lancarNotaAcao, verbaEtapaAcao } from "../../../financeiro/acoes";

export const metadata = { title: "Lançar nota fiscal" };

export default async function NovaNota() {
  const u = await exigirPermissaoPagina("compras", "criar");
  const op = await opcoesFinanceiras(db, u.empresaId);
  return (
    <div className="max-w-4xl">
      <CabecalhoPagina titulo="Lançar nota fiscal" subtitulo="A nota gera a conta a pagar (com parcelas) e consome a verba da etapa — lançamento único, sem redigitar no financeiro" voltar={{ href: "/compras/notas", rotulo: "Notas fiscais" }} />
      <FormNota acao={lancarNotaAcao} fornecedores={op.fornecedores} centros={op.centros} etapasPorObra={op.etapasPorObra}
        gruposPlano={op.gruposPlano((n) => n === "CUSTO" || n === "DESPESA")} contas={op.contas} hoje={hojeIso()}
        buscarFornecedor={fornecedorPorDocumentoAcao} verba={verbaEtapaAcao} />
    </div>
  );
}

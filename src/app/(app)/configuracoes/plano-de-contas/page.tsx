import { db } from "@/db";
import { NATUREZAS, type Natureza } from "@/dominio/financeiro";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { listarEtapasPadrao } from "@/servicos/cadastros";
import { listarPlano } from "@/servicos/financeiro";
import { BotaoEnviar, Caixa, Formulario } from "@/componentes/formulario";
import { CabecalhoPagina, Cartao, Selo } from "@/componentes/ui";
import { salvarPlanoAcao } from "../../financeiro/acoes";

export const metadata = { title: "Plano de contas" };

export default async function PlanoDeContas() {
  const u = await exigirPermissaoPagina("configuracoes");
  const [plano, etapas] = await Promise.all([listarPlano(db, u.empresaId), listarEtapasPadrao(db, u.empresaId)]);
  const editar = temPermissao(u, "configuracoes", "editar");
  const grupos = [...new Set(plano.map((p) => `${p.natureza}|${p.grupo}`))];
  const inp = "rounded-lg border border-borda bg-white px-2 py-1 text-sm";
  const SelNat = ({ v }: { v?: Natureza }) => <select name="natureza" defaultValue={v ?? "CUSTO"} className={inp} aria-label="Natureza">{Object.entries(NATUREZAS).map(([k, n]) => <option key={k} value={k}>{n.rotulo}</option>)}</select>;
  const SelEtapa = ({ v }: { v?: string | null }) => <select name="etapaPadraoId" defaultValue={v ?? ""} className={`${inp} max-w-56`} aria-label="Etapa da EAP"><option value="">— sem etapa —</option>{etapas.map((e) => <option key={e.id} value={e.id}>{e.ordem}. {e.nome}</option>)}</select>;
  return (
    <>
      <CabecalhoPagina titulo="Plano de contas" subtitulo="Grupos e subitens do Financeiro. A natureza define se a conta entra no resultado; a etapa liga o subitem à verba da obra (de-para D11)." />
      {editar && (
        <Cartao titulo="Novo subitem" className="mb-6">
          <Formulario acao={salvarPlanoAcao.bind(null, null)} limparAoSalvar className="!space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input name="grupo" placeholder="Grupo (ex.: Custos de material)" required list="grupos" className={`${inp} min-w-56`} aria-label="Grupo" />
              <datalist id="grupos">{[...new Set(plano.map((p) => p.grupo))].map((g) => <option key={g} value={g} />)}</datalist>
              <input name="subitem" placeholder="Subitem" required className={`${inp} min-w-48 flex-1`} aria-label="Subitem" />
              <SelNat /><SelEtapa />
              <BotaoEnviar>Adicionar</BotaoEnviar>
            </div>
          </Formulario>
        </Cartao>
      )}
      <div className="space-y-4">
        {grupos.map((k) => {
          const [nat, grupo] = k.split("|") as [Natureza, string];
          const itens = plano.filter((p) => p.natureza === nat && p.grupo === grupo);
          return (
            <Cartao key={k} titulo={<span className="flex items-center gap-2">{grupo} <Selo tom={NATUREZAS[nat].noResultado ? "cinza" : "destaque"}>{NATUREZAS[nat].rotulo}{NATUREZAS[nat].noResultado ? "" : " · fora do resultado"}</Selo></span>} semPadding>
              <ul className="divide-y divide-borda">
                {itens.map((p) => (
                  <li key={p.id} className="px-4 py-2">
                    <Formulario acao={salvarPlanoAcao.bind(null, p.id)} className="!space-y-1">
                      <fieldset disabled={!editar} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="grupo" value={p.grupo} />
                        <input name="subitem" defaultValue={p.subitem} required className={`${inp} min-w-48 flex-1`} aria-label="Subitem" />
                        <SelNat v={p.natureza} /><SelEtapa v={p.etapaPadraoId} />
                        <Caixa nome="ativo" rotulo="Ativo" defaultChecked={p.ativo} />
                        {editar && <BotaoEnviar variante="secundario">Salvar</BotaoEnviar>}
                      </fieldset>
                    </Formulario>
                  </li>
                ))}
              </ul>
            </Cartao>
          );
        })}
      </div>
    </>
  );
}

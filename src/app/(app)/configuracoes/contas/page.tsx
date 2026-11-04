import { db } from "@/db";
import { formatarData, formatarMoeda } from "@/dominio/formato";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { listarContas } from "@/servicos/financeiro";
import { BotaoEnviar, Caixa, Campo, CampoSelecao, Formulario } from "@/componentes/formulario";
import { CabecalhoPagina, Cartao } from "@/componentes/ui";
import { salvarContaAcao } from "../../financeiro/acoes";

export const metadata = { title: "Contas bancárias e caixas" };
const TIPOS = [{ valor: "BANCO", rotulo: "Conta bancária" }, { valor: "CAIXA", rotulo: "Caixa" }, { valor: "CARTAO", rotulo: "Cartão" }, { valor: "APLICACAO", rotulo: "Aplicação" }];
const din = (v: string | number) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

export default async function Contas() {
  const u = await exigirPermissaoPagina("configuracoes");
  const contas = await listarContas(db, u.empresaId);
  const editar = temPermissao(u, "configuracoes", "editar");
  return (
    <>
      <CabecalhoPagina titulo="Contas bancárias e caixas" subtitulo="Saldo = saldo inicial + lançamentos. Ajuste o saldo inicial para bater com o extrato na data do primeiro lançamento." />
      <div className="grid gap-4 lg:grid-cols-2">
        {contas.map((c) => (
          <Cartao key={c.id} titulo={<span>{c.nome} <span className="ml-2 font-normal text-suave">{formatarMoeda(c.saldo)}</span></span>}>
            <Formulario acao={salvarContaAcao.bind(null, c.id)}>
              <fieldset disabled={!editar} className="grid gap-3 sm:grid-cols-2">
                <Campo nome="nome" rotulo="Nome" obrigatorio defaultValue={c.nome} />
                <CampoSelecao nome="tipo" rotulo="Tipo" defaultValue={c.tipo} opcoes={TIPOS} />
                <Campo nome="banco" rotulo="Banco" defaultValue={c.banco ?? ""} />
                <div className="grid grid-cols-2 gap-2"><Campo nome="agencia" rotulo="Agência" defaultValue={c.agencia ?? ""} /><Campo nome="conta" rotulo="Conta" defaultValue={c.conta ?? ""} /></div>
                <Campo nome="saldoInicial" rotulo="Saldo inicial (R$)" inputMode="decimal" defaultValue={din(c.saldoInicial)} />
                <div className="flex flex-col justify-end gap-2 pb-1">
                  <Caixa nome="contaDeSocio" rotulo="Conta pessoal de sócio" defaultChecked={c.contaDeSocio} />
                  <Caixa nome="ativo" rotulo="Ativa" defaultChecked={c.ativo} />
                </div>
              </fieldset>
              <p className="text-xs text-suave">Último movimento: {c.ultimoMovimento ? formatarData(c.ultimoMovimento) : "—"}</p>
              {editar && <BotaoEnviar variante="secundario">Salvar</BotaoEnviar>}
            </Formulario>
          </Cartao>
        ))}
        {editar && (
          <Cartao titulo="Nova conta">
            <Formulario acao={salvarContaAcao.bind(null, null)} limparAoSalvar>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo nome="nome" rotulo="Nome" obrigatorio placeholder="Itaú, Sicoob, Caixa físico…" />
                <CampoSelecao nome="tipo" rotulo="Tipo" opcoes={TIPOS} />
                <Campo nome="banco" rotulo="Banco" />
                <Campo nome="saldoInicial" rotulo="Saldo inicial (R$)" inputMode="decimal" />
              </div>
              <Caixa nome="contaDeSocio" rotulo="Conta pessoal de sócio (recomendação: separar das contas da empresa)" />
              <BotaoEnviar>Criar conta</BotaoEnviar>
            </Formulario>
          </Cartao>
        )}
      </div>
    </>
  );
}

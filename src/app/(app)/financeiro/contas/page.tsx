import Link from "next/link";
import clsx from "clsx";
import { db } from "@/db";
import { hojeIso } from "@/dominio/calendario";
import { formatarData, formatarMoeda } from "@/dominio/formato";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { listarParcelas, type FiltroParcelas } from "@/servicos/financeiro";
import { opcoesFinanceiras } from "@/servicos/opcoes-financeiras";
import { BotaoEnviar, Campo, CampoSelecao, CampoSelecaoAgrupada, Formulario } from "@/componentes/formulario";
import { BotaoProgramar } from "@/componentes/botao-programar";
import { Abas, CabecalhoPagina, Cartao, Selo, Tabela, Vazio } from "@/componentes/ui";
import { baixarParcelaAcao, criarTituloAcao, programarParcelaAcao } from "../acoes";

export const metadata = { title: "Contas a pagar e receber" };
const SITUACAO = { PAGA: ["Baixada", "verde"], VENCIDA: ["Vencida", "vermelho"], VENCE_HOJE: ["Vence hoje", "destaque"], PROGRAMADA: ["Programada", "azul"], A_VENCER: ["A vencer", "cinza"] } as const;

export default async function Contas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirPermissaoPagina("financeiro");
  const p = await searchParams;
  const tipo: FiltroParcelas["tipo"] = p.aba === "receber" ? "RECEBER" : "PAGAR";
  const situacao = (["ABERTAS", "VENCIDAS", "PAGAS", "TODAS"] as const).find((s) => s === p.situacao) ?? "ABERTAS";
  const [lista, op] = await Promise.all([
    listarParcelas(db, u.empresaId, { tipo, situacao, de: p.de || undefined, ate: p.ate || undefined, q: p.q?.slice(0, 100) }),
    opcoesFinanceiras(db, u.empresaId),
  ]);
  const total = lista.reduce((t, l) => t + Number(l.valor), 0);
  const podeEditar = temPermissao(u, "financeiro", "editar");
  const pagar = tipo === "PAGAR";
  const sel = "rounded-lg border border-borda bg-white px-2 py-1.5";
  return (
    <>
      <CabecalhoPagina titulo="Contas a pagar e a receber" subtitulo="Parcelas por vencimento; a baixa registra o lançamento no caixa" voltar={{ href: "/financeiro", rotulo: "Financeiro" }} />
      <Abas abas={[{ id: "pagar", rotulo: "A pagar" }, { id: "receber", rotulo: "A receber" }]} ativa={pagar ? "pagar" : "receber"} base="/financeiro/contas" />
      <div className="grid gap-6 xl:grid-cols-4">
        <Cartao semPadding className="xl:col-span-3">
          <form className="flex flex-wrap items-end gap-2 border-b border-borda p-3 text-sm">
            <input type="hidden" name="aba" value={pagar ? "pagar" : "receber"} />
            <input name="q" defaultValue={p.q} placeholder={pagar ? "Fornecedor, descrição ou NF…" : "Cliente ou descrição…"} className={`${sel} min-w-48 flex-1`} />
            <select name="situacao" defaultValue={situacao} className={sel} aria-label="Situação">
              <option value="ABERTAS">Em aberto</option><option value="VENCIDAS">Vencidas</option><option value="PAGAS">Baixadas</option><option value="TODAS">Todas</option>
            </select>
            <input type="date" name="de" defaultValue={p.de} className={sel} aria-label="Vencimento de" />
            <input type="date" name="ate" defaultValue={p.ate} className={sel} aria-label="Vencimento até" />
            <button className="rounded-lg bg-marca px-3 py-1.5 font-medium text-white">Filtrar</button>
          </form>
          <div className="border-b border-borda px-4 py-2 text-sm">{lista.length} parcela(s) · total <b className="tabular">{formatarMoeda(total)}</b></div>
          {lista.length === 0 ? <Vazio titulo="Nenhuma parcela neste filtro" /> : (
            <Tabela>
              <thead><tr><th>Vencimento</th><th>{pagar ? "Fornecedor" : "Cliente"}</th><th>Descrição</th><th>Centro</th><th className="text-right">Valor</th><th>Situação</th>{podeEditar && <th className="w-72" />}</tr></thead>
              <tbody>
                {lista.map((l) => {
                  const [rot, tom] = SITUACAO[l.situacao];
                  return (
                    <tr key={l.id} className={clsx(l.situacao === "VENCIDA" && "bg-red-50/50")}>
                      <td className="tabular whitespace-nowrap">{formatarData(l.vencimento)}</td>
                      <td>{l.pessoa ?? "—"}</td>
                      <td className="text-xs"><span className="block">{l.descricao}</span><span className="text-suave">parcela {l.numero}/{l.totalParcelas} · {l.subitem}</span></td>
                      <td className="whitespace-nowrap text-xs">{l.obraId ? <Link href={`/obras/${l.obraId}?aba=financeiro`} className="underline decoration-destaque decoration-2 underline-offset-2">{l.centro}</Link> : l.centro}</td>
                      <td className="tabular whitespace-nowrap text-right font-medium">{formatarMoeda(l.valor)}</td>
                      <td><Selo tom={tom}>{rot}</Selo>{l.pagoEm && <div className="text-[11px] text-suave">em {formatarData(l.pagoEm)}</div>}</td>
                      {podeEditar && (
                        <td>
                          {!l.pagoEm && (
                            <details className="group">
                              <summary className="cursor-pointer list-none text-sm font-medium underline decoration-destaque decoration-2 underline-offset-4">{pagar ? "Pagar" : "Receber"}</summary>
                              <Formulario acao={baixarParcelaAcao.bind(null, l.id)} className="mt-2 !space-y-2 rounded-lg border border-borda bg-white p-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <Campo nome="data" rotulo="Data" type="date" defaultValue={hojeIso()} />
                                  <Campo nome="valor" rotulo="Valor" inputMode="decimal" placeholder={Number(l.valor).toFixed(2).replace(".", ",")} />
                                </div>
                                <CampoSelecao nome="contaId" rotulo="Conta" opcoes={op.contas} />
                                <BotaoEnviar className="w-full">Confirmar baixa</BotaoEnviar>
                              </Formulario>
                            </details>
                          )}
                          {pagar && !l.pagoEm && <BotaoProgramar acao={programarParcelaAcao.bind(null, l.id, !l.programado)} programado={l.programado} />}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </Tabela>
          )}
        </Cartao>
        {temPermissao(u, "financeiro", "criar") && (
          <Cartao titulo={pagar ? "Nova conta a pagar" : "Nova conta a receber"}>
            <Formulario acao={criarTituloAcao} limparAoSalvar>
              <input type="hidden" name="tipo" value={tipo} />
              {pagar
                ? <CampoSelecao nome="fornecedorId" rotulo="Fornecedor" obrigatorio vazio="Selecione…" opcoes={op.fornecedores} />
                : <CampoSelecao nome="clienteId" rotulo="Cliente" obrigatorio vazio="Selecione…" opcoes={op.clientes} />}
              <Campo nome="descricao" rotulo="Descrição" obrigatorio placeholder={pagar ? "Ex.: Empreitada pintura" : "Ex.: Medição 2"} />
              <Campo nome="documento" rotulo="Documento" placeholder="Contrato, boleto, NF…" />
              <CampoSelecao nome="centroCustoId" rotulo="Centro de custo" obrigatorio vazio="Selecione…" opcoes={op.centros} />
              <CampoSelecaoAgrupada nome="planoContaId" rotulo="Classificação" obrigatorio vazio="Selecione…" grupos={op.gruposPlano((n) => (pagar ? n !== "RECEITA" : n === "RECEITA" || n === "FINANCIAMENTO"))} />
              <div className="grid grid-cols-2 gap-2">
                <Campo nome="valorTotal" rotulo="Valor total" obrigatorio inputMode="decimal" />
                <Campo nome="emissao" rotulo="Emissão" type="date" obrigatorio defaultValue={hojeIso()} />
                <Campo nome="parcelas" rotulo="Parcelas" type="number" min={1} max={120} defaultValue="1" />
                <Campo nome="primeiroVencimento" rotulo="1º vencimento" type="date" obrigatorio defaultValue={hojeIso()} />
              </div>
              <Campo nome="intervaloDias" rotulo="Intervalo entre parcelas (dias)" type="number" min={1} defaultValue="30" />
              <p className="text-xs text-suave">Compras com nota fiscal: use Compras → Notas fiscais (a NF gera a conta a pagar sozinha).</p>
              <BotaoEnviar>Registrar</BotaoEnviar>
            </Formulario>
          </Cartao>
        )}
      </div>
    </>
  );
}

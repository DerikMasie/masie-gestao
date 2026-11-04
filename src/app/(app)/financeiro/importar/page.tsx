import { db } from "@/db";
import { formatarData, formatarMoeda } from "@/dominio/formato";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { listarImportacoes, type RelatorioImportacaoFinanceiro } from "@/servicos/importacao-financeiro";
import { AcaoConfirmada, BotaoEnviar, Campo, Formulario } from "@/componentes/formulario";
import { Aviso, CabecalhoPagina, Cartao, Selo, Tabela } from "@/componentes/ui";
import { desfazerImportacaoAcao, importarFinanceiroAcao } from "../acoes";

export const metadata = { title: "Importar histórico" };

export default async function Importar({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const u = await exigirPermissaoPagina("financeiro", "criar");
  const { id } = await searchParams;
  const lista = await listarImportacoes(db, u.empresaId);
  const atual = lista.find((i) => i.id === id);
  const rel = atual?.resumo as RelatorioImportacaoFinanceiro | undefined;
  return (
    <>
      <CabecalhoPagina titulo="Importar histórico do Financeiro" subtitulo="Planilha Financeiro 2026.xlsm: plano de contas, bancos, centros de custo, fluxo de caixa e contas a pagar" voltar={{ href: "/financeiro", rotulo: "Financeiro" }} />
      {rel && (
        <div className="mb-6 space-y-4">
          <Aviso tom="sucesso"><b>Importação concluída:</b> {rel.lancamentos} lançamentos de {formatarData(rel.periodo.de)} a {formatarData(rel.periodo.ate)} · {rel.centrosCriados} centros de custo{rel.centrosVinculadosAObras ? ` (${rel.centrosVinculadosAObras} ligados a obras existentes)` : ""} · {rel.contasCriadas} contas · {rel.contasAPagar} contas a pagar em aberto.</Aviso>
          <div className="grid gap-6 lg:grid-cols-2">
            <Cartao titulo="Resultado por ano (com a correção D12)" semPadding>
              <Tabela>
                <thead><tr><th>Ano</th><th className="text-right">Receitas</th><th className="text-right">Custos</th><th className="text-right">Despesas</th><th className="text-right">Impostos</th><th className="text-right">Resultado</th><th className="text-right">Fora do resultado</th></tr></thead>
                <tbody>{rel.porAno.map((a) => (
                  <tr key={a.ano}><td>{a.ano}</td><td className="tabular text-right">{formatarMoeda(a.receitas)}</td><td className="tabular text-right">{formatarMoeda(a.custos)}</td><td className="tabular text-right">{formatarMoeda(a.despesas)}</td><td className="tabular text-right">{formatarMoeda(a.impostos)}</td>
                    <td className={`tabular text-right font-semibold ${a.resultadoOperacional < 0 ? "text-perigo" : ""}`}>{formatarMoeda(a.resultadoOperacional)}</td><td className="tabular text-right text-suave">{formatarMoeda(a.foraDoResultado)}</td></tr>
                ))}</tbody>
              </Tabela>
              <div className="border-t border-borda px-5 py-3 text-xs text-suave">
                Reclassificados para fora do resultado: {rel.reclassificados.map((r) => `${r.subitem} (${r.quantidade}× · ${formatarMoeda(r.valor)})`).join("; ") || "nenhum"}.
              </div>
            </Cartao>
            <Cartao titulo="Pendências para revisar">
              {rel.pendencias.length === 0 ? <p className="text-sm text-suave">Nenhuma pendência.</p> : (
                <ul className="space-y-2 text-sm">
                  {rel.pendencias.map((p) => (
                    <li key={p.tipo}><Selo tom="destaque">{p.quantidade}</Selo> {p.tipo}
                      {p.exemplos.length > 0 && <span className="block text-xs text-suave">Ex.: {p.exemplos.join(", ")}</span>}</li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-suave">Os lançamentos foram gravados mesmo com pendências; corrija a classificação em Lançamentos quando necessário. Saldos dependem do saldo inicial de cada conta (Configurações → Contas).</p>
            </Cartao>
          </div>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Cartao titulo="Enviar planilha">
          <Formulario acao={importarFinanceiroAcao}>
            <Campo nome="arquivo" rotulo="Arquivo (.xlsm ou .xlsx)" type="file" accept=".xlsm,.xlsx" />
            <p className="text-xs text-suave">As macros não são executadas. O mesmo arquivo não pode ser importado duas vezes; para reimportar, desfaça a importação anterior.</p>
            <BotaoEnviar>Importar</BotaoEnviar>
          </Formulario>
        </Cartao>
        <Cartao titulo="Importações realizadas" className="lg:col-span-2" semPadding>
          {lista.length === 0 ? <p className="p-5 text-sm text-suave">Nenhuma importação.</p> : (
            <Tabela>
              <thead><tr><th>Data</th><th>Arquivo</th><th className="text-right">Lançamentos</th><th>Situação</th>{temPermissao(u, "financeiro", "excluir") && <th />}</tr></thead>
              <tbody>{lista.map((i) => (
                <tr key={i.id}>
                  <td className="whitespace-nowrap">{formatarData(i.criadoEm)}</td><td><a href={`?id=${i.id}`} className="underline decoration-destaque decoration-2 underline-offset-4">{i.arquivo}</a></td>
                  <td className="tabular text-right">{(i.resumo as RelatorioImportacaoFinanceiro).lancamentos ?? "—"}</td>
                  <td>{i.desfeitaEm ? <Selo>Desfeita em {formatarData(i.desfeitaEm)}</Selo> : <Selo tom="verde">Ativa</Selo>}</td>
                  {temPermissao(u, "financeiro", "excluir") && <td>{!i.desfeitaEm && <AcaoConfirmada acao={desfazerImportacaoAcao.bind(null, i.id)} confirmacao="Desfazer esta importação? Todos os lançamentos e contas a pagar importados por ela serão removidos." variante="secundario">Desfazer</AcaoConfirmada>}</td>}
                </tr>
              ))}</tbody>
            </Tabela>
          )}
        </Cartao>
      </div>
    </>
  );
}

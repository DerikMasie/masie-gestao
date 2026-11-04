import Link from "next/link";
import { db } from "@/db";
import { formatarMoeda, formatarPercentual } from "@/dominio/formato";
import { nomeDoMes } from "@/dominio/quadro";
import { exigirPermissaoPagina } from "@/lib/auth/atual";
import { painelFinanceiro } from "@/servicos/financeiro";
import { Aviso, CabecalhoPagina, Cartao, Indicador, LinkBotao, Tabela } from "@/componentes/ui";

export const metadata = { title: "Financeiro" };

function LinhaResultado({ rotulo, valor, forte, negativo }: { rotulo: string; valor: number; forte?: boolean; negativo?: boolean }) {
  return (
    <tr className={forte ? "font-semibold" : ""}>
      <td>{rotulo}</td>
      <td className={`tabular text-right ${valor < 0 ? "text-perigo" : ""}`}>{negativo && valor ? `− ${formatarMoeda(valor)}` : formatarMoeda(valor)}</td>
    </tr>
  );
}

export default async function PainelFinanceiro() {
  const u = await exigirPermissaoPagina("financeiro");
  const p = await painelFinanceiro(db, u.empresaId);
  const maior = Math.max(1, ...p.meses.map((m) => Math.max(m.entradas + m.projetadoEntradas, m.saidas + m.projetadoSaidas)));
  const ano = new Date().getFullYear();
  const r = p.resultadoAno;
  return (
    <>
      <CabecalhoPagina titulo="Financeiro" subtitulo="Caixa, contas a pagar e a receber e resultado da empresa"
        acoes={<><LinkBotao href="/financeiro/lancamentos" variante="secundario">Lançamentos</LinkBotao><LinkBotao href="/financeiro/contas">Contas a pagar e receber</LinkBotao></>} />
      {p.contas.length <= 1 && p.saldoTotal === 0 && (
        <div className="mb-4"><Aviso>Ainda não há movimento. Importe o histórico do Financeiro 2026 em <Link className="underline" href="/financeiro/importar">Importar histórico</Link> ou comece pelos lançamentos.</Aviso></div>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador rotulo="Saldo em contas" valor={formatarMoeda(p.saldoTotal)} detalhe={`${p.contas.filter((c) => c.ativo).length} conta(s) ativas`} tom={p.saldoTotal < 0 ? "perigo" : undefined} />
        <Indicador rotulo="A pagar vencido" valor={formatarMoeda(p.aPagar.vencido)} tom={p.aPagar.vencido > 0 ? "perigo" : undefined} detalhe={`7 dias: ${formatarMoeda(p.aPagar.sete)} · 30 dias: ${formatarMoeda(p.aPagar.trinta)}`} />
        <Indicador rotulo="A receber" valor={formatarMoeda(p.aReceber.total)} detalhe={`Vencido: ${formatarMoeda(p.aReceber.vencido)} · 30 dias: ${formatarMoeda(p.aReceber.trinta)}`} tom={p.aReceber.vencido > 0 ? "alerta" : undefined} />
        <Indicador rotulo={`Resultado operacional ${ano}`} valor={formatarMoeda(r.resultadoOperacional)} tom={r.resultadoOperacional < 0 ? "perigo" : "sucesso"}
          detalhe={r.margem == null ? "Sem receitas no ano" : `Margem ${formatarPercentual(r.margem)} · mês: ${formatarMoeda(p.resultadoMes.resultadoOperacional)}`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Cartao titulo="Fluxo de caixa mensal (operacional)" className="lg:col-span-3" semPadding>
          <Tabela>
            <thead><tr><th>Mês</th><th className="w-2/5">Entradas × saídas</th><th className="text-right">Entradas</th><th className="text-right">Saídas</th><th className="text-right">Líquido</th></tr></thead>
            <tbody>
              {p.meses.map((m) => {
                const futuro = m.projetadoEntradas + m.projetadoSaidas > 0 && m.entradas + m.saidas === 0;
                const e = m.entradas + m.projetadoEntradas; const s = m.saidas + m.projetadoSaidas;
                return (
                  <tr key={m.mes}>
                    <td className="whitespace-nowrap">{nomeDoMes(m.mes).replace(" de ", "/").replace(/^./, (l) => l.toUpperCase())}{futuro && <span className="ml-1 text-xs text-suave">(previsto)</span>}</td>
                    <td>
                      <div className="space-y-0.5" title={`Entradas ${formatarMoeda(e)} · saídas ${formatarMoeda(s)}`}>
                        <div className="h-2 rounded-r bg-zinc-800" style={{ width: `${(e / maior) * 100}%`, opacity: futuro ? 0.5 : 1 }} />
                        <div className="h-2 rounded-r bg-destaque" style={{ width: `${(s / maior) * 100}%`, opacity: futuro ? 0.5 : 1 }} />
                      </div>
                    </td>
                    <td className="tabular text-right">{formatarMoeda(e)}</td>
                    <td className="tabular text-right">{formatarMoeda(s)}</td>
                    <td className={`tabular text-right font-medium ${e - s < 0 ? "text-perigo" : ""}`}>{formatarMoeda(e - s)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
          <p className="border-t border-borda px-5 py-3 text-xs text-suave">Barra escura: entradas; amarela: saídas. Meses futuros usam as parcelas em aberto (previsto). Empréstimos, aplicações, transferências e saldo inicial ficam fora (decisão D12).</p>
        </Cartao>

        <div className="space-y-6 lg:col-span-2">
          <Cartao titulo={`Resultado ${ano}`} semPadding>
            <Tabela>
              <tbody>
                <LinhaResultado rotulo="Receitas" valor={r.receitas} />
                <LinhaResultado rotulo="Custos" valor={r.custos} negativo />
                <LinhaResultado rotulo="Despesas" valor={r.despesas} negativo />
                <LinhaResultado rotulo="Impostos" valor={r.impostos} negativo />
                <LinhaResultado rotulo="Resultado operacional" valor={r.resultadoOperacional} forte />
                <LinhaResultado rotulo="Retiradas de sócios" valor={r.retiradas} negativo />
                <LinhaResultado rotulo="Resultado após retiradas" valor={r.resultadoAposRetiradas} forte />
              </tbody>
            </Tabela>
            <div className="border-t border-borda px-5 py-3 text-xs text-suave">
              Fora do resultado (só caixa): empréstimos {formatarMoeda(r.foraDoResultado.financiamento)} · aplicações {formatarMoeda(r.foraDoResultado.investimento)} · ajustes {formatarMoeda(r.foraDoResultado.ajuste)}.
              {r.receitas > 0 && <> Impostos sobre receitas: <b>{formatarPercentual(r.impostos / r.receitas)}</b>.</>}
            </div>
          </Cartao>
          <Cartao titulo="Saldo por conta" semPadding>
            <Tabela>
              <tbody>
                {p.contas.filter((c) => c.ativo).map((c) => (
                  <tr key={c.id}><td>{c.nome}{c.contaDeSocio && <span className="ml-1 text-xs text-suave">(sócio)</span>}</td><td className={`tabular text-right ${c.saldo < 0 ? "text-perigo" : ""}`}>{formatarMoeda(c.saldo)}</td></tr>
                ))}
              </tbody>
            </Tabela>
            <p className="border-t border-borda px-5 py-3 text-xs text-suave">Saldo = saldo inicial + lançamentos. Confira com os extratos e ajuste o saldo inicial em Configurações → Contas.</p>
          </Cartao>
        </div>
      </div>
    </>
  );
}

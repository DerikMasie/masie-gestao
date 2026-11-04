import Link from "next/link";
import { db } from "@/db";
import { hojeIso, segundaDaSemana, somarDias } from "@/dominio/calendario";
import { formatarData, formatarMoeda } from "@/dominio/formato";
import { exigirPermissaoPagina } from "@/lib/auth/atual";
import { listarParcelas } from "@/servicos/financeiro";
import { BotaoProgramar } from "@/componentes/botao-programar";
import { CabecalhoPagina, Cartao, Selo, Tabela, Vazio } from "@/componentes/ui";
import { programarParcelaAcao } from "../acoes";

export const metadata = { title: "Provisão semanal" };

/** Provisão de pagamentos da semana (aba "PROVISÃO PAGAMENTOS"): fornecedor × obra, gerada das contas a pagar. */
export default async function Provisao({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const u = await exigirPermissaoPagina("financeiro");
  const { semana } = await searchParams;
  const inicio = segundaDaSemana(semana && /^\d{4}-\d{2}-\d{2}$/.test(semana) ? semana : hojeIso());
  const fim = somarDias(inicio, 6);
  const [daSemana, vencidas] = await Promise.all([
    listarParcelas(db, u.empresaId, { tipo: "PAGAR", situacao: "ABERTAS", de: inicio, ate: fim }),
    listarParcelas(db, u.empresaId, { tipo: "PAGAR", situacao: "VENCIDAS" }),
  ]);
  const atrasadas = vencidas.filter((v) => v.vencimento < inicio);
  const linhas = [...atrasadas, ...daSemana];
  const obras = [...new Set(linhas.map((l) => l.centro))].sort();
  const fornecedores = [...new Set(linhas.map((l) => l.pessoa ?? "—"))].sort();
  const celula = (f: string, o: string) => linhas.filter((l) => (l.pessoa ?? "—") === f && l.centro === o).reduce((t, l) => t + Number(l.valor), 0);
  const total = linhas.reduce((t, l) => t + Number(l.valor), 0);
  const programado = linhas.filter((l) => l.programado).reduce((t, l) => t + Number(l.valor), 0);
  return (
    <>
      <CabecalhoPagina titulo="Provisão semanal de pagamentos" subtitulo={`Semana de ${formatarData(inicio)} a ${formatarData(fim)} · inclui parcelas vencidas em aberto`} voltar={{ href: "/financeiro", rotulo: "Financeiro" }}
        acoes={<div className="flex gap-2 text-sm">
          <Link href={`?semana=${somarDias(inicio, -7)}`} className="rounded-lg border border-borda bg-white px-3 py-2 hover:bg-zinc-50">← Anterior</Link>
          <Link href="?" className="rounded-lg border border-borda bg-white px-3 py-2 hover:bg-zinc-50">Esta semana</Link>
          <Link href={`?semana=${somarDias(inicio, 7)}`} className="rounded-lg border border-borda bg-white px-3 py-2 hover:bg-zinc-50">Próxima →</Link>
        </div>} />
      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <span>Total a pagar: <b className="tabular">{formatarMoeda(total)}</b></span>
        <span>Já programado: <b className="tabular">{formatarMoeda(programado)}</b></span>
        {atrasadas.length > 0 && <span className="text-perigo">{atrasadas.length} parcela(s) vencidas de semanas anteriores</span>}
      </div>
      {linhas.length === 0 ? <Cartao><Vazio titulo="Nada a pagar nesta semana" /></Cartao> : (
        <div className="space-y-6">
          <Cartao titulo="Fornecedor × obra" semPadding>
            <Tabela>
              <thead><tr><th>Fornecedor</th>{obras.map((o) => <th key={o} className="text-right">{o}</th>)}<th className="text-right">Total</th></tr></thead>
              <tbody>
                {fornecedores.map((f) => (
                  <tr key={f}><td>{f}</td>{obras.map((o) => { const v = celula(f, o); return <td key={o} className="tabular text-right">{v ? formatarMoeda(v) : ""}</td>; })}
                    <td className="tabular text-right font-semibold">{formatarMoeda(obras.reduce((t, o) => t + celula(f, o), 0))}</td></tr>
                ))}
                <tr className="bg-zinc-50 font-semibold"><td>Total</td>{obras.map((o) => <td key={o} className="tabular text-right">{formatarMoeda(fornecedores.reduce((t, f) => t + celula(f, o), 0))}</td>)}<td className="tabular text-right">{formatarMoeda(total)}</td></tr>
              </tbody>
            </Tabela>
          </Cartao>
          <Cartao titulo="Parcelas" semPadding>
            <Tabela>
              <thead><tr><th>Vencimento</th><th>Fornecedor</th><th>Descrição</th><th>Centro</th><th className="text-right">Valor</th><th /></tr></thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id}>
                    <td className="tabular whitespace-nowrap">{formatarData(l.vencimento)} {l.situacao === "VENCIDA" && <Selo tom="vermelho">vencida</Selo>}</td>
                    <td>{l.pessoa}</td><td className="text-xs">{l.descricao}</td><td className="text-xs">{l.centro}</td>
                    <td className="tabular text-right font-medium">{formatarMoeda(l.valor)}</td>
                    <td>{l.programado && <Selo tom="azul">programado</Selo>}<BotaoProgramar acao={programarParcelaAcao.bind(null, l.id, !l.programado)} programado={l.programado} /></td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
            <p className="border-t border-borda px-5 py-3 text-xs text-suave">Para pagar, use Contas a pagar. Esta tela substitui a aba de provisão montada à mão: é gerada a partir das notas fiscais e contas lançadas.</p>
          </Cartao>
        </div>
      )}
    </>
  );
}

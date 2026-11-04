import Link from "next/link";
import { db } from "@/db";
import { formatarData, formatarMoeda } from "@/dominio/formato";
import { NATUREZAS } from "@/dominio/financeiro";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { listarLancamentos } from "@/servicos/financeiro";
import { opcoesFinanceiras } from "@/servicos/opcoes-financeiras";
import { AcaoConfirmada, BotaoEnviar, Campo, CampoSelecao, CampoSelecaoAgrupada, Formulario } from "@/componentes/formulario";
import { CabecalhoPagina, Cartao, Selo, Tabela, Vazio } from "@/componentes/ui";
import { criarLancamentoAcao, excluirLancamentoAcao } from "../acoes";
import { hojeIso } from "@/dominio/calendario";

export const metadata = { title: "Lançamentos" };
const uuid = /^[0-9a-f-]{36}$/;

export default async function Lancamentos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirPermissaoPagina("financeiro");
  const p = await searchParams;
  const pagina = Math.max(1, Number(p.pagina) || 1);
  const [r, op] = await Promise.all([
    listarLancamentos(db, u.empresaId, {
      de: p.de || undefined, ate: p.ate || undefined, contaId: p.conta && uuid.test(p.conta) ? p.conta : undefined,
      centroCustoId: p.centro && uuid.test(p.centro) ? p.centro : undefined, natureza: p.natureza && p.natureza in NATUREZAS ? p.natureza : undefined,
      q: p.q?.slice(0, 100), pagina, limite: 100,
    }),
    opcoesFinanceiras(db, u.empresaId),
  ]);
  const qs = (n: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(p).filter(([, v]) => v)) as Record<string, string>, pagina: String(n) })}`;
  const sel = "rounded-lg border border-borda bg-white px-2 py-1.5";
  return (
    <>
      <CabecalhoPagina titulo="Lançamentos" subtitulo="Razão de caixa: cada entrada e saída efetiva" voltar={{ href: "/financeiro", rotulo: "Financeiro" }} />
      <div className="grid gap-6 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <Cartao semPadding>
            <form className="flex flex-wrap items-end gap-2 border-b border-borda p-3 text-sm">
              <input name="q" defaultValue={p.q} placeholder="Buscar descrição ou classificação…" className={`${sel} min-w-48 flex-1`} />
              <input type="date" name="de" defaultValue={p.de} className={sel} aria-label="De" />
              <input type="date" name="ate" defaultValue={p.ate} className={sel} aria-label="Até" />
              <select name="conta" defaultValue={p.conta ?? ""} className={sel} aria-label="Conta"><option value="">Todas as contas</option>{op.contas.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}</select>
              <select name="centro" defaultValue={p.centro ?? ""} className={`${sel} max-w-56`} aria-label="Centro de custo"><option value="">Todos os centros</option>{op.centros.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}</select>
              <select name="natureza" defaultValue={p.natureza ?? ""} className={sel} aria-label="Natureza"><option value="">Todas as naturezas</option>{Object.entries(NATUREZAS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select>
              <button className="rounded-lg bg-marca px-3 py-1.5 font-medium text-white">Filtrar</button>
              {Object.keys(p).length > 0 && <Link href="/financeiro/lancamentos" className="px-1 py-1.5 text-suave">Limpar</Link>}
            </form>
            <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-borda px-4 py-2 text-sm">
              <span>{r.total} lançamento(s)</span>
              <span>Entradas <b className="tabular">{formatarMoeda(r.entradas)}</b></span>
              <span>Saídas <b className="tabular">{formatarMoeda(r.saidas)}</b></span>
              <span>Líquido <b className={`tabular ${r.entradas - r.saidas < 0 ? "text-perigo" : ""}`}>{formatarMoeda(r.entradas - r.saidas)}</b></span>
            </div>
            {r.linhas.length === 0 ? <Vazio titulo="Nenhum lançamento encontrado" /> : (
              <Tabela>
                <thead><tr><th>Data</th><th>Descrição</th><th>Classificação</th><th>Centro</th><th>Conta</th><th className="text-right">Valor</th>{temPermissao(u, "financeiro", "excluir") && <th />}</tr></thead>
                <tbody>
                  {r.linhas.map((l) => (
                    <tr key={l.id}>
                      <td className="tabular whitespace-nowrap">{formatarData(l.data)}</td>
                      <td className="max-w-72"><span className="line-clamp-2">{l.descricao ?? "—"}</span>{Boolean(l.importado) && <span className="text-[11px] text-suave">importado</span>}</td>
                      <td className="text-xs"><span className="block">{l.subitem}</span><span className="text-suave">{l.grupo}</span>{!NATUREZAS[l.natureza].noResultado && <Selo>fora do resultado</Selo>}</td>
                      <td className="whitespace-nowrap text-xs" title={l.centroNome}>{l.centro}</td>
                      <td className="whitespace-nowrap text-xs">{l.conta}</td>
                      <td className={`tabular whitespace-nowrap text-right font-medium ${Number(l.valor) < 0 ? "text-perigo" : "text-sucesso"}`}>{formatarMoeda(l.valor)}</td>
                      {temPermissao(u, "financeiro", "excluir") && <td><AcaoConfirmada acao={excluirLancamentoAcao.bind(null, l.id)} confirmacao={l.parcelaId ? "Excluir este lançamento? A parcela correspondente volta a ficar em aberto." : "Excluir este lançamento?"} variante="secundario">×</AcaoConfirmada></td>}
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            )}
            <div className="flex justify-between border-t border-borda px-5 py-3 text-sm">
              {pagina > 1 ? <Link href={qs(pagina - 1)} className="underline decoration-destaque decoration-2 underline-offset-4">← Mais recentes</Link> : <span />}
              {r.temMais && <Link href={qs(pagina + 1)} className="underline decoration-destaque decoration-2 underline-offset-4">Mais antigos →</Link>}
            </div>
          </Cartao>
        </div>
        {temPermissao(u, "financeiro", "criar") && (
          <Cartao titulo="Novo lançamento">
            <Formulario acao={criarLancamentoAcao} limparAoSalvar>
              <CampoSelecao nome="tipo" rotulo="Tipo" opcoes={[{ valor: "SAIDA", rotulo: "Saída (pagamento)" }, { valor: "ENTRADA", rotulo: "Entrada (recebimento)" }]} />
              <Campo nome="data" rotulo="Data" type="date" obrigatorio defaultValue={hojeIso()} />
              <Campo nome="valor" rotulo="Valor (R$)" obrigatorio inputMode="decimal" />
              <CampoSelecao nome="contaId" rotulo="Conta" obrigatorio opcoes={op.contas} />
              <CampoSelecao nome="centroCustoId" rotulo="Centro de custo" obrigatorio vazio="Selecione…" opcoes={op.centros} />
              <CampoSelecaoAgrupada nome="planoContaId" rotulo="Classificação" obrigatorio vazio="Selecione…" grupos={op.gruposPlano()} />
              <Campo nome="descricao" rotulo="Descrição" />
              <p className="text-xs text-suave">Em obras, a etapa é definida pelo de-para da classificação (ex.: “MO Terceirizada - Elétrica” → Instalações elétricas). Pagamentos de notas fiscais são feitos em Contas a pagar.</p>
              <BotaoEnviar>Registrar</BotaoEnviar>
            </Formulario>
          </Cartao>
        )}
      </div>
    </>
  );
}

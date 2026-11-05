import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { AlertTriangle, ArrowLeft, CircleAlert, Info } from "lucide-react";
import { db } from "@/db";
import { RITMO } from "@/dominio/painel-obras";
import { SITUACAO_ATIVIDADE } from "@/dominio/painel-obra";
import { exigirPermissaoPagina, podeAcessarObra, temPermissao } from "@/lib/auth/atual";
import { dadosPainelObra } from "@/servicos/painel-obra";
import { GraficoMedicoesObra, KpiGradiente, LembretesSemana, RoscaSaldos, SeletorSemana } from "@/componentes/painel-obra-ui";
import { criarLembreteAcao, excluirLembreteAcao, marcarLembreteAcao } from "./acoes";

export const metadata = { title: "Painel da obra" };

const pct = (v: number) => `${(Math.round(v * 1000) / 10).toLocaleString("pt-BR")}%`;
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).replace(/^-/, "−").replace(/\s/g, " ");
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const COR_RITMO = { ATRASADA: "#ef4444", ATENCAO: "#f59e0b", NO_RITMO: "#22c55e", ADIANTADA: "#14b8a6", SEM_CRONOGRAMA: "#71717a" } as const;
const COR_SIT = { CONCLUIDA: "bg-emerald-500/15 text-emerald-300", ATRASADA: "bg-red-500/15 text-red-300", EM_ANDAMENTO: "bg-amber-500/15 text-amber-200", NAO_INICIADA: "bg-zinc-700/60 text-zinc-300" } as const;
const ICONE = { ALTA: AlertTriangle, MEDIA: CircleAlert, INFO: Info } as const;
const COR_ICONE = { ALTA: "text-red-400", MEDIA: "text-amber-300", INFO: "text-zinc-400" } as const;

function Bloco({ titulo, acoes, children, className }: { titulo: string; acoes?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("min-w-0 rounded-xl border border-zinc-800 bg-[#17171c] p-4", className)} aria-label={titulo}>
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-zinc-100">{titulo}</h2>{acoes}</div>
      {children}
    </section>
  );
}

export default async function PainelDaObra({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ semana?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const u = await exigirPermissaoPagina("obras");
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await podeAcessarObra(u, id))) notFound();
  const acesso = { id: u.id, empresaId: u.empresaId, acessoTodasObras: u.perfil.acessoTodasObras };
  const d = await dadosPainelObra(db, acesso, id, sp.semana ? Number(sp.semana) : undefined).catch(() => null);
  if (!d) notFound();
  const verValores = temPermissao(u, "medicoes") && temPermissao(u, "orcamentos");
  const editaLembretes = temPermissao(u, "planejamento", "editar");
  const base = `/obras/${id}/painel`;
  const k = d.kpis;
  const difPp = (k.avanco.realizado - k.avanco.previsto) * 100;
  const maxExec = Math.max(...d.executadas.map((x) => x.contribuicao), 1e-9);

  return (
    <div className="-mx-4 -my-6 min-h-screen bg-[#0d0d11] px-4 py-6 text-zinc-100 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      {/* Cabeçalho e filtros */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-[#17171c] px-4 py-3">
        <Link href={`/obras/${id}?aba=fisico`} className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100" aria-label="Voltar para a obra"><ArrowLeft className="size-5" /></Link>
        <div className="min-w-0">
          <div className="text-xs text-zinc-400">{d.obra.codigo} · {d.cliente}</div>
          <h1 className="truncate text-xl font-semibold">Painel da obra · {d.obra.nome}</h1>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs font-semibold" style={{ color: COR_RITMO[d.ritmo] }}>
          <span className="size-2 rounded-full" style={{ background: COR_RITMO[d.ritmo] }} />{RITMO[d.ritmo].rotulo}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <span className="text-xs text-zinc-400">{ddmm(d.inicioSemana)} a {ddmm(d.fimSemana)}{d.ehAtual ? " · semana atual" : ""}</span>
          <SeletorSemana semana={d.semana} total={d.nSemanas} atual={d.semanaAtual} base={base} />
        </div>
      </div>

      {/* Indicadores */}
      <div className={clsx("grid gap-4 sm:grid-cols-2", verValores ? "xl:grid-cols-4" : "xl:grid-cols-2")}>
        <KpiGradiente titulo="Avanço físico" valor={pct(k.avanco.realizado)} gradiente={["#f6dc7a", "#d99a00"]} textoEscuro chave="real" formato="pct"
          destaque={`Previsto ${pct(k.avanco.previsto)} · ${difPp >= 0 ? "+" : ""}${difPp.toFixed(1).replace(".", ",")} p.p.`} detalhe={`Na semana: +${pct(k.avanco.semanaRealizado)}`}
          serie={k.avanco.serie} />
        {verValores && <>
          <KpiGradiente titulo="Executado (cobrança)" valor={moeda(k.executado.total)} gradiente={["#14b8a6", "#065f46"]} chave="acumulado"
            destaque={k.executado.maior ? `Maior medição: nº ${k.executado.maior.numero}` : "Sem medições ainda"} detalhe={k.executado.maior ? moeda(k.executado.maior.valor) : undefined}
            serie={k.executado.serie} />
          <KpiGradiente titulo="Saldo a medir" valor={moeda(k.saldoMedir.valor)} gradiente={["#6366f1", "#312e81"]} chave="valor"
            destaque={`de ${moeda(k.executado.contratoLiquido)} (contrato − entrada ± ajustes)`} serie={k.saldoMedir.serie} />
          <KpiGradiente titulo="Fornecedores a pagar" valor={moeda(k.fornecedores.aPagar)} gradiente={["#f43f5e", "#831843"]} chave="valor"
            destaque={`Executado e não pago: ${moeda(k.fornecedores.executadoNaoPago)}`} detalhe={`Pago na semana: ${moeda(k.fornecedores.pagoSemana)}`}
            serie={k.fornecedores.serie} />
        </>}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {/* Atividades da semana */}
        <Bloco titulo={`Atividades da semana ${d.semana}`} className="xl:col-span-2"
          acoes={<Link href={`/obras/${id}?aba=fisico&vista=semana&semana=${d.semana}`} className="text-xs text-[#f2d468] hover:underline">Lançar realizado →</Link>}>
          {d.daSemana.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma atividade prevista para esta semana.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-zinc-400"><tr><th className="pb-2 font-medium">Atividade</th><th className="pb-2 font-medium">Situação</th><th className="hidden w-40 pb-2 font-medium sm:table-cell">Acumulado × previsto</th><th className="pb-2 text-right font-medium" title="Realizado na semana / previsto na semana">Semana real / prev.</th></tr></thead>
                <tbody className="divide-y divide-zinc-800">
                  {d.daSemana.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2 pr-3"><div className="text-zinc-100">{a.descricao}</div><div className="text-xs text-zinc-500">{a.etapa}{a.fornecedor ? ` · ${a.fornecedor}` : ""}<span className="sm:hidden"> · {pct(a.realizadoAte)} de {pct(a.previstoAte)}</span></div></td>
                      <td className="py-2 pr-3"><span className={clsx("whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", COR_SIT[a.situacao])}>{SITUACAO_ATIVIDADE[a.situacao]}</span></td>
                      <td className="hidden py-2 pr-3 sm:table-cell">
                        <div className="relative h-2 rounded-full bg-zinc-800" title={`Realizado ${pct(a.realizadoAte)} · previsto ${pct(a.previstoAte)}`}>
                          <div className="h-2 rounded-full bg-[#f2d468]" style={{ width: `${Math.min(a.realizadoAte, 1) * 100}%` }} />
                          <div className="absolute -top-1 h-4 w-0.5 bg-zinc-300" style={{ left: `${Math.min(a.previstoAte, 1) * 100}%` }} />
                        </div>
                        <div className="mt-0.5 text-[10px] text-zinc-500">{pct(a.realizadoAte)} de {pct(a.previstoAte)} previsto</div>
                      </td>
                      <td className="tabular py-2 text-right text-xs text-zinc-300">{pct(a.realizadoSemana)} <span className="text-zinc-500">/ {pct(a.previstoSemana)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d.proxima.length > 0 && (
            <p className="mt-3 border-t border-zinc-800 pt-3 text-xs text-zinc-400"><b className="text-zinc-300">Próxima semana:</b> {d.proxima.slice(0, 8).map((x) => x.descricao).join(" · ")}{d.proxima.length > 8 ? ` e mais ${d.proxima.length - 8}` : ""}</p>
          )}
        </Bloco>

        {/* Itens importantes */}
        <Bloco titulo="Não esquecer nesta semana">
          {d.pendencias.length > 0 && (
            <ul className="mb-3 space-y-1.5 border-b border-zinc-800 pb-3">
              {d.pendencias.map((p, i) => { const I = ICONE[p.gravidade]; return (
                <li key={i}><Link href={`/obras/${id}?aba=fisico&vista=${p.vista}`} className="flex gap-2 text-sm text-zinc-200 hover:text-white hover:underline"><I className={clsx("mt-0.5 size-4 shrink-0", COR_ICONE[p.gravidade])} />{p.texto}</Link></li>
              ); })}
            </ul>
          )}
          <LembretesSemana lembretes={d.lembretes} semana={d.semana} editavel={editaLembretes}
            criar={criarLembreteAcao.bind(null, id, d.semana)} marcar={marcarLembreteAcao.bind(null, id)} excluir={excluirLembreteAcao.bind(null, id)} />
        </Bloco>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {/* Atividades executadas */}
        <Bloco titulo={`Executado na semana ${d.semana}`}>
          {d.executadas.length === 0 ? <p className="text-sm text-zinc-500">Nenhum avanço lançado nesta semana.</p> : (
            <ul className="space-y-2">
              {d.executadas.slice(0, 10).map((x) => (
                <li key={x.id}>
                  <div className="flex justify-between gap-2 text-xs"><span className="truncate text-zinc-200" title={x.descricao}>{x.descricao}</span><span className="tabular shrink-0 text-zinc-400">+{pct(x.semana)} · {x.acumulado >= 1 - 1e-6 ? "concluída" : `${pct(x.acumulado)} acum.`}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-zinc-800"><div className="h-2 rounded-full bg-gradient-to-r from-[#f6dc7a] to-[#d99a00]" style={{ width: `${(x.contribuicao / maxExec) * 100}%` }} /></div>
                </li>
              ))}
              {d.executadas.length > 10 && <li className="text-xs text-zinc-500">+ {d.executadas.length - 10} atividade(s)</li>}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-zinc-500">Barra = contribuição para o avanço da obra na semana (peso pela duração).</p>
        </Bloco>

        {verValores && <>
          {/* Medições */}
          <Bloco titulo="Medições" acoes={<Link href={`/obras/${id}?aba=fisico&vista=medicoes`} className="text-xs text-[#f2d468] hover:underline">Abrir medições →</Link>}>
            <GraficoMedicoesObra dados={d.medicoes.map((m) => ({ rotulo: `M${m.numero} ${ddmm(m.data)}`, previsto: m.previsto, realizado: m.realizado }))} />
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {d.medicoes.filter((m) => m.estado !== "FUTURA").map((m) => (
                <li key={m.numero} className={clsx("rounded-full px-2 py-0.5 text-[11px]", m.estado === "FECHADA" ? (m.situacao === "PAGA" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300") : m.estado === "A_FECHAR" ? "bg-amber-500/15 text-amber-200" : "bg-zinc-700/60 text-zinc-300")}>
                  M{m.numero}: {m.estado === "FECHADA" ? (m.situacao === "PAGA" ? "paga" : "não paga") : m.estado === "A_FECHAR" ? "a fechar" : "em andamento"}
                </li>
              ))}
            </ul>
          </Bloco>

          {/* Saldos */}
          <Bloco titulo="Saldos">
            <RoscaSaldos partes={[
              { nome: "Quitado pelo cliente", valor: d.saldos.quitado, cor: "#22c55e" },
              { nome: "Executado a cobrar", valor: d.saldos.aCobrar, cor: "#f2d468" },
              { nome: "A executar", valor: d.saldos.aExecutar, cor: "#6366f1" },
            ]} />
            <dl className="mt-3 grid grid-cols-2 gap-y-1 border-t border-zinc-800 pt-3 text-xs">
              <dt className="text-zinc-400">Contrato</dt><dd className="tabular text-right">{moeda(d.saldos.contrato)}</dd>
              <dt className="text-zinc-400">Saldo do cliente a pagar</dt><dd className="tabular text-right font-semibold text-[#f2d468]">{moeda(d.saldos.saldo)}</dd>
            </dl>
            {d.saldos.fornecedores.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-zinc-800 pt-3">
                {d.saldos.fornecedores.slice(0, 5).map((f) => (
                  <li key={f.nome} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 truncate text-zinc-300">{f.nome}</span>
                    <span className="relative h-2 flex-1 rounded-full bg-zinc-800"><span className="absolute inset-y-0 left-0 rounded-full bg-rose-500" style={{ width: `${f.acertado > 0 ? Math.min(f.aPagar / f.acertado, 1) * 100 : 0}%` }} /></span>
                    <span className="tabular w-20 shrink-0 text-right text-zinc-200">{moeda(f.aPagar)}</span>
                  </li>
                ))}
                <li className="text-[11px] text-zinc-500">Fornecedores: a pagar (barra = parte do acertado ainda não paga)</li>
              </ul>
            )}
          </Bloco>
        </>}
      </div>
    </div>
  );
}

import Link from "next/link";
import { db } from "@/db";
import { formatarData, formatarMoeda, formatarPercentual } from "@/dominio/formato";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { minhasTarefas } from "@/servicos/quadros";
import { painelFinanceiro } from "@/servicos/financeiro";
import { painelObras } from "@/servicos/painel-obras";
import { painelEngenheiros } from "@/servicos/painel-engenheiros";
import { PainelEngenheiros } from "@/componentes/painel-engenheiros";
import clsx from "clsx";
import { Monitor } from "lucide-react";
import { hojeIso } from "@/dominio/calendario";
import { situacaoCartao } from "@/dominio/quadro";
import { PainelObras } from "@/componentes/painel-obras";
import { Aviso, CabecalhoPagina, Cartao, Indicador, LinkBotao } from "@/componentes/ui";

export const metadata = { title: "Painel de obras" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirPermissaoPagina("dashboard");
  const p = await searchParams;
  const hoje = hojeIso();
  const acesso = { id: u.id, empresaId: u.empresaId, acessoTodasObras: u.perfil.acessoTodasObras };
  const verQuadro = temPermissao(u, "quadro");
  const verFin = temPermissao(u, "financeiro");
  // Valores (cobrança, saldo, fornecedores) só para quem vê medições e orçamentos.
  const verValores = temPermissao(u, "medicoes") && temPermissao(u, "orcamentos");
  const visao = p.visao === "cartoes" || !verValores ? "cartoes" : "engenheiros";
  const [cartoes, eng, tarefas, fin] = await Promise.all([
    painelObras(db, acesso, hoje),
    visao === "engenheiros" ? painelEngenheiros(db, acesso) : Promise.resolve(null),
    verQuadro ? minhasTarefas(db, u.empresaId, u.id) : Promise.resolve([]),
    verFin ? painelFinanceiro(db, u.empresaId) : Promise.resolve(null),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo="Painel de obras"
        subtitulo={`Olá, ${u.nome.split(" ")[0]}. Situação das obras ativas em ${formatarData(hoje)}.`}
        acoes={temPermissao(u, "obras", "criar") && <LinkBotao href="/obras/nova">+ Nova obra</LinkBotao>}
      />
      {p.senha === "alterada" && <div className="mb-4"><Aviso tom="sucesso">Senha alterada com sucesso.</Aviso></div>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-borda bg-white p-0.5 text-sm" role="tablist" aria-label="Visão do painel">
          {verValores && <Link href="/?visao=engenheiros" role="tab" aria-selected={visao === "engenheiros"} className={clsx("rounded-md px-3 py-1.5 font-medium", visao === "engenheiros" ? "bg-marca text-white" : "text-suave hover:text-texto")}>Por engenheiro</Link>}
          <Link href="/?visao=cartoes" role="tab" aria-selected={visao === "cartoes"} className={clsx("rounded-md px-3 py-1.5 font-medium", visao === "cartoes" ? "bg-marca text-white" : "text-suave hover:text-texto")}>Cartões e pendências</Link>
        </div>
        {verValores && <Link href="/painel-tv" target="_blank" className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-borda bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"><Monitor className="size-4" /> Modo TV</Link>}
      </div>

      {visao === "engenheiros" && eng ? (
        <PainelEngenheiros resumo={eng.resumo} grupos={eng.grupos} ritmos={Object.fromEntries(cartoes.map((c) => [c.id, { ritmo: c.ritmo, realizado: c.realizado }]))} />
      ) : (
        <PainelObras cartoes={cartoes} verValores={verValores} hoje={hoje} />
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {verQuadro && (
          <Cartao titulo="Minhas tarefas" acoes={<Link href="/quadros/calendario" className="text-xs underline decoration-destaque decoration-2 underline-offset-4">Calendário</Link>}>
            {tarefas.length === 0 ? <p className="text-sm text-suave">Nenhuma tarefa em aberto atribuída a você.</p> : (
              <ul className="space-y-2">
                {tarefas.map((t) => {
                  const s = situacaoCartao({ dataEntrega: t.dataEntrega, concluido: false }, hoje);
                  return (
                    <li key={t.id} className="flex items-start justify-between gap-3 text-sm">
                      <Link href={`/quadros/${t.quadroId}?cartao=${t.id}`} className="min-w-0 hover:underline decoration-destaque decoration-2 underline-offset-4">
                        <span className="block truncate">{t.titulo}</span>
                        <span className="block text-xs text-suave">{t.quadroNome} · {t.colunaNome}</span>
                      </Link>
                      {t.dataEntrega && (
                        <span className={s === "ATRASADO" ? "shrink-0 rounded bg-red-50 px-1.5 text-xs font-medium text-red-800" : s === "HOJE" ? "shrink-0 rounded bg-destaque px-1.5 text-xs font-medium text-zinc-900" : "tabular shrink-0 text-xs text-suave"}>
                          {s === "ATRASADO" ? "atrasada · " : s === "HOJE" ? "hoje · " : ""}{formatarData(t.dataEntrega).slice(0, 5)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Cartao>
        )}
        {fin && (
          <div className={verQuadro ? "lg:col-span-2" : "lg:col-span-3"}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-suave">Financeiro da empresa</h2>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
              <Indicador rotulo="Saldo em contas" valor={formatarMoeda(fin.saldoTotal)} tom={fin.saldoTotal < 0 ? "perigo" : undefined} />
              <Indicador rotulo="Faturamento do mês" valor={formatarMoeda(fin.resultadoMes.receitas)} detalhe={`No ano: ${formatarMoeda(fin.resultadoAno.receitas)}`} />
              <Indicador rotulo="Resultado do ano" valor={formatarMoeda(fin.resultadoAno.resultadoOperacional)} tom={fin.resultadoAno.resultadoOperacional < 0 ? "perigo" : "sucesso"} detalhe={fin.resultadoAno.margem == null ? undefined : `Margem ${formatarPercentual(fin.resultadoAno.margem)}`} />
              <Indicador rotulo="A pagar (30 dias)" valor={formatarMoeda(fin.aPagar.trinta)} detalhe={fin.aPagar.vencido ? `Vencido: ${formatarMoeda(fin.aPagar.vencido)}` : "Nada vencido"} tom={fin.aPagar.vencido ? "perigo" : undefined} />
              <Indicador rotulo="A receber" valor={formatarMoeda(fin.aReceber.total)} detalhe={fin.aReceber.vencido ? `Vencido: ${formatarMoeda(fin.aReceber.vencido)}` : undefined} tom={fin.aReceber.vencido ? "alerta" : undefined} />
            </div>
            <p className="mt-2 text-xs text-suave"><Link href="/financeiro" className="underline decoration-destaque decoration-2 underline-offset-4">Abrir o painel financeiro</Link> · resultado sem empréstimos, aplicações e transferências (D12).</p>
          </div>
        )}
      </div>
    </>
  );
}

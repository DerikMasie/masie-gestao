import Link from "next/link";
import { AlertTriangle, Clock, FileWarning } from "lucide-react";
import { db } from "@/db";
import { formatarData, formatarMoeda, formatarPercentual } from "@/dominio/formato";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { listarObras } from "@/servicos/obras";
import { indicadoresPainel } from "@/servicos/painel";
import { minhasTarefas } from "@/servicos/quadros";
import { hojeIso } from "@/dominio/calendario";
import { situacaoCartao } from "@/dominio/quadro";
import { GraficoSituacoes } from "@/componentes/graficos";
import { BarraPrazo, SeloPrazo, SeloSituacao } from "@/componentes/rotulos";
import { Aviso, CabecalhoPagina, Cartao, Indicador, LinkBotao, Tabela, Vazio } from "@/componentes/ui";

export const metadata = { title: "Dashboard" };

const ICONE_ALERTA = { ATRASO: AlertTriangle, PRAZO_PROXIMO: Clock, SEM_ORCAMENTO: FileWarning };

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirPermissaoPagina("dashboard");
  const p = await searchParams;
  const acesso = { id: u.id, empresaId: u.empresaId, acessoTodasObras: u.perfil.acessoTodasObras };
  const verQuadro = temPermissao(u, "quadro");
  const [i, todas, tarefas] = await Promise.all([
    indicadoresPainel(db, acesso, { obraId: p.obra || undefined, inicioDe: p.de || undefined, inicioAte: p.ate || undefined }),
    listarObras(db, acesso, { ordem: "codigo", direcao: "desc" }),
    verQuadro ? minhasTarefas(db, u.empresaId, u.id) : Promise.resolve([]),
  ]);
  const hoje = hojeIso();

  return (
    <>
      <CabecalhoPagina
        titulo={`Olá, ${u.nome.split(" ")[0]}`}
        subtitulo="Visão consolidada das obras da Masie Engenharia"
        acoes={temPermissao(u, "obras", "criar") && <LinkBotao href="/obras/nova">+ Nova obra</LinkBotao>}
      />
      {p.senha === "alterada" && <div className="mb-4"><Aviso tom="sucesso">Senha alterada com sucesso.</Aviso></div>}

      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-borda bg-white p-3 text-sm">
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-suave">Obra</span>
          <select name="obra" defaultValue={p.obra ?? ""} className="rounded-lg border border-borda px-2 py-1.5">
            <option value="">Todas as obras</option>
            {todas.map((o) => <option key={o.id} value={o.id}>{o.codigo} · {o.nome}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-suave">Início de</span>
          <input type="date" name="de" defaultValue={p.de} className="rounded-lg border border-borda px-2 py-1.5" /></label>
        <label className="flex flex-col gap-1"><span className="text-xs font-medium text-suave">até</span>
          <input type="date" name="ate" defaultValue={p.ate} className="rounded-lg border border-borda px-2 py-1.5" /></label>
        <button className="rounded-lg bg-marca px-3 py-1.5 font-medium text-white">Filtrar</button>
        {(p.obra || p.de || p.ate) && <Link href="/" className="py-1.5 text-suave hover:text-texto">Limpar</Link>}
      </form>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador rotulo="Obras ativas" valor={i.ativas} detalhe={`${i.total} obra(s) cadastradas`} />
        <Indicador rotulo="Atrasadas" valor={i.atrasadas} tom={i.atrasadas ? "perigo" : undefined} detalhe="Término contratual vencido" />
        <Indicador rotulo="No prazo" valor={i.noPrazo} tom={i.noPrazo ? "sucesso" : undefined} detalhe={`${i.concluidas} concluída(s)`} />
        <Indicador rotulo="Carteira contratada" valor={formatarMoeda(i.carteiraContratada)}
          detalhe={i.margemPrevistaPonderada == null ? "Margem prevista: informe o orçamento de custos" : `Margem prevista ponderada: ${formatarPercentual(i.margemPrevistaPonderada)}`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Cartao titulo="Obras ativas — prazo contratual decorrido" className="lg:col-span-3" semPadding>
          {i.obrasAtivas.length === 0 ? <Vazio titulo="Nenhuma obra ativa">Obras nas situações Contratada, Em andamento ou Paralisada aparecem aqui.</Vazio> : (
            <Tabela>
              <thead><tr><th>Obra</th><th>Situação</th><th className="w-40">Prazo</th><th>Término</th><th>Status</th></tr></thead>
              <tbody>
                {i.obrasAtivas.map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/obras/${o.id}`} className="font-medium hover:underline decoration-destaque decoration-2 underline-offset-4">{o.codigo}</Link><div className="max-w-56 truncate text-xs text-suave">{o.nome}</div></td>
                    <td><SeloSituacao situacao={o.situacao} /></td>
                    <td><BarraPrazo fracao={o.prazoDecorrido} /></td>
                    <td className="tabular whitespace-nowrap">{formatarData(o.dataFimContratual)}</td>
                    <td><SeloPrazo status={o.status} diasAtraso={o.diasAtraso} /></td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Cartao>
        <div className="min-w-0 space-y-6 lg:col-span-2">
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
          <Cartao titulo="Alertas">
            {i.alertas.length === 0 ? <p className="text-sm text-suave">Nenhum alerta no momento.</p> : (
              <ul className="space-y-2">
                {i.alertas.map((a, n) => {
                  const Icone = ICONE_ALERTA[a.tipo];
                  return (
                    <li key={n} className="flex gap-2 text-sm">
                      <Icone className={a.tipo === "ATRASO" ? "mt-0.5 size-4 shrink-0 text-perigo" : "mt-0.5 size-4 shrink-0 text-alerta"} aria-hidden />
                      <Link href={`/obras/${a.obraId}`} className="hover:underline decoration-destaque decoration-2 underline-offset-4">{a.texto}</Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Cartao>
          <Cartao titulo="Valor contratado por situação">
            <GraficoSituacoes dados={i.porSituacao} />
          </Cartao>
        </div>
      </div>

      <p className="mt-6 text-xs text-suave">
        Indicadores financeiros (faturamento, recebimentos, contas a pagar, fluxo de caixa e lucro) passam a ser exibidos a partir da Fase 3, calculados dos lançamentos reais — não são simulados.
      </p>
    </>
  );
}

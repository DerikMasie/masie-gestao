import Link from "next/link";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { db } from "@/db";
import { hojeIso } from "@/dominio/calendario";
import { formatarData } from "@/dominio/formato";
import { CORES_ETIQUETA, gradeDoMes, mesVizinho, nomeDoMes, situacaoCartao, type CorEtiqueta } from "@/dominio/quadro";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { cartoesDoPeriodo, listarQuadros } from "@/servicos/quadros";
import { listarUsuariosAtivos } from "@/servicos/usuarios";
import { BotaoEnviar, Campo, CampoSelecao, Formulario } from "@/componentes/formulario";
import { CabecalhoPagina } from "@/componentes/ui";
import { criarCartaoRapidoAcao } from "../acoes";

export const metadata = { title: "Calendário" };
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const uuid = /^[0-9a-f-]{36}$/;

export default async function Calendario({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirPermissaoPagina("quadro");
  const sp = await searchParams;
  const hoje = hojeIso();
  const mes = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : hoje.slice(0, 7);
  const grade = gradeDoMes(mes, hoje);
  const filtros = {
    quadroId: sp.quadro && uuid.test(sp.quadro) ? sp.quadro : undefined,
    responsavelId: sp.resp && uuid.test(sp.resp) ? sp.resp : undefined,
  };
  const [cartoes, quadros, usuarios] = await Promise.all([
    cartoesDoPeriodo(db, u.empresaId, { de: grade[0]![0]!.data, ate: grade.at(-1)!.at(-1)!.data, ...filtros, incluirConcluidos: sp.concluidos === "1" }),
    listarQuadros(db, u.empresaId),
    listarUsuariosAtivos(db, u.empresaId),
  ]);
  const porDia = new Map<string, typeof cartoes>();
  for (const c of cartoes) porDia.set(c.dataEntrega!, [...(porDia.get(c.dataEntrega!) ?? []), c]);
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v) as [string, string][]);
    return `/quadros/calendario?${p}`;
  };
  const podeCriar = temPermissao(u, "quadro", "criar");
  const ativos = quadros.filter((q) => !q.arquivado);

  return (
    <>
      <CabecalhoPagina titulo="Calendário de atividades" subtitulo="Cartões de todos os quadros pela data de entrega" voltar={{ href: "/quadros", rotulo: "Quadros" }} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={qs({ mes: mesVizinho(mes, -1), novo: undefined })} className="rounded-lg border border-borda bg-white p-1.5 hover:bg-zinc-50" aria-label="Mês anterior"><ChevronLeft className="size-4" /></Link>
          <h2 className="min-w-44 text-center text-lg font-semibold">{nomeDoMes(mes).replace(/^./, (l) => l.toUpperCase())}</h2>
          <Link href={qs({ mes: mesVizinho(mes, 1), novo: undefined })} className="rounded-lg border border-borda bg-white p-1.5 hover:bg-zinc-50" aria-label="Próximo mês"><ChevronRight className="size-4" /></Link>
          {mes !== hoje.slice(0, 7) && <Link href={qs({ mes: undefined, novo: undefined })} className="ml-2 text-sm underline decoration-destaque decoration-2 underline-offset-4">Hoje</Link>}
        </div>
        <form className="flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="mes" value={mes} />
          <select name="quadro" defaultValue={sp.quadro ?? ""} className="rounded-lg border border-borda bg-white px-2 py-1.5" aria-label="Quadro">
            <option value="">Todos os quadros</option>{ativos.map((q) => <option key={q.id} value={q.id}>{q.nome}</option>)}
          </select>
          <select name="resp" defaultValue={sp.resp ?? ""} className="rounded-lg border border-borda bg-white px-2 py-1.5" aria-label="Responsável">
            <option value="">Todos</option><option value={u.id}>Somente meus</option>
            {usuarios.filter((x) => x.id !== u.id).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
          <label className="flex items-center gap-1.5"><input type="checkbox" name="concluidos" value="1" defaultChecked={sp.concluidos === "1"} /> Concluídos</label>
          <button className="rounded-lg bg-marca px-3 py-1.5 font-medium text-white">Filtrar</button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-borda bg-white shadow-sm">
        <div className="grid min-w-[720px] grid-cols-7 border-b border-borda bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-suave">
          {DIAS.map((d) => <div key={d} className="px-2 py-2">{d}</div>)}
        </div>
        <div className="grid min-w-[720px] grid-cols-7">
          {grade.flat().map((dia) => {
            const lista = porDia.get(dia.data) ?? [];
            return (
              <div key={dia.data} className={clsx("group min-h-28 border-r border-b border-borda p-1.5 [&:nth-child(7n)]:border-r-0", !dia.doMes && "bg-zinc-50/70", dia.fimDeSemana && dia.doMes && "bg-zinc-50/40")}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={clsx("tabular flex size-6 items-center justify-center rounded-full text-xs", dia.hoje ? "bg-destaque font-bold text-zinc-900" : dia.doMes ? "text-texto" : "text-zinc-400")}>{Number(dia.data.slice(8))}</span>
                  {podeCriar && ativos.length > 0 && <Link href={qs({ novo: dia.data })} scroll={false} className="rounded p-0.5 text-zinc-400 opacity-0 hover:bg-zinc-100 hover:text-zinc-900 focus:opacity-100 group-hover:opacity-100" aria-label={`Novo cartão em ${formatarData(dia.data)}`}><Plus className="size-3.5" /></Link>}
                </div>
                <ul className="space-y-1">
                  {lista.slice(0, 4).map((c) => {
                    const cor = c.corEtiqueta ? CORES_ETIQUETA[c.corEtiqueta as CorEtiqueta] : null;
                    const atrasado = situacaoCartao({ dataEntrega: c.dataEntrega, concluido: c.concluida }, hoje) === "ATRASADO";
                    return (
                      <li key={c.id}>
                        <Link href={`/quadros/${c.quadroId}?cartao=${c.id}`} title={`${c.titulo} · ${c.quadroNome} · ${c.colunaNome}${c.responsavelNome ? ` · ${c.responsavelNome}` : ""}`}
                          className={clsx("block truncate rounded border-l-[3px] bg-zinc-100 px-1.5 py-0.5 text-[11px] leading-tight hover:bg-zinc-200", c.concluida && "text-suave line-through", atrasado && "bg-red-50 text-red-900")}
                          style={{ borderLeftColor: cor?.borda ?? "#a1a1aa" }}>
                          {atrasado && "⚠ "}{c.titulo}
                        </Link>
                      </li>
                    );
                  })}
                  {lista.length > 4 && <li className="px-1 text-[11px] text-suave">+{lista.length - 4} mais</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-3 text-xs text-suave">Cores: primeira etiqueta do cartão. ⚠ = entrega vencida. Passe o mouse sobre um dia e clique em + para criar um cartão naquela data.</p>

      {sp.novo && /^\d{4}-\d{2}-\d{2}$/.test(sp.novo) && podeCriar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <Link href={qs({ novo: undefined })} scroll={false} className="absolute inset-0 bg-black/30" aria-label="Fechar" />
          <div className="relative w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Novo cartão para {formatarData(sp.novo)}</h2>
              <Link href={qs({ novo: undefined })} scroll={false} aria-label="Fechar"><X className="size-5" /></Link>
            </div>
            <Formulario acao={criarCartaoRapidoAcao.bind(null, filtros.quadroId ?? ativos[0]!.id, null)} limparAoSalvar>
              <CampoSelecao nome="quadroId" rotulo="Quadro" defaultValue={filtros.quadroId ?? ativos[0]!.id} opcoes={ativos.map((q) => ({ valor: q.id, rotulo: q.nome }))} />
              <Campo nome="titulo" rotulo="Título" obrigatorio autoFocus />
              <CampoSelecao nome="responsavelId" rotulo="Responsável" vazio="—" defaultValue={u.id} opcoes={usuarios.map((x) => ({ valor: x.id, rotulo: x.nome }))} />
              <Campo nome="dataEntrega" rotulo="Entrega" type="date" defaultValue={sp.novo} />
              <BotaoEnviar>Criar na primeira coluna</BotaoEnviar>
            </Formulario>
          </div>
        </div>
      )}
    </>
  );
}

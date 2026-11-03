"use client";

import Link from "next/link";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent } from "react";
import { AlertTriangle, CalendarClock, CheckSquare, MessageSquare, AlignLeft, Plus, HardHat } from "lucide-react";
import { CORES_ETIQUETA, iniciais, situacaoCartao, type CorEtiqueta } from "@/dominio/quadro";
import type { EstadoForm } from "@/lib/acoes";
import { BotaoEnviar, Formulario } from "./formulario";

export interface ColunaK { id: string; nome: string; concluida: boolean; limite: number | null }
export interface EtiquetaK { id: string; nome: string; cor: string }
export interface CartaoK {
  id: string; colunaId: string; titulo: string; dataEntrega: string | null; responsavelNome: string | null;
  obraCodigo: string | null; etiquetas: string[]; checklistTotal: number; checklistFeitos: number; comentarios: number; temDescricao: boolean;
}

const fmtCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function SeloEtiqueta({ e }: { e: EtiquetaK }) {
  const c = CORES_ETIQUETA[(e.cor as CorEtiqueta)] ?? CORES_ETIQUETA.cinza;
  return <span className="inline-flex max-w-full items-center truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight" style={{ background: c.fundo, color: c.texto }}>{e.nome}</span>;
}

function SeloPrazoCartao({ data, concluido, hoje }: { data: string | null; concluido: boolean; hoje: string }) {
  if (!data) return null;
  const s = situacaoCartao({ dataEntrega: data, concluido }, hoje);
  const estilo = {
    ATRASADO: "bg-red-50 text-red-800", HOJE: "bg-destaque text-zinc-900", PROXIMO: "bg-destaque-suave text-destaque-texto",
    NO_PRAZO: "text-suave", CONCLUIDO: "bg-green-50 text-green-800", SEM_DATA: "",
  }[s];
  const rotulo = { ATRASADO: "atrasado", HOJE: "hoje", PROXIMO: "", NO_PRAZO: "", CONCLUIDO: "", SEM_DATA: "" }[s];
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium", estilo)} title={`Entrega ${fmtCurta(data)}`}>
      {s === "ATRASADO" ? <AlertTriangle className="size-3" aria-hidden /> : <CalendarClock className="size-3" aria-hidden />}
      {fmtCurta(data)}{rotulo && ` · ${rotulo}`}
    </span>
  );
}

type Mover = (cartaoId: string, colunaId: string, antesDe: string | null) => Promise<EstadoForm>;
type CriarRapido = (colunaId: string | null, e: EstadoForm, fd: FormData) => Promise<EstadoForm>;

export function QuadroKanban({ quadroId, colunas, cartoes: iniciaisCartoes, etiquetas, hoje, podeEditar, podeCriar, mover, criarRapido }: {
  quadroId: string; colunas: ColunaK[]; cartoes: CartaoK[]; etiquetas: EtiquetaK[]; hoje: string;
  podeEditar: boolean; podeCriar: boolean; mover: Mover; criarRapido: CriarRapido;
}) {
  const [cartoes, setCartoes] = useState(iniciaisCartoes);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<{ colunaId: string; antesDe: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  const anterior = useRef(iniciaisCartoes);
  useEffect(() => { setCartoes(iniciaisCartoes); anterior.current = iniciaisCartoes; }, [iniciaisCartoes]);

  const mapaEtq = useMemo(() => new Map(etiquetas.map((e) => [e.id, e])), [etiquetas]);
  const porColuna = useMemo(() => {
    const m = new Map<string, CartaoK[]>(colunas.map((c) => [c.id, []]));
    for (const c of cartoes) m.get(c.colunaId)?.push(c);
    return m;
  }, [cartoes, colunas]);

  function soltar(colunaId: string, antesDe: string | null) {
    const id = arrastando;
    setArrastando(null); setAlvo(null);
    if (!id || id === antesDe) return;
    const atual = cartoes.find((c) => c.id === id);
    if (!atual) return;
    // Atualização otimista: reposiciona localmente e confirma no servidor.
    const semEle = cartoes.filter((c) => c.id !== id);
    const movido = { ...atual, colunaId };
    const idx = antesDe ? semEle.findIndex((c) => c.id === antesDe) : -1;
    const novo = idx >= 0 ? [...semEle.slice(0, idx), movido, ...semEle.slice(idx)] : [...semEle, movido];
    const backup = cartoes;
    setCartoes(novo);
    iniciar(async () => {
      const r = await mover(id, colunaId, antesDe);
      if (r.erro) { setCartoes(backup); setErro(r.erro); setTimeout(() => setErro(null), 5000); }
    });
  }

  const sobre = (e: DragEvent, colunaId: string, antesDe: string | null) => {
    if (!arrastando) return;
    e.preventDefault(); e.stopPropagation();
    if (alvo?.colunaId !== colunaId || alvo.antesDe !== antesDe) setAlvo({ colunaId, antesDe });
  };

  return (
    <div className="relative">
      {erro && <div role="alert" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">{erro}</div>}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        {colunas.map((col) => {
          const lista = porColuna.get(col.id) ?? [];
          const cheia = col.limite != null && lista.length >= col.limite;
          return (
            <section key={col.id} aria-label={col.nome}
              className={clsx("flex w-72 shrink-0 snap-start flex-col rounded-xl border bg-zinc-100/80", alvo?.colunaId === col.id ? "border-zinc-900" : "border-borda")}
              onDragOver={(e) => sobre(e, col.id, null)} onDrop={(e) => { e.preventDefault(); soltar(col.id, alvo?.colunaId === col.id ? alvo.antesDe : null); }}>
              <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  {col.concluida && <span className="size-2 rounded-full bg-sucesso" aria-hidden />}
                  {col.nome}
                </h3>
                <span className={clsx("tabular rounded-full px-2 text-xs", cheia ? "bg-destaque text-zinc-900" : "bg-white text-suave")} title={col.limite ? `Limite: ${col.limite}` : undefined}>
                  {lista.length}{col.limite ? `/${col.limite}` : ""}
                </span>
              </header>
              <ol className="flex min-h-12 flex-1 flex-col gap-2 px-2 pb-2">
                {lista.map((c) => (
                  <li key={c.id}
                    draggable={podeEditar}
                    onDragStart={(e) => { setArrastando(c.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.id); }}
                    onDragEnd={() => { setArrastando(null); setAlvo(null); }}
                    onDragOver={(e) => sobre(e, col.id, c.id)}
                    className={clsx(arrastando === c.id && "opacity-40")}>
                    {alvo?.colunaId === col.id && alvo.antesDe === c.id && arrastando !== c.id && <div className="mb-2 h-1 rounded bg-destaque" />}
                    <Link href={`/quadros/${quadroId}?cartao=${c.id}`} scroll={false}
                      className={clsx("block rounded-lg border border-borda bg-white p-2.5 shadow-sm transition hover:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-destaque", podeEditar && "cursor-grab active:cursor-grabbing")}>
                      {c.etiquetas.length > 0 && (
                        <div className="mb-1.5 flex flex-wrap gap-1">{c.etiquetas.map((id) => mapaEtq.get(id)).filter(Boolean).map((e) => <SeloEtiqueta key={e!.id} e={e!} />)}</div>
                      )}
                      <p className={clsx("text-sm leading-snug", col.concluida && "text-suave line-through decoration-zinc-400")}>{c.titulo}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-suave">
                        <SeloPrazoCartao data={c.dataEntrega} concluido={col.concluida} hoje={hoje} />
                        {c.obraCodigo && <span className="inline-flex items-center gap-0.5"><HardHat className="size-3" aria-hidden />{c.obraCodigo}</span>}
                        {c.temDescricao && <AlignLeft className="size-3" aria-label="Tem descrição" />}
                        {c.checklistTotal > 0 && (
                          <span className={clsx("inline-flex items-center gap-0.5", c.checklistFeitos === c.checklistTotal && "text-sucesso")}>
                            <CheckSquare className="size-3" aria-hidden />{c.checklistFeitos}/{c.checklistTotal}
                          </span>
                        )}
                        {c.comentarios > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare className="size-3" aria-hidden />{c.comentarios}</span>}
                        {c.responsavelNome && (
                          <span className="ml-auto flex size-6 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-semibold text-destaque" title={c.responsavelNome}>
                            {iniciais(c.responsavelNome)}
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
                {alvo?.colunaId === col.id && alvo.antesDe === null && arrastando && <li className="h-1 rounded bg-destaque" aria-hidden />}
              </ol>
              {podeCriar && <NovoCartaoRapido acao={(e, fd) => criarRapido(col.id, e, fd)} />}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function NovoCartaoRapido({ acao }: { acao: (e: EstadoForm, fd: FormData) => Promise<EstadoForm> }) {
  const [aberto, setAberto] = useState(false);
  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="m-2 mt-0 flex items-center gap-1 rounded-lg px-2 py-1.5 text-left text-sm text-suave hover:bg-white hover:text-texto">
        <Plus className="size-4" /> Adicionar cartão
      </button>
    );
  }
  return (
    <div className="px-2 pb-2">
      <Formulario acao={acao} limparAoSalvar className="!space-y-2">
        <textarea name="titulo" rows={2} autoFocus required placeholder="Título do cartão" aria-label="Título do novo cartão"
          className="block w-full rounded-lg border border-borda bg-white px-2 py-1.5 text-sm shadow-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-destaque/60"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } if (e.key === "Escape") setAberto(false); }} />
        <input type="date" name="dataEntrega" aria-label="Data de entrega" className="block w-full rounded-lg border border-borda bg-white px-2 py-1 text-xs" />
        <div className="flex gap-2">
          <BotaoEnviar className="!px-3 !py-1.5">Adicionar</BotaoEnviar>
          <button type="button" onClick={() => setAberto(false)} className="px-2 text-sm text-suave">Cancelar</button>
        </div>
      </Formulario>
    </div>
  );
}

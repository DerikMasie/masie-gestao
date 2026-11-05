"use client";

import clsx from "clsx";
import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { avisosCores, CORES_PADRAO, escurecer, PALETAS, textoSobre, type CoresRelatorio } from "@/dominio/relatorio";
import type { EstadoForm } from "@/lib/acoes";

const igual = (a: CoresRelatorio, b: CoresRelatorio) => a.principal === b.principal && a.destaque === b.destaque && a.fundo === b.fundo;

/** Escolha das cores do relatório da obra: paletas prontas, cores livres e prévia ao vivo. */
export function CoresRelatorioEditor({ atual, editavel, salvar }: { atual: CoresRelatorio; editavel: boolean; salvar: (c: CoresRelatorio | null) => Promise<EstadoForm> }) {
  const [c, setC] = useState(atual);
  const [msg, setMsg] = useState<{ tom: "ok" | "erro" | "aviso"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const avisos = avisosCores(c);
  const mudou = !igual(c, atual);
  const gravar = (v: CoresRelatorio | null) => iniciar(async () => {
    const r = await salvar(v);
    if (r.erro) setMsg({ tom: "erro", texto: r.erro });
    else { setMsg({ tom: "ok", texto: r.mensagem ?? "Salvo." }); if (!v) setC(CORES_PADRAO); }
  });
  const campo = (k: keyof CoresRelatorio, rotulo: string, ajuda: string) => (
    <label className="flex items-center gap-3 text-sm">
      <input type="color" value={c[k]} disabled={!editavel} onChange={(e) => setC({ ...c, [k]: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-borda bg-white p-0.5" aria-label={rotulo} />
      <span><span className="font-medium">{rotulo}</span> <span className="tabular text-xs text-suave">{c[k]}</span><span className="block text-xs text-suave">{ajuda}</span></span>
    </label>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {PALETAS.map((p) => (
            <button key={p.id} type="button" disabled={!editavel} onClick={() => setC(p.cores)} title={p.nome}
              className={clsx("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs", igual(c, p.cores) ? "border-zinc-900 ring-2 ring-destaque" : "border-borda bg-white hover:bg-zinc-50")}>
              <span className="flex overflow-hidden rounded">
                <span className="size-4" style={{ background: p.cores.principal }} /><span className="size-4" style={{ background: p.cores.destaque }} /><span className="size-4" style={{ background: p.cores.fundo }} />
              </span>
              {p.nome}{igual(c, p.cores) && <Check className="size-3.5" />}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {campo("principal", "Principal", "Faixas de título, barras, rosca e linha do realizado")}
          {campo("destaque", "Destaque", "Marca nas faixas, borda das seções e traço do previsto")}
          {campo("fundo", "Fundo das seções", "Tom claro atrás dos títulos das seções")}
        </div>
        {avisos.map((a) => <p key={a} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{a}</p>)}
        {editavel && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!mudou || pendente} onClick={() => gravar(c)} className="inline-flex items-center gap-2 rounded-lg bg-marca px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
              {pendente && <Loader2 className="size-4 animate-spin" />} Salvar cores da obra
            </button>
            {!igual(atual, CORES_PADRAO) && <button type="button" disabled={pendente} onClick={() => gravar(null)} className="rounded-lg px-3 py-2 text-sm text-suave hover:bg-zinc-100">Voltar ao padrão Masie</button>}
            {mudou && <button type="button" onClick={() => setC(atual)} className="rounded-lg px-3 py-2 text-sm text-suave hover:bg-zinc-100">Desfazer</button>}
          </div>
        )}
        {msg && <p role="status" className={clsx("text-sm", msg.tom === "erro" ? "text-perigo" : "text-sucesso")}>{msg.texto}</p>}
        <p className="text-xs text-suave">As cores valem para as prévias e para os próximos relatórios emitidos desta obra. Relatórios já emitidos mantêm as cores da emissão.</p>
      </div>

      {/* Prévia ao vivo (miniatura da página 1) */}
      <div className="mx-auto w-full max-w-sm rounded-lg border border-borda bg-white p-4 text-[10px] shadow-sm" aria-label="Prévia das cores">
        <div className="text-sm font-bold tracking-wide text-zinc-900">RELATÓRIO SEMANAL</div>
        <div className="font-semibold">Cliente</div>
        <div className="-mx-4 my-2 flex items-center gap-1.5 px-4 py-1.5 font-bold tracking-widest" style={{ background: c.principal, color: textoSobre(c.principal) }}>
          <span className="inline-block h-3 w-1" style={{ background: c.destaque }} /> SITUAÇÃO DA OBRA
        </div>
        <div className="flex items-center gap-3">
          <div className="grid size-16 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${c.principal} 0 64.5%, #ececea 64.5% 100%)` }}>
            <div className="grid size-11 place-items-center rounded-full bg-white text-[10px] font-bold">64,5%</div>
          </div>
          <div className="flex-1 space-y-1">
            {[0.92, 0.37, 0.77, 0.5].map((v, i) => (
              <div key={i} className="relative h-1.5 rounded-full bg-zinc-100">
                <div className="h-1.5 rounded-full" style={{ width: `${v * 100}%`, background: c.principal }} />
                <div className="absolute -top-0.5 h-2.5 w-px" style={{ left: `${Math.min(v + 0.08, 1) * 100}%`, background: escurecer(c.destaque, 0.45) }} />
              </div>
            ))}
          </div>
        </div>
        <svg viewBox="0 0 200 50" className="mt-2 w-full">
          <polyline points="0,45 40,32 80,26 120,18 160,8 200,4" fill="none" stroke="#a1a1aa" strokeDasharray="4 3" strokeWidth="1.5" />
          <polyline points="0,47 40,36 80,28 120,22" fill="none" stroke={c.principal} strokeWidth="2" />
        </svg>
        <div className="mt-2 border-l-[3px] px-2 py-1 font-bold tracking-wide" style={{ background: c.fundo, borderColor: c.destaque }}>TAREFAS FINALIZADAS E EM ANDAMENTO</div>
        <div className="px-1 py-1 text-suave">• Serviço — concluído</div>
      </div>
    </div>
  );
}

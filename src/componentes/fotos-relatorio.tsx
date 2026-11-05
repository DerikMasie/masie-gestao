"use client";

import clsx from "clsx";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Camera, Crosshair, Loader2, Trash2 } from "lucide-react";
import { FOTOS_POR_PAGINA, paginarFotos } from "@/dominio/relatorio";
import type { EstadoForm } from "@/lib/acoes";

export interface FotoRelatorio { id: string; anexoId: string; legenda: string | null; focoX: number; focoY: number }

/** Reduz a foto no próprio aparelho (lado maior 1800 px, JPEG 82%) antes de enviar: upload rápido mesmo no 4G. */
async function reduzir(arquivo: File): Promise<File> {
  const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" }).catch(() => null);
  if (!bitmap) return arquivo;
  const escala = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
  if (!blob) return arquivo;
  return new File([blob], arquivo.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

export function FotosRelatorio({ fotos, editavel, enviar, salvar, mover, remover }: {
  fotos: FotoRelatorio[]; editavel: boolean;
  enviar: (fd: FormData) => Promise<EstadoForm>;
  salvar: (fotoId: string, d: { legenda: string | null; focoX: number; focoY: number }) => Promise<EstadoForm>;
  mover: (fotoId: string, direcao: -1 | 1) => Promise<EstadoForm>;
  remover: (fotoId: string) => Promise<EstadoForm>;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [focando, setFocando] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [legendas, setLegendas] = useState<Record<string, string>>({});

  async function aoEscolher(lista: FileList | null) {
    if (!lista?.length) return;
    setErro(null);
    const arquivos = [...lista];
    for (const [i, a] of arquivos.entries()) {
      setProgresso(`Enviando ${i + 1} de ${arquivos.length}…`);
      const fd = new FormData();
      fd.set("foto", await reduzir(a));
      const r = await enviar(fd);
      if (r.erro) { setErro(`${a.name}: ${r.erro}`); break; }
    }
    setProgresso(null);
    if (entrada.current) entrada.current.value = "";
    router.refresh();
  }
  const executar = (f: () => Promise<EstadoForm>) => iniciar(async () => { const r = await f(); if (r.erro) setErro(r.erro); else router.refresh(); });

  const paginas = paginarFotos(fotos.length);
  return (
    <div className="space-y-4">
      {editavel && (
        <div className="flex flex-wrap items-center gap-3">
          <input ref={entrada} type="file" accept="image/*" multiple className="hidden" onChange={(e) => aoEscolher(e.target.files)} aria-label="Escolher fotos" />
          <button type="button" disabled={!!progresso} onClick={() => entrada.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-marca px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {progresso ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} {progresso ?? "Adicionar fotos"}
          </button>
          <span className="text-xs text-suave">{fotos.length} foto(s) · recomendado 6 a 12 · até 6 por página, sempre simétricas · recorte 4:3. Clique em <Crosshair className="inline size-3" /> e depois no ponto da foto que deve ficar no centro.</span>
        </div>
      )}
      {erro && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">{erro}</div>}
      {fotos.length === 0 && <p className="rounded-xl border border-dashed border-borda bg-white px-4 py-10 text-center text-sm text-suave">Nenhuma foto ainda.{editavel && " Use \"Adicionar fotos\" (no celular, abre a câmera ou a galeria)."}</p>}

      {paginas.map((pag, ip) => (
        <div key={ip} className="rounded-xl border border-borda bg-white p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-suave">Página de fotos {ip + 1} · {pag.map((l) => l.fotos.length).join(" + ")}</div>
          <div className="mx-auto max-w-2xl space-y-3">
            {pag.map((linha, il) => (
              <div key={il} className="flex justify-center gap-3">
                {linha.fotos.map((i) => {
                  const f = fotos[i]!;
                  const largura = linha.colunas === 1 ? (pag.length === 1 ? "w-full" : "w-[78%]") : "w-[calc(50%-0.375rem)]";
                  return (
                    <figure key={f.id} className={clsx(largura, "group")}>
                      <div className={clsx("relative aspect-[4/3] overflow-hidden rounded-md bg-zinc-100", focando === f.id && "cursor-crosshair ring-4 ring-destaque")}
                        onClick={(e) => {
                          if (focando !== f.id) return;
                          const r = e.currentTarget.getBoundingClientRect();
                          // O clique é sobre a imagem já recortada: aproxima o foco movendo na direção clicada.
                          const x = Math.round(Math.min(100, Math.max(0, f.focoX + ((e.clientX - r.left) / r.width - 0.5) * 100)));
                          const y = Math.round(Math.min(100, Math.max(0, f.focoY + ((e.clientY - r.top) / r.height - 0.5) * 100)));
                          setFocando(null);
                          executar(() => salvar(f.id, { legenda: legendas[f.id] ?? f.legenda, focoX: x, focoY: y }));
                        }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/anexos/${f.anexoId}`} alt={f.legenda ?? `Foto ${i + 1}`} loading="lazy" className="size-full object-cover" style={{ objectPosition: `${f.focoX}% ${f.focoY}%` }} />
                        <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 text-xs font-semibold text-white">{i + 1}</span>
                        {editavel && (
                          <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                            <button type="button" title="Mover para trás" disabled={i === 0 || pendente} onClick={(e) => { e.stopPropagation(); executar(() => mover(f.id, -1)); }} className="rounded bg-white/90 p-1 disabled:opacity-40"><ArrowLeft className="size-3.5" /></button>
                            <button type="button" title="Mover para frente" disabled={i === fotos.length - 1 || pendente} onClick={(e) => { e.stopPropagation(); executar(() => mover(f.id, 1)); }} className="rounded bg-white/90 p-1 disabled:opacity-40"><ArrowRight className="size-3.5" /></button>
                            <button type="button" title="Escolher o ponto de foco" onClick={(e) => { e.stopPropagation(); setFocando(focando === f.id ? null : f.id); }} className={clsx("rounded p-1", focando === f.id ? "bg-destaque" : "bg-white/90")}><Crosshair className="size-3.5" /></button>
                            <button type="button" title="Remover" disabled={pendente} onClick={(e) => { e.stopPropagation(); if (confirm("Remover esta foto do relatório?")) executar(() => remover(f.id)); }} className="rounded bg-white/90 p-1 text-perigo"><Trash2 className="size-3.5" /></button>
                          </div>
                        )}
                        {focando === f.id && <span className="absolute inset-x-0 bottom-0 bg-black/70 py-1 text-center text-xs text-white">Clique no ponto que deve ficar no centro</span>}
                      </div>
                      {editavel ? (
                        <input value={legendas[f.id] ?? f.legenda ?? ""} placeholder="Legenda (opcional)" maxLength={200}
                          onChange={(e) => setLegendas((l) => ({ ...l, [f.id]: e.target.value }))}
                          onBlur={() => { const v = legendas[f.id]; if (v != null && v !== (f.legenda ?? "")) executar(() => salvar(f.id, { legenda: v || null, focoX: f.focoX, focoY: f.focoY })); }}
                          className="mt-1 w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs outline-none hover:border-borda focus:border-zinc-400" />
                      ) : f.legenda ? <figcaption className="mt-1 text-xs text-suave">{f.legenda}</figcaption> : null}
                    </figure>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ))}
      {fotos.length > FOTOS_POR_PAGINA * 2 && <p className="text-xs text-suave">Mais de 12 fotos: o relatório terá {paginas.length} páginas de fotos.</p>}
    </div>
  );
}

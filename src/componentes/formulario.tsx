"use client";

import clsx from "clsx";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { EstadoForm } from "@/lib/acoes";

type Acao = (estado: EstadoForm, fd: FormData) => Promise<EstadoForm>;

const CtxErros = createContext<Record<string, string>>({});
/** Estado "enviando" do formulário (null fora de <Formulario>, usa useFormStatus). */
const CtxPendente = createContext<boolean | null>(null);

/**
 * Envio sem o reset automático do React 19: os campos digitados são preservados quando a
 * validação falha; só são limpos após sucesso se `limparAoSalvar`.
 */
function enviarSemReset(executar: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => executar(fd));
  };
}

export function Formulario({ acao, children, className, limparAoSalvar, aoSalvar }: {
  acao: Acao; children: ReactNode; className?: string; limparAoSalvar?: boolean; aoSalvar?: () => void;
}) {
  const [estado, executar, pendente] = useActionState(acao, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) {
      if (limparAoSalvar) ref.current?.reset();
      aoSalvar?.();
    }
  }, [estado, limparAoSalvar, aoSalvar]);
  return (
    <form ref={ref} onSubmit={enviarSemReset(executar)} className={clsx("space-y-4", className)} noValidate>
      {estado.erro && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{estado.erro}</div>}
      {estado.ok && estado.mensagem && <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">{estado.mensagem}</div>}
      {estado.segredo && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Senha provisória (será exibida apenas agora):</p>
          <code className="mt-1 block select-all rounded bg-white px-2 py-1 text-base">{estado.segredo}</code>
          <p className="mt-1 text-xs">Envie ao usuário por um canal seguro. A troca será exigida no primeiro acesso.</p>
        </div>
      )}
      <CtxPendente.Provider value={pendente}>
        <CtxErros.Provider value={estado.campos ?? {}}>{children}</CtxErros.Provider>
      </CtxPendente.Provider>
    </form>
  );
}

const estiloCampo = "block w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-destaque/60 disabled:bg-zinc-50";

function Rotulo({ nome, rotulo, obrigatorio, ajuda, children }: { nome: string; rotulo: string; obrigatorio?: boolean; ajuda?: ReactNode; children: ReactNode }) {
  const erro = useContext(CtxErros)[nome];
  return (
    <div>
      <label htmlFor={nome} className="mb-1 block text-sm font-medium">{rotulo}{obrigatorio && <span className="text-perigo"> *</span>}</label>
      {children}
      {erro ? <p className="mt-1 text-xs text-perigo">{erro}</p> : ajuda ? <p className="mt-1 text-xs text-suave">{ajuda}</p> : null}
    </div>
  );
}

export function Campo({ nome, rotulo, obrigatorio, ajuda, className, ...p }: ComponentProps<"input"> & { nome: string; rotulo: string; obrigatorio?: boolean; ajuda?: ReactNode }) {
  const erro = useContext(CtxErros)[nome];
  return (
    <Rotulo nome={nome} rotulo={rotulo} obrigatorio={obrigatorio} ajuda={ajuda}>
      <input id={nome} name={nome} aria-invalid={Boolean(erro)} className={clsx(estiloCampo, erro && "border-perigo", className)} {...p} />
    </Rotulo>
  );
}

export function CampoArea({ nome, rotulo, ajuda, ...p }: ComponentProps<"textarea"> & { nome: string; rotulo: string; ajuda?: ReactNode }) {
  return (
    <Rotulo nome={nome} rotulo={rotulo} ajuda={ajuda}>
      <textarea id={nome} name={nome} rows={3} className={estiloCampo} {...p} />
    </Rotulo>
  );
}

export function CampoSelecao({ nome, rotulo, obrigatorio, opcoes, vazio, ajuda, ...p }: ComponentProps<"select"> & {
  nome: string; rotulo: string; obrigatorio?: boolean; opcoes: { valor: string; rotulo: string }[]; vazio?: string; ajuda?: ReactNode;
}) {
  const erro = useContext(CtxErros)[nome];
  return (
    <Rotulo nome={nome} rotulo={rotulo} obrigatorio={obrigatorio} ajuda={ajuda}>
      <select id={nome} name={nome} aria-invalid={Boolean(erro)} className={clsx(estiloCampo, erro && "border-perigo")} {...p}>
        {vazio !== undefined && <option value="">{vazio}</option>}
        {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>
    </Rotulo>
  );
}

export function Caixa({ nome, rotulo, ...p }: ComponentProps<"input"> & { nome: string; rotulo: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" name={nome} className="size-4 rounded border-borda accent-[var(--marca)]" {...p} />
      {rotulo}
    </label>
  );
}

export function BotaoEnviar({ children, variante = "primario", className }: { children: ReactNode; variante?: "primario" | "perigo" | "secundario"; className?: string }) {
  const ctx = useContext(CtxPendente);
  const { pending: statusForm } = useFormStatus();
  const pending = ctx ?? statusForm;
  const v = { primario: "bg-marca text-white hover:opacity-90", perigo: "bg-perigo text-white hover:opacity-90", secundario: "border border-borda bg-white hover:bg-zinc-50" }[variante];
  return (
    <button type="submit" disabled={pending} className={clsx("inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-60", v, className)}>
      {pending ? "Salvando…" : children}
    </button>
  );
}

/** Botão de ação destrutiva com confirmação, executa a action e mostra erro, se houver. */
export function AcaoConfirmada({ acao, confirmacao, children, campos, variante = "perigo" }: {
  acao: Acao; confirmacao: string; children: ReactNode; campos?: Record<string, string>; variante?: "perigo" | "secundario";
}) {
  const [estado, executar, pendente] = useActionState(acao, {});
  const enviar = enviarSemReset(executar);
  return (
    <form onSubmit={(e) => { if (!confirm(confirmacao)) { e.preventDefault(); return; } enviar(e); }} className="inline">
      {Object.entries(campos ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <CtxPendente.Provider value={pendente}><BotaoEnviar variante={variante}>{children}</BotaoEnviar></CtxPendente.Provider>
      {estado.erro && <p role="alert" className="mt-2 text-xs text-perigo">{estado.erro}</p>}
      {estado.segredo && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          Nova senha provisória (exibida só agora): <code className="select-all font-semibold">{estado.segredo}</code>
        </p>
      )}
    </form>
  );
}

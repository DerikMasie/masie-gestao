"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import {
  Building2, ClipboardList, HardHat, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, Truck, UserRound, Users, X,
} from "lucide-react";

const ICONES = { LayoutDashboard, HardHat, Users, Truck, UserRound, ShieldCheck, Building2, ClipboardList, Settings } as const;
export type IconeMenu = keyof typeof ICONES;

export interface ItemMenu { href: string; rotulo: string; icone: IconeMenu; grupo?: string }

export function MenuLateral({ itens, usuario, perfil, sair }: { itens: ItemMenu[]; usuario: string; perfil: string; sair: () => Promise<void> }) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  const ativo = (href: string) => (href === "/" ? caminho === "/" : caminho === href || caminho.startsWith(href + "/"));
  let grupoAnterior: string | undefined;

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-borda bg-white px-4 lg:hidden">
        <button onClick={() => setAberto(true)} aria-label="Abrir menu" className="rounded p-1.5 hover:bg-slate-100"><Menu className="size-5" /></button>
        <span className="font-semibold">Masie Gestão</span>
        <span className="w-8" />
      </header>
      {aberto && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setAberto(false)} />}
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#0f1f33] text-slate-200 transition-transform lg:translate-x-0",
        aberto ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2" onClick={() => setAberto(false)}>
            <span className="flex size-8 items-center justify-center rounded-lg bg-marca font-bold text-white ring-1 ring-white/20">M</span>
            <span className="leading-tight"><span className="block text-sm font-semibold text-white">Masie Gestão</span><span className="block text-[11px] text-slate-400">Masie Engenharia</span></span>
          </Link>
          <button className="lg:hidden" onClick={() => setAberto(false)} aria-label="Fechar menu"><X className="size-5" /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {itens.map((i) => {
            const Icone = ICONES[i.icone];
            const cabecalho = i.grupo && i.grupo !== grupoAnterior ? i.grupo : null;
            grupoAnterior = i.grupo;
            return (
              <div key={i.href}>
                {cabecalho && <div className="mt-4 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{cabecalho}</div>}
                <Link href={i.href} onClick={() => setAberto(false)}
                  className={clsx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition", ativo(i.href) ? "bg-white/10 font-medium text-white" : "text-slate-300 hover:bg-white/5 hover:text-white")}>
                  <Icone className="size-4 shrink-0" /> {i.rotulo}
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <Link href="/conta/senha" className="block rounded-lg px-3 py-2 hover:bg-white/5" onClick={() => setAberto(false)}>
            <span className="block truncate text-sm font-medium text-white">{usuario}</span>
            <span className="block truncate text-xs text-slate-400">{perfil} · alterar senha</span>
          </Link>
          <form action={sair}>
            <button className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"><LogOut className="size-4" /> Sair</button>
          </form>
        </div>
      </aside>
    </>
  );
}

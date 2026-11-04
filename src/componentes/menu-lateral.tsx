"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { LogoMasie } from "./logo";
import {
  Building2, CalendarClock, CalendarDays, ClipboardList, FileText, HardHat, KanbanSquare, Landmark, LayoutDashboard, ListOrdered, ListTree, LogOut, Menu, PieChart, Receipt, Settings, ShieldCheck, Truck, Upload, UserRound, Users, Wallet, X,
} from "lucide-react";

const ICONES = { LayoutDashboard, HardHat, Users, Truck, UserRound, ShieldCheck, Building2, ClipboardList, Settings, KanbanSquare, CalendarDays, Wallet, Receipt, CalendarClock, ListOrdered, PieChart, FileText, Upload, ListTree, Landmark } as const;
export type IconeMenu = keyof typeof ICONES;

export interface ItemMenu { href: string; rotulo: string; icone: IconeMenu; grupo?: string }

export function MenuLateral({ itens, usuario, perfil, sair }: { itens: ItemMenu[]; usuario: string; perfil: string; sair: () => Promise<void> }) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  const ativo = (href: string) => {
    if (href === "/") return caminho === "/";
    // o item mais específico vence (ex.: /quadros/calendario não acende /quadros)
    const casa = (h: string) => caminho === h || caminho.startsWith(h + "/");
    return casa(href) && !itens.some((o) => o.href !== href && o.href.startsWith(href + "/") && casa(o.href));
  };
  let grupoAnterior: string | undefined;

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-borda bg-white px-4 lg:hidden">
        <button onClick={() => setAberto(true)} aria-label="Abrir menu" className="rounded p-1.5 hover:bg-zinc-100"><Menu className="size-5" /></button>
        <LogoMasie compacto />
        <span className="w-8" />
      </header>
      {aberto && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setAberto(false)} />}
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-lateral text-zinc-300 transition-transform lg:translate-x-0",
        aberto ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="flex h-20 items-center justify-between px-5">
          <Link href="/" className="flex items-center" onClick={() => setAberto(false)} aria-label="Masie Gestão — início">
            <LogoMasie compacto claro />
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
                {cabecalho && <div className="mt-4 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{cabecalho}</div>}
                <Link href={i.href} onClick={() => setAberto(false)}
                  className={clsx("relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition", ativo(i.href) ? "bg-white/10 font-medium text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white")}>
                  {ativo(i.href) && <span aria-hidden className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-destaque" />}
                  <Icone className={clsx("size-4 shrink-0", ativo(i.href) && "text-destaque")} /> {i.rotulo}
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <Link href="/conta/senha" className="block rounded-lg px-3 py-2 hover:bg-white/5" onClick={() => setAberto(false)}>
            <span className="block truncate text-sm font-medium text-white">{usuario}</span>
            <span className="block truncate text-xs text-zinc-500">{perfil} · alterar senha</span>
          </Link>
          <form action={sair}>
            <button className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-white/5 hover:text-white"><LogOut className="size-4" /> Sair</button>
          </form>
        </div>
      </aside>
    </>
  );
}

"use client";

import { useTransition } from "react";
import type { EstadoForm } from "@/lib/acoes";

/** Alterna "boleto programado" (coluna da aba Contas a Pagar do Financeiro). */
export function BotaoProgramar({ acao, programado }: { acao: () => Promise<EstadoForm>; programado: boolean }) {
  const [pendente, iniciar] = useTransition();
  return (
    <button disabled={pendente} onClick={() => iniciar(async () => { await acao(); })}
      className="mt-1 block text-xs text-suave underline-offset-2 hover:underline disabled:opacity-50">
      {pendente ? "…" : programado ? "Desmarcar programado" : "Marcar boleto programado"}
    </button>
  );
}

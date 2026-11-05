"use client";

import { useEffect } from "react";

/**
 * Rolagem automática para o modo TV: se o conteúdo não couber na tela, desce suavemente até o fim no meio do
 * intervalo e volta ao topo antes da troca de obra. Não faz nada quando tudo cabe na tela.
 */
export function RolagemTv({ segundos }: { segundos: number }) {
  useEffect(() => {
    const sobra = () => document.documentElement.scrollHeight - window.innerHeight;
    if (sobra() < 8) return;
    let raf = 0;
    const inicio = performance.now();
    const descerDe = 0.2, descerAte = 0.75, subirEm = 0.88;
    const passo = (t: number) => {
      const f = (t - inicio) / (segundos * 1000);
      if (f >= descerDe && f <= descerAte) window.scrollTo(0, sobra() * ((f - descerDe) / (descerAte - descerDe)));
      if (f >= subirEm) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [segundos]);
  return null;
}

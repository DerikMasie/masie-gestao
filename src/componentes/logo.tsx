import clsx from "clsx";

/**
 * Símbolo da Masie Engenharia (dois edifícios em traço), redesenhado em vetor a partir do logo enviado.
 * Usa `currentColor`, então funciona sobre fundo claro ou escuro.
 * Para fidelidade total, substituir pelo arquivo vetorial oficial (SVG/AI/PDF) quando disponível.
 */
export function SimboloMasie({ className }: { className?: string }) {
  return (
    <svg viewBox="100 40 375 700" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={24} strokeLinejoin="miter" strokeLinecap="butt">
      <path d="M122 735 V392 L335 234 V735" />
      <path d="M240 735 V64 L450 224 V735" />
    </svg>
  );
}

export function LogoMasie({ className, compacto, claro }: { className?: string; compacto?: boolean; claro?: boolean }) {
  return (
    <span className={clsx("inline-flex items-end gap-2", claro ? "text-white" : "text-[#3a3a3c]", className)}>
      <SimboloMasie className={compacto ? "h-8 w-auto" : "h-12 w-auto"} />
      <span className="leading-none">
        <span className={clsx("block font-semibold tracking-[0.12em]", compacto ? "text-lg" : "text-2xl")}>MASIE</span>
        <span className={clsx("mt-1 flex items-center gap-1 tracking-[0.32em]", compacto ? "text-[8px]" : "text-[10px]")}>
          <span className={clsx("inline-block w-[3px] self-stretch", claro ? "bg-white" : "bg-[#3a3a3c]")} />ENGENHARIA
        </span>
      </span>
    </span>
  );
}

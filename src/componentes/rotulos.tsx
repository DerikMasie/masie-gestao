import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { SITUACOES_OBRA, type SituacaoObra, type StatusPrazo } from "@/dominio/obra";
import { Selo, type Tom } from "./ui";

const TOM_SITUACAO: Record<SituacaoObra, Tom> = {
  PROSPECCAO: "cinza", EM_ORCAMENTO: "roxo", CONTRATADA: "azul", EM_ANDAMENTO: "verde",
  PARALISADA: "amarelo", CONCLUIDA: "cinza", CANCELADA: "vermelho",
};

export function SeloSituacao({ situacao }: { situacao: SituacaoObra }) {
  return <Selo tom={TOM_SITUACAO[situacao]}>{SITUACOES_OBRA[situacao]}</Selo>;
}

/** Status de prazo: sempre ícone + texto (cor nunca sozinha). */
export function SeloPrazo({ status, diasAtraso }: { status: StatusPrazo; diasAtraso?: number }) {
  switch (status) {
    case "ATRASADA":
      return <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-perigo"><AlertTriangle className="size-3.5" />Atrasada {diasAtraso ? `(${diasAtraso} d)` : ""}</span>;
    case "CONCLUIDA_COM_ATRASO":
      return <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-alerta"><AlertTriangle className="size-3.5" />Concluída c/ atraso</span>;
    case "CONCLUIDA_NO_PRAZO":
      return <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-sucesso"><CheckCircle2 className="size-3.5" />Concluída no prazo</span>;
    case "NO_PRAZO":
      return <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-sucesso"><CheckCircle2 className="size-3.5" />No prazo</span>;
    case "NAO_INICIADA":
      return <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-suave"><Clock className="size-3.5" />Não iniciada</span>;
    default:
      return <span className="text-xs text-suave">—</span>;
  }
}

/** Barra de prazo decorrido (0–100%+). Vermelha quando passa do término contratual. */
export function BarraPrazo({ fracao }: { fracao: number }) {
  const pct = Math.min(fracao, 1) * 100;
  return (
    <div className="flex items-center gap-2" title={`${Math.round(fracao * 100)}% do prazo contratual decorrido`}>
      <div className="h-2 w-full min-w-16 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: fracao > 1 ? "#d03b3b" : "#2a78d6" }} />
      </div>
      <span className="tabular w-10 text-right text-xs text-suave">{Math.round(fracao * 100)}%</span>
    </div>
  );
}

import type { ParametrosOrcamento } from "@/dominio/orcamento";
import { Campo, CampoSelecao } from "./formulario";

const pct = (v: number) => String(Number((v * 100).toFixed(3))).replace(".", ",");
const moeda = (v: number) => (v ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "");

/** Campos de parâmetros do orçamento (percentuais digitados em %). */
export function CamposParametros({ p }: { p: ParametrosOrcamento }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo nome="bdiMaoDeObra" rotulo="BDI / margem mão de obra (%)" obrigatorio inputMode="decimal" defaultValue={pct(p.bdiMaoDeObra)} ajuda="Padrão Masie: 30%" />
        <Campo nome="bdiMaterial" rotulo="BDI / margem material (%)" obrigatorio inputMode="decimal" defaultValue={pct(p.bdiMaterial)} ajuda="Padrão Masie: 10% (gerenciamento)" />
        <Campo nome="impostos" rotulo="Impostos (%)" obrigatorio inputMode="decimal" defaultValue={pct(p.impostos)} ajuda="Simples, anexos III/IV: 9% a 12%" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo nome="adicionalHorario" rotulo="Adicional de horário (%)" inputMode="decimal" defaultValue={pct(p.adicionalHorario)} ajuda="Noturno ou fim de semana; incide na MO" />
        <Campo nome="adicionalLocal" rotulo="Adicional de local (%)" inputMode="decimal" defaultValue={pct(p.adicionalLocal)} ajuda="Distância ou acesso; incide na MO" />
        <Campo nome="minimoMaoDeObra" rotulo="Valor mínimo de MO por item (R$)" inputMode="decimal" defaultValue={moeda(p.minimoMaoDeObra)} placeholder="Sem mínimo" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoSelecao nome="formaImposto" rotulo="Cálculo do imposto" defaultValue={p.formaImposto} ajuda="Por dentro: total = venda ÷ (1 − imposto). Por fora: total = venda × (1 + imposto)." opcoes={[
          { valor: "POR_DENTRO", rotulo: "Por dentro, sobre o total (recomendado)" },
          { valor: "POR_FORA", rotulo: "Por fora, somado à venda (planilha)" },
        ]} />
        <CampoSelecao nome="arredondamento" rotulo="Arredondamento" defaultValue={p.arredondamento} opcoes={[
          { valor: "CENTAVOS", rotulo: "Centavos (recomendado)" },
          { valor: "REAL_ACIMA", rotulo: "Real inteiro para cima por linha (planilha)" },
        ]} />
      </div>
    </div>
  );
}

import { and, gt, inArray } from "drizzle-orm";
import type { Executor } from "@/db";
import { relatorioSemanal } from "@/db/schema";
import { hojeIso, paraData } from "@/dominio/calendario";
import { calcularPrazo, type SituacaoObra } from "@/dominio/obra";
import { classificarRitmo, pendenciasObra, type Pendencia, type Ritmo } from "@/dominio/painel-obras";
import { carregarMedicoes } from "./medicoes";
import { listarObras } from "./obras";

export interface CartaoObra {
  id: string; codigo: string; nome: string; cliente: string; cidade: string | null; situacao: SituacaoObra; gestor: string | null;
  semanaAtual: number; nSemanas: number;
  realizado: number | null; previsto: number | null; ritmo: Ritmo;
  curva: { semana: number; previsto: number; realizado: number | null }[];
  prazo: { status: string; prazoDecorrido: number; diasAtraso: number; dataInicio: string; dataFim: string };
  contrato: number; executado: number; quitado: number; aCobrar: number; saldo: number;
  medicaoAberta: { numero: number; cobranca: number; estado: string; data: string } | null;
  medicoes: { numero: number; data: string; cobranca: number; estado: string; situacao: string }[];
  fornecedoresAPagar: number; executadoNaoPago: number;
  ultimoRelatorio: { semana: number; versao: number; emitidoEm: string | null } | null;
  pendencias: Pendencia[];
}

const SITUACOES_ATIVAS: SituacaoObra[] = ["CONTRATADA", "EM_ANDAMENTO", "PARALISADA"];

/** Dados do painel de obras: uma linha por obra ativa visível ao usuário. */
export async function painelObras(db: Executor, u: { id: string; empresaId: string; acessoTodasObras: boolean }, hoje = hojeIso()): Promise<CartaoObra[]> {
  const obras = (await listarObras(db, u, { situacao: "ATIVAS", ordem: "codigo", direcao: "asc" })).filter((o) => SITUACOES_ATIVAS.includes(o.situacao));
  if (!obras.length) return [];
  const rels = await db.select().from(relatorioSemanal).where(and(inArray(relatorioSemanal.obraId, obras.map((o) => o.id)), gt(relatorioSemanal.versao, 0)));
  const diaSemana = ((paraData(hoje).getUTCDay() + 6) % 7) + 1; // 1 = segunda … 7 = domingo

  const cartoes: CartaoObra[] = [];
  for (const o of obras) {
    const m = await carregarMedicoes(db, u.empresaId, o.id, hoje);
    const f = m.fisico;
    const a = f.avanco;
    const ref = Math.min(Math.max(f.semanaAtual, 0), a.semanas);
    const temServicos = f.servicos.length > 0;
    const temPrevisto = f.servicos.some((s) => Object.keys(s.previsto).length > 0);
    const realizado = temServicos ? (ref >= 1 ? a.acumulado[ref - 1]!.realizado : 0) : null;
    const previsto = temServicos && temPrevisto ? (ref >= 1 ? a.acumulado[ref - 1]!.previsto : 0) : null;
    const prazo = calcularPrazo(o, hoje);
    const semanasComPrevisto = new Set<number>(), semanasComRealizado = new Set<number>();
    for (const s of f.servicos) {
      for (const [k, v] of Object.entries(s.previsto)) if (v) semanasComPrevisto.add(Number(k));
      for (const [k, v] of Object.entries(s.realizado)) if (v) semanasComRealizado.add(Number(k));
    }
    const relsObra = rels.filter((r) => r.obraId === o.id);
    const ultimo = relsObra.sort((x, y) => y.semana - x.semana)[0];
    const acima = f.servicos.filter((s) => s.maoDeObraAcertada != null && s.maoDeObraAcertada > s.maoDeObraVerba + 0.005);
    const aberta = m.linhas.find((l) => l.estado !== "FECHADA") ?? null;
    const fimCurva = Math.max(a.acumulado.findIndex((p) => p.previsto >= 1 - 1e-6) + 1, ref, 1);

    cartoes.push({
      id: o.id, codigo: o.codigo, nome: o.nome, cliente: o.clienteNome, cidade: o.cidade, situacao: o.situacao, gestor: o.gestorNome,
      semanaAtual: f.semanaAtual, nSemanas: f.nSemanas, realizado, previsto, ritmo: classificarRitmo(realizado, previsto),
      curva: a.acumulado.slice(0, Math.min(fimCurva, a.semanas)).map((p) => ({ semana: p.semana, previsto: p.previsto, realizado: p.semana <= ref ? p.realizado : null })),
      prazo: { status: prazo.status, prazoDecorrido: prazo.prazoDecorrido, diasAtraso: prazo.diasAtraso, dataInicio: o.dataInicio, dataFim: o.dataFimContratual },
      contrato: m.resumo.contrato, executado: m.resumo.executado, quitado: m.resumo.quitadas, aCobrar: m.resumo.aCobrar, saldo: m.resumo.saldo,
      medicaoAberta: aberta ? { numero: aberta.numero, cobranca: aberta.cobranca, estado: aberta.estado, data: aberta.data } : null,
      medicoes: m.linhas.filter((l) => l.estado !== "FUTURA").map((l) => ({ numero: l.numero, data: l.data, cobranca: l.cobranca, estado: l.estado, situacao: l.situacao })),
      fornecedoresAPagar: m.fornecedores.reduce((t, x) => t + x.aPagar, 0),
      executadoNaoPago: m.fornecedores.filter((x) => x.fornecedorId).reduce((t, x) => t + Math.max(x.executadoNaoPago, 0), 0),
      ultimoRelatorio: ultimo ? { semana: ultimo.semana, versao: ultimo.versao, emitidoEm: ultimo.emitidoEm?.toISOString() ?? null } : null,
      pendencias: pendenciasObra({
        hoje, diaSemana, semanaAtual: f.semanaAtual, temServicos, temPrevisto, semanasComPrevisto, semanasComRealizado,
        relatoriosEmitidos: new Set(relsObra.map((r) => r.semana)), inicioObra: o.dataInicio,
        medicoes: m.linhas.map((l) => ({ numero: l.numero, estado: l.estado, cobranca: l.cobranca, situacao: l.situacao, data: l.data })),
        fornecedoresExecutadoNaoPago: m.fornecedores.filter((x) => x.fornecedorId).map((x) => ({ nome: x.nome, valor: x.executadoNaoPago })),
        acimaDaVerba: { quantidade: acima.length, excesso: acima.reduce((t, s) => t + (s.maoDeObraAcertada! - s.maoDeObraVerba), 0) },
        prazo: { status: prazo.status, prazoDecorrido: prazo.prazoDecorrido, diasAtraso: prazo.diasAtraso, dataFim: o.dataFimContratual },
        realizado,
      }),
    });
  }
  return cartoes;
}

import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import type { Executor } from "@/db";
import { auditoria, usuario } from "@/db/schema";
import { hojeIso } from "@/dominio/calendario";
import { calcularPrazo, obraAtiva, SITUACOES_OBRA, type SituacaoObra } from "@/dominio/obra";
import { listarObras } from "./obras";

export interface IndicadoresPainel {
  total: number;
  ativas: number;
  concluidas: number;
  atrasadas: number;
  noPrazo: number;
  carteiraContratada: number;
  custoOrcadoAtivas: number;
  margemPrevistaPonderada: number | null;
  porSituacao: { situacao: SituacaoObra; rotulo: string; quantidade: number; valor: number }[];
  obrasAtivas: {
    id: string; codigo: string; nome: string; clienteNome: string; situacao: SituacaoObra; valor: number;
    prazoDecorrido: number; status: ReturnType<typeof calcularPrazo>["status"]; diasAtraso: number; dataFimContratual: string;
  }[];
  alertas: { tipo: "ATRASO" | "PRAZO_PROXIMO" | "SEM_ORCAMENTO"; obraId: string; texto: string }[];
}

/**
 * Indicadores operacionais calculados a partir do cadastro das obras (Fase 2).
 * Indicadores financeiros (faturamento, caixa, custos realizados) entram nas Fases 3–5,
 * quando houver lançamentos — não são simulados aqui.
 */
export async function indicadoresPainel(
  db: Executor,
  u: { id: string; empresaId: string; acessoTodasObras: boolean },
  filtro: { obraId?: string; inicioDe?: string; inicioAte?: string } = {},
  hoje = hojeIso(),
): Promise<IndicadoresPainel> {
  let obras = await listarObras(db, u, {});
  if (filtro.obraId) obras = obras.filter((o) => o.id === filtro.obraId);
  if (filtro.inicioDe) obras = obras.filter((o) => o.dataInicio >= filtro.inicioDe!);
  if (filtro.inicioAte) obras = obras.filter((o) => o.dataInicio <= filtro.inicioAte!);

  const porSituacao = (Object.keys(SITUACOES_OBRA) as SituacaoObra[]).map((s) => {
    const lista = obras.filter((o) => o.situacao === s);
    return { situacao: s, rotulo: SITUACOES_OBRA[s], quantidade: lista.length, valor: lista.reduce((t, o) => t + Number(o.valorContratoOriginal), 0) };
  });

  const ativas = obras.filter((o) => obraAtiva(o.situacao));
  const comPrazo = ativas.map((o) => ({ o, p: calcularPrazo(o, hoje) }));
  const carteira = ativas.reduce((t, o) => t + Number(o.valorContratoOriginal), 0);
  const custo = ativas.reduce((t, o) => t + Number(o.orcamentoCustoAprovado), 0);
  const baseMargem = ativas.filter((o) => Number(o.valorContratoOriginal) > 0 && Number(o.orcamentoCustoAprovado) > 0);
  const vendaBase = baseMargem.reduce((t, o) => t + Number(o.valorContratoOriginal), 0);
  const custoBase = baseMargem.reduce((t, o) => t + Number(o.orcamentoCustoAprovado), 0);

  const alertas: IndicadoresPainel["alertas"] = [];
  for (const { o, p } of comPrazo) {
    if (p.status === "ATRASADA") alertas.push({ tipo: "ATRASO", obraId: o.id, texto: `${o.codigo} · ${o.nome}: término contratual vencido há ${p.diasAtraso} dia(s)` });
    else if (p.status === "NO_PRAZO" && p.diasTotais - p.diasDecorridos <= 15) alertas.push({ tipo: "PRAZO_PROXIMO", obraId: o.id, texto: `${o.codigo} · ${o.nome}: término contratual em ${p.diasTotais - p.diasDecorridos} dia(s)` });
    if (Number(o.orcamentoCustoAprovado) <= 0) alertas.push({ tipo: "SEM_ORCAMENTO", obraId: o.id, texto: `${o.codigo} · ${o.nome}: obra ativa sem orçamento de custos informado` });
  }

  return {
    total: obras.length,
    ativas: ativas.length,
    concluidas: obras.filter((o) => o.situacao === "CONCLUIDA").length,
    atrasadas: comPrazo.filter((x) => x.p.status === "ATRASADA").length,
    noPrazo: comPrazo.filter((x) => x.p.status === "NO_PRAZO" || x.p.status === "NAO_INICIADA").length,
    carteiraContratada: carteira,
    custoOrcadoAtivas: custo,
    margemPrevistaPonderada: vendaBase > 0 ? (vendaBase - custoBase) / vendaBase : null,
    porSituacao,
    obrasAtivas: comPrazo
      .map(({ o, p }) => ({
        id: o.id, codigo: o.codigo, nome: o.nome, clienteNome: o.clienteNome, situacao: o.situacao,
        valor: Number(o.valorContratoOriginal), prazoDecorrido: p.prazoDecorrido, status: p.status,
        diasAtraso: p.diasAtraso, dataFimContratual: o.dataFimContratual,
      }))
      .sort((a, b) => b.prazoDecorrido - a.prazoDecorrido),
    alertas,
  };
}

export async function listarAuditoria(
  db: Executor, empresaId: string,
  f: { obraId?: string; entidade?: string; usuarioId?: string; de?: string; ate?: string; limite?: number; pagina?: number } = {},
) {
  const c: SQL[] = [eq(auditoria.empresaId, empresaId)];
  if (f.obraId) c.push(eq(auditoria.obraId, f.obraId));
  if (f.entidade) c.push(eq(auditoria.entidade, f.entidade));
  if (f.usuarioId) c.push(eq(auditoria.usuarioId, f.usuarioId));
  if (f.de) c.push(gte(auditoria.criadoEm, new Date(`${f.de}T00:00:00-03:00`)));
  if (f.ate) c.push(lte(auditoria.criadoEm, new Date(`${f.ate}T23:59:59.999-03:00`)));
  const limite = Math.min(f.limite ?? 50, 200);
  return db.select({
    id: auditoria.id, acao: auditoria.acao, entidade: auditoria.entidade, entidadeId: auditoria.entidadeId,
    obraId: auditoria.obraId, descricao: auditoria.descricao, antes: auditoria.antes, depois: auditoria.depois,
    ip: auditoria.ip, criadoEm: auditoria.criadoEm, usuarioNome: usuario.nome,
  }).from(auditoria).leftJoin(usuario, eq(usuario.id, auditoria.usuarioId))
    .where(and(...c)).orderBy(desc(auditoria.id)).limit(limite + 1).offset(((f.pagina ?? 1) - 1) * limite);
}

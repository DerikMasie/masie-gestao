import { and, asc, eq } from "drizzle-orm";
import type { BancoDados, Executor } from "@/db";
import { lembreteObra, obra, usuario } from "@/db/schema";
import { hojeIso, somarDias } from "@/dominio/calendario";
import { datasDaSemana, semanaDaData } from "@/dominio/fisico";
import { acumular, lembretesDaSemana, situacaoAtividade, type SituacaoAtividade } from "@/dominio/painel-obra";
import { registrarAuditoria } from "./auditoria";
import { type Contexto, ErroNegocio } from "./contexto";
import { carregarMedicoes } from "./medicoes";
import { painelObras } from "./painel-obras";

/** Dados do painel da obra (dashboard) na semana escolhida. */
export async function dadosPainelObra(db: Executor, u: { id: string; empresaId: string; acessoTodasObras: boolean }, obraId: string, semanaPedida?: number) {
  const hojeReal = hojeIso();
  const base = await carregarMedicoes(db, u.empresaId, obraId, hojeReal);
  const atual = Math.max(base.fisico.semanaAtual, 1);
  const semana = Math.min(Math.max(semanaPedida && Number.isInteger(semanaPedida) ? semanaPedida : atual, 1), Math.max(base.fisico.nSemanas, atual));
  // Semana passada = estado na sexta daquela semana; semana atual = hoje.
  const hoje = semana >= atual ? hojeReal : somarDias(datasDaSemana(base.obra.dataInicio, semana).inicio, 4);
  const m = semana >= atual ? base : await carregarMedicoes(db, u.empresaId, obraId, hoje);
  const [cartao] = await painelObras(db, u, hoje, obraId);
  if (!cartao) throw new ErroNegocio("Obra não encontrada");
  const f = m.fisico;
  const a = f.avanco;
  const etapa = new Map(f.etapas.map((e) => [e.id, e.nome]));
  const peso = (id: string) => a.servicos.get(id)?.peso ?? 0;
  const ate = (r: Record<number, number>, n: number) => Object.entries(r).filter(([k]) => Number(k) <= n).reduce((t, [, v]) => t + v, 0);

  // Indicadores com séries
  const n = Math.min(semana, a.semanas);
  const serieAvanco = a.acumulado.slice(0, Math.max(n, 1)).map((p) => ({ rotulo: `S${p.semana}`, real: p.realizado, prev: p.previsto }));
  const medidas = m.linhas.filter((l) => l.estado !== "FUTURA");
  const executadoAcum = acumular(medidas.map((l) => l.cobranca));
  const contratoLiquido = m.resumo.contrato - m.resumo.contrato * Number(m.obra.percentualEntrada) + m.resumo.ajustes;
  const pagamentosSemana = Array.from({ length: Math.max(n, 1) }, (_, i) => m.fornecedores.reduce((t, x) => t + (x.pagoSemana[i] ?? 0), 0));
  const maiorMedicao = medidas.reduce<(typeof medidas)[number] | null>((mx, l) => (!mx || l.cobranca > mx.cobranca ? l : mx), null);

  // Atividades executadas na semana e previstas para a semana
  const executadas = f.servicos.filter((s) => (s.realizado[semana] ?? 0) !== 0).map((s) => ({
    id: s.id, descricao: s.descricao, etapa: etapa.get(s.etapaId) ?? "", fornecedor: s.fornecedorNome,
    semana: s.realizado[semana]!, acumulado: ate(s.realizado, semana), contribuicao: peso(s.id) * s.realizado[semana]!,
  })).sort((x, y) => y.contribuicao - x.contribuicao);
  const daSemana = f.servicos.filter((s) => (s.previsto[semana] ?? 0) > 0 || (situacaoAtividade(s, semana) === "ATRASADA" && ate(s.realizado, semana) < 1 - 1e-6 && ate(s.previsto, semana - 1) > 0))
    .map((s) => ({
      id: s.id, descricao: s.descricao, etapa: etapa.get(s.etapaId) ?? "", fornecedor: s.fornecedorNome,
      previstoSemana: s.previsto[semana] ?? 0, realizadoSemana: s.realizado[semana] ?? 0,
      previstoAte: ate(s.previsto, semana), realizadoAte: ate(s.realizado, semana), situacao: situacaoAtividade(s, semana) as SituacaoAtividade,
    }))
    .sort((x, y) => ({ ATRASADA: 0, NAO_INICIADA: 1, EM_ANDAMENTO: 2, CONCLUIDA: 3 })[x.situacao] - ({ ATRASADA: 0, NAO_INICIADA: 1, EM_ANDAMENTO: 2, CONCLUIDA: 3 })[y.situacao]);
  const proxima = f.servicos.filter((s) => (s.previsto[semana + 1] ?? 0) > 0 && ate(s.realizado, semana) < 1 - 1e-6)
    .map((s) => ({ id: s.id, descricao: s.descricao, etapa: etapa.get(s.etapaId) ?? "", previsto: s.previsto[semana + 1]! }));

  // Lembretes
  const todos = await db.select({ l: lembreteObra, autor: usuario.nome }).from(lembreteObra).leftJoin(usuario, eq(usuario.id, lembreteObra.criadoPor))
    .where(eq(lembreteObra.obraId, obraId)).orderBy(asc(lembreteObra.semana), asc(lembreteObra.criadoEm));
  const lembretes = lembretesDaSemana(todos.map((x) => ({ ...x.l, autor: x.autor })), semana)
    .sort((x, y) => Number(!!x.feitoEm) - Number(!!y.feitoEm) || Number(y.importante) - Number(x.importante));

  const dias = datasDaSemana(m.obra.dataInicio, semana);
  return {
    obra: { id: m.obra.id, codigo: m.obra.codigo, nome: m.obra.nome, dataInicio: m.obra.dataInicio, dataFim: m.obra.dataFimContratual },
    cliente: cartao.cliente, semana, semanaAtual: atual, nSemanas: Math.max(f.nSemanas, atual), inicioSemana: dias.inicio, fimSemana: dias.fim, ehAtual: semana === atual,
    ritmo: cartao.ritmo, prazo: cartao.prazo,
    kpis: {
      avanco: { realizado: a.acumulado[n - 1]?.realizado ?? 0, previsto: a.acumulado[n - 1]?.previsto ?? 0, semanaRealizado: a.semanal[n - 1]?.realizado ?? 0, serie: serieAvanco },
      executado: { total: executadoAcum.at(-1) ?? 0, contratoLiquido, maior: maiorMedicao ? { numero: maiorMedicao.numero, valor: maiorMedicao.cobranca } : null, serie: medidas.map((l, i) => ({ rotulo: `M${l.numero}`, valor: l.cobranca, acumulado: executadoAcum[i]! })) },
      saldoMedir: { valor: Math.max(contratoLiquido - (executadoAcum.at(-1) ?? 0), 0), serie: medidas.map((l, i) => ({ rotulo: `M${l.numero}`, valor: Math.max(contratoLiquido - executadoAcum[i]!, 0) })) },
      fornecedores: { aPagar: m.fornecedores.reduce((t, x) => t + x.aPagar, 0), executadoNaoPago: m.fornecedores.filter((x) => x.fornecedorId).reduce((t, x) => t + Math.max(x.executadoNaoPago, 0), 0), pagoSemana: pagamentosSemana[n - 1] ?? 0, serie: pagamentosSemana.map((v, i) => ({ rotulo: `S${i + 1}`, valor: v })) },
    },
    executadas, daSemana, proxima,
    medicoes: m.linhas.filter((l) => l.estado !== "FUTURA" || l.previstoCobranca > 0).slice(0, 12).map((l) => ({ numero: l.numero, data: l.data, previsto: l.previstoCobranca, realizado: l.estado === "FUTURA" ? null : l.cobranca, estado: l.estado, situacao: l.situacao })),
    saldos: {
      contrato: m.resumo.contrato, entrada: m.resumo.entrada, ajustes: m.resumo.ajustes, quitado: m.resumo.quitadas, aCobrar: m.resumo.aCobrar,
      aExecutar: Math.max(contratoLiquido - m.resumo.executado, 0), faturamentoDireto: m.resumo.faturamentoDireto, saldo: m.resumo.saldo,
      fornecedores: m.fornecedores.filter((x) => x.fornecedorId).map((x) => ({ nome: x.nome, acertado: x.acertado, pago: x.pago, aPagar: x.aPagar })).sort((x, y) => y.aPagar - x.aPagar),
    },
    pendencias: cartao.pendencias,
    lembretes: lembretes.map((l) => ({ id: l.id, texto: l.texto, importante: l.importante, feito: !!l.feitoEm, semana: l.semana, autor: l.autor })),
  };
}

export type DadosPainelObra = Awaited<ReturnType<typeof dadosPainelObra>>;

// ───────────── Lembretes ─────────────

async function exigirObra(db: Executor, empresaId: string, obraId: string) {
  const [o] = await db.select({ id: obra.id, dataInicio: obra.dataInicio }).from(obra).where(and(eq(obra.id, obraId), eq(obra.empresaId, empresaId)));
  if (!o) throw new ErroNegocio("Obra não encontrada");
  return o;
}

export async function criarLembrete(banco: BancoDados, ctx: Contexto, obraId: string, d: { texto: string; importante: boolean; semana?: number }) {
  const texto = d.texto.trim();
  if (texto.length < 2) throw new ErroNegocio("Escreva o lembrete", "texto");
  if (texto.length > 300) throw new ErroNegocio("Lembrete muito longo (máx. 300 caracteres)", "texto");
  const o = await exigirObra(banco, ctx.empresaId, obraId);
  const semana = d.semana ?? Math.max(semanaDaData(o.dataInicio, hojeIso()), 1);
  const [l] = await banco.insert(lembreteObra).values({ obraId, semana, texto, importante: d.importante, criadoPor: ctx.usuarioId }).returning();
  await registrarAuditoria(banco, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "lembrete_obra", entidadeId: l!.id, obraId, descricao: `Lembrete da semana ${semana}: ${texto}`, ip: ctx.ip });
  return l!;
}

export async function marcarLembrete(banco: BancoDados, ctx: Contexto, obraId: string, id: string, feito: boolean) {
  await exigirObra(banco, ctx.empresaId, obraId);
  const [l] = await banco.update(lembreteObra).set({ feitoEm: feito ? new Date() : null, feitoPor: feito ? ctx.usuarioId : null })
    .where(and(eq(lembreteObra.id, id), eq(lembreteObra.obraId, obraId))).returning();
  if (!l) throw new ErroNegocio("Lembrete não encontrado");
  await registrarAuditoria(banco, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EDITAR", entidade: "lembrete_obra", entidadeId: id, obraId, descricao: `Lembrete ${feito ? "concluído" : "reaberto"}: ${l.texto}`, ip: ctx.ip });
}

export async function excluirLembrete(banco: BancoDados, ctx: Contexto, obraId: string, id: string) {
  await exigirObra(banco, ctx.empresaId, obraId);
  const [l] = await banco.delete(lembreteObra).where(and(eq(lembreteObra.id, id), eq(lembreteObra.obraId, obraId))).returning();
  if (!l) throw new ErroNegocio("Lembrete não encontrado");
  await registrarAuditoria(banco, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EXCLUIR", entidade: "lembrete_obra", entidadeId: id, obraId, descricao: `Lembrete removido: ${l.texto}`, ip: ctx.ip });
}

import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { BancoDados, Executor } from "@/db";
import {
  centroCusto, cliente, empresa, etapaPadrao, obra, obraEtapa, obraSemana, orcamento, usuario, usuarioObra,
} from "@/db/schema";
import { gerarSemanas, semanasFaltantes } from "@/dominio/calendario";
import { proximoCodigoObra, type SituacaoObra } from "@/dominio/obra";
import { exibirNoRelatorioPadrao } from "@/dominio/eap";
import type { DadosObra } from "@/lib/validacao";
import { auditarEdicao, registrarAuditoria } from "./auditoria";
import { type Contexto, ErroNegocio, violacaoUnica } from "./contexto";

export interface ResumoEstrutura {
  centroCusto: string;
  etapas: number;
  semanas: number;
  orcamento: string;
  vinculados: number;
}

/** Tipo de pessoa provável pelo nome (empresa quando tem LTDA, S.A., ME, EPP, EIRELI…). */
const pareceEmpresa = (nome: string) => /\b(ltda|s\/?a|me|epp|eireli|mei|cia|incorporadora|construtora|condom[ií]nio|associa[cç][aã]o)\b\.?/i.test(nome);

/**
 * Cliente da obra: pelo nome digitado (encontra o existente, sem diferenciar maiúsculas, ou cadastra um novo na mesma
 * transação) ou pelo id já vinculado. Mantém o cliente atual quando o nome digitado é o dele.
 */
async function resolverCliente(db: Executor, ctx: Contexto, d: DadosObra): Promise<string> {
  const nome = d.clienteNome?.replace(/\s+/g, " ").trim();
  if (d.clienteId) {
    const [atual] = await db.select({ id: cliente.id, nome: cliente.nome }).from(cliente)
      .where(and(eq(cliente.id, d.clienteId), eq(cliente.empresaId, ctx.empresaId), isNull(cliente.excluidoEm))).limit(1);
    if (atual && (!nome || atual.nome.trim().toLowerCase() === nome.toLowerCase())) return atual.id;
    if (!nome) throw new ErroNegocio("Cliente não encontrado", "clienteNome");
  }
  const [existente] = await db.select({ id: cliente.id }).from(cliente)
    .where(and(eq(cliente.empresaId, ctx.empresaId), isNull(cliente.excluidoEm), sql`lower(trim(${cliente.nome})) = ${nome!.toLowerCase()}`))
    .orderBy(asc(cliente.criadoEm)).limit(1);
  if (existente) return existente.id;
  const [novo] = await db.insert(cliente).values({ empresaId: ctx.empresaId, nome: nome!, tipoPessoa: pareceEmpresa(nome!) ? "PJ" : "PF", observacoes: "Cadastrado no cadastro da obra. Complete documento e contatos." }).returning();
  await registrarAuditoria(db, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "cliente", entidadeId: novo!.id, descricao: `Cliente "${nome}" cadastrado a partir do cadastro de obra`, depois: novo, ip: ctx.ip });
  return novo!.id;
}

async function validarReferencias(db: Executor, ctx: Contexto, d: DadosObra) {
  const ids = [d.gestorId, d.responsavelTecnicoId].filter((x): x is string => Boolean(x));
  if (ids.length) {
    const us = await db.select({ id: usuario.id }).from(usuario)
      .where(and(inArray(usuario.id, ids), eq(usuario.empresaId, ctx.empresaId), eq(usuario.ativo, true)));
    if (d.gestorId && !us.some((u) => u.id === d.gestorId)) throw new ErroNegocio("Gestor inválido ou inativo", "gestorId");
    if (d.responsavelTecnicoId && !us.some((u) => u.id === d.responsavelTecnicoId)) throw new ErroNegocio("Responsável técnico inválido ou inativo", "responsavelTecnicoId");
  }
}

/** Dados da obra para gravar (sem o nome digitado do cliente, já resolvido em clienteId). */
const paraGravar = (d: DadosObra, clienteId: string) => { const { clienteNome: _n, ...resto } = d; return { ...resto, clienteId }; };

const papeis = (ctx: Contexto, d: Pick<DadosObra, "gestorId" | "responsavelTecnicoId">) =>
  [
    d.gestorId && { usuarioId: d.gestorId, papel: "Gestor" },
    d.responsavelTecnicoId && { usuarioId: d.responsavelTecnicoId, papel: "Responsável técnico" },
    { usuarioId: ctx.usuarioId, papel: "Criador" },
  ].filter((x): x is { usuarioId: string; papel: string } => Boolean(x));

/**
 * Cadastra a obra e gera automaticamente a estrutura operacional (regra fundamental do briefing):
 * centro de custo exclusivo, EAP com as etapas padrão, calendário semanal, orçamento rev. 0 em
 * rascunho e vínculo da equipe. Tudo em uma única transação — ou cria tudo, ou nada.
 */
export async function criarObra(banco: BancoDados, ctx: Contexto, d: DadosObra) {
  try {
    return await banco.transaction(async (tx) => {
      await validarReferencias(tx, ctx, d);
      const clienteId = await resolverCliente(tx, ctx, d);

      // Serializa a geração de códigos da empresa para evitar duplicidade em cadastros simultâneos.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"obra_codigo:" + ctx.empresaId}))`);
      let codigo = d.codigo;
      if (!codigo) {
        const ano = Number(d.dataInicio.slice(0, 4));
        const existentes = await tx.select({ c: obra.codigo }).from(obra)
          .where(and(eq(obra.empresaId, ctx.empresaId), ilike(obra.codigo, `${ano}-%`)));
        codigo = proximoCodigoObra(ano, existentes.map((e) => e.c));
      }

      const [nova] = await tx.insert(obra).values({ ...paraGravar(d, clienteId), codigo, empresaId: ctx.empresaId, criadoPor: ctx.usuarioId }).returning();
      if (!nova) throw new Error("Falha ao inserir obra");

      const codigoCC = `OBR-${codigo}`;
      await tx.insert(centroCusto).values({
        empresaId: ctx.empresaId, codigo: codigoCC, nome: `${codigo} · ${d.nome}`, tipo: "OBRA", obraId: nova.id,
      });

      const etapas = await tx.select().from(etapaPadrao)
        .where(and(eq(etapaPadrao.empresaId, ctx.empresaId), eq(etapaPadrao.ativo, true))).orderBy(asc(etapaPadrao.ordem));
      if (etapas.length) {
        await tx.insert(obraEtapa).values(etapas.map((e, i) => ({ obraId: nova.id, etapaPadraoId: e.id, ordem: i + 1, nome: e.nome, tipo: e.tipo, exibirNoRelatorio: exibirNoRelatorioPadrao(e.nome, e.tipo) })));
      }

      const semanas = gerarSemanas(d.dataInicio, d.dataFimContratual);
      await tx.insert(obraSemana).values(semanas.map((s) => ({ ...s, obraId: nova.id })));

      const [emp] = await tx.select({ p: empresa.parametrosOrcamento }).from(empresa).where(eq(empresa.id, ctx.empresaId));
      await tx.insert(orcamento).values({
        empresaId: ctx.empresaId, obraId: nova.id, numero: 1, revisao: 0, titulo: `Orçamento ${codigo}`,
        status: "RASCUNHO", parametros: emp!.p, criadoPor: ctx.usuarioId,
      });

      const vinculos = papeis(ctx, d);
      await tx.insert(usuarioObra).values(vinculos.map((v) => ({ ...v, obraId: nova.id }))).onConflictDoNothing();

      const resumo: ResumoEstrutura = {
        centroCusto: codigoCC, etapas: etapas.length, semanas: semanas.length,
        orcamento: "Nº 1 · rev. 0 (rascunho)", vinculados: new Set(vinculos.map((v) => v.usuarioId)).size,
      };
      const base = { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "obra", entidadeId: nova.id, obraId: nova.id, ip: ctx.ip };
      await registrarAuditoria(tx, { ...base, acao: "CRIAR", descricao: `Obra ${codigo} cadastrada`, depois: nova });
      await registrarAuditoria(tx, { ...base, acao: "GERAR_ESTRUTURA", descricao: "Estrutura operacional gerada automaticamente", depois: resumo as never });
      return { obra: nova, resumo };
    });
  } catch (e) {
    if (violacaoUnica(e, "obra_codigo_uq")) throw new ErroNegocio("Já existe uma obra com este código", "codigo");
    throw e;
  }
}

export async function atualizarObra(banco: BancoDados, ctx: Contexto, obraId: string, d: DadosObra) {
  try {
    return await banco.transaction(async (tx) => {
      const [antes] = await tx.select().from(obra)
        .where(and(eq(obra.id, obraId), eq(obra.empresaId, ctx.empresaId), isNull(obra.excluidoEm))).for("update");
      if (!antes) throw new ErroNegocio("Obra não encontrada");
      await validarReferencias(tx, ctx, d);
      const clienteId = await resolverCliente(tx, ctx, { ...d, clienteId: d.clienteId ?? antes.clienteId });
      const codigo = d.codigo ?? antes.codigo;

      const [depois] = await tx.update(obra).set({ ...paraGravar(d, clienteId), codigo }).where(eq(obra.id, obraId)).returning();

      if (codigo !== antes.codigo || d.nome !== antes.nome) {
        await tx.update(centroCusto).set({ codigo: `OBR-${codigo}`, nome: `${codigo} · ${d.nome}` }).where(eq(centroCusto.obraId, obraId));
      }

      // Calendário: mudança de início regenera as semanas (ainda não há apontamentos vinculados — Fase 4
      // passará a bloquear/remapear); prorrogação do término acrescenta semanas sem apagar as existentes.
      if (d.dataInicio !== antes.dataInicio) {
        await tx.delete(obraSemana).where(eq(obraSemana.obraId, obraId));
        await tx.insert(obraSemana).values(gerarSemanas(d.dataInicio, d.dataFimContratual).map((s) => ({ ...s, obraId })));
      } else if (d.dataFimContratual > antes.dataFimContratual) {
        const existentes = await tx.select().from(obraSemana).where(eq(obraSemana.obraId, obraId));
        const novas = semanasFaltantes(existentes, d.dataInicio, d.dataFimContratual);
        if (novas.length) await tx.insert(obraSemana).values(novas.map((s) => ({ ...s, obraId })));
      }

      const novosVinculos = papeis(ctx, d).filter((p) => p.papel !== "Criador").map((v) => ({ ...v, obraId }));
      if (novosVinculos.length) await tx.insert(usuarioObra).values(novosVinculos).onConflictDoNothing();

      await auditarEdicao(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, entidade: "obra", entidadeId: obraId, obraId, ip: ctx.ip }, antes, depois!);
      return depois!;
    });
  } catch (e) {
    if (violacaoUnica(e, "obra_codigo_uq") || violacaoUnica(e, "centro_custo_codigo_uq")) throw new ErroNegocio("Já existe uma obra com este código", "codigo");
    throw e;
  }
}

export async function excluirObra(banco: BancoDados, ctx: Contexto, obraId: string) {
  return banco.transaction(async (tx) => {
    const [antes] = await tx.select().from(obra).where(and(eq(obra.id, obraId), eq(obra.empresaId, ctx.empresaId), isNull(obra.excluidoEm)));
    if (!antes) throw new ErroNegocio("Obra não encontrada");
    await tx.update(obra).set({ excluidoEm: new Date() }).where(eq(obra.id, obraId));
    await tx.update(centroCusto).set({ ativo: false }).where(eq(centroCusto.obraId, obraId));
    await registrarAuditoria(tx, {
      empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EXCLUIR", entidade: "obra", entidadeId: obraId, obraId,
      descricao: `Obra ${antes.codigo} excluída (exclusão lógica)`, antes, ip: ctx.ip,
    });
  });
}

export interface FiltroObras {
  q?: string;
  situacao?: SituacaoObra | "ATIVAS";
  ordem?: "codigo" | "nome" | "cliente" | "inicio" | "fim" | "valor" | "situacao";
  direcao?: "asc" | "desc";
}

/** Condição SQL que restringe às obras visíveis para o usuário. */
export function filtroAcessoObras(usuarioId: string, acessoTodasObras: boolean): SQL | undefined {
  if (acessoTodasObras) return undefined;
  return inArray(obra.id, sql`(select ${usuarioObra.obraId} from ${usuarioObra} where ${usuarioObra.usuarioId} = ${usuarioId})`);
}

const gestorAlias = alias(usuario, "gestor");

export async function listarObras(db: Executor, u: { id: string; empresaId: string; acessoTodasObras: boolean }, f: FiltroObras = {}) {
  const condicoes: (SQL | undefined)[] = [eq(obra.empresaId, u.empresaId), isNull(obra.excluidoEm), filtroAcessoObras(u.id, u.acessoTodasObras)];
  if (f.q) {
    const termo = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`;
    condicoes.push(or(ilike(obra.codigo, termo), ilike(obra.nome, termo), ilike(cliente.nome, termo), ilike(obra.cidade, termo)));
  }
  if (f.situacao === "ATIVAS") condicoes.push(inArray(obra.situacao, ["CONTRATADA", "EM_ANDAMENTO", "PARALISADA"]));
  else if (f.situacao) condicoes.push(eq(obra.situacao, f.situacao));

  const colunas = {
    codigo: obra.codigo, nome: obra.nome, cliente: cliente.nome, inicio: obra.dataInicio,
    fim: obra.dataFimContratual, valor: obra.valorContratoOriginal, situacao: obra.situacao,
  } as const;
  const col = colunas[f.ordem ?? "codigo"];
  const ordenacao = f.direcao === "asc" ? asc(col) : desc(col);

  return db
    .select({
      id: obra.id, codigo: obra.codigo, nome: obra.nome, cidade: obra.cidade, uf: obra.uf, situacao: obra.situacao,
      dataInicio: obra.dataInicio, dataFimContratual: obra.dataFimContratual, dataConclusao: obra.dataConclusao,
      valorContratoOriginal: obra.valorContratoOriginal, orcamentoCustoAprovado: obra.orcamentoCustoAprovado,
      margemPrevista: obra.margemPrevista, clienteNome: cliente.nome, gestorNome: gestorAlias.nome,
    })
    .from(obra)
    .innerJoin(cliente, eq(cliente.id, obra.clienteId))
    .leftJoin(gestorAlias, eq(gestorAlias.id, obra.gestorId))
    .where(and(...condicoes))
    .orderBy(ordenacao, asc(obra.codigo));
}

export async function obterObra(db: Executor, empresaId: string, obraId: string) {
  const resp = alias(usuario, "resp");
  const [o] = await db
    .select({ obra, clienteNome: cliente.nome, gestorNome: gestorAlias.nome, responsavelNome: resp.nome })
    .from(obra)
    .innerJoin(cliente, eq(cliente.id, obra.clienteId))
    .leftJoin(gestorAlias, eq(gestorAlias.id, obra.gestorId))
    .leftJoin(resp, eq(resp.id, obra.responsavelTecnicoId))
    .where(and(eq(obra.id, obraId), eq(obra.empresaId, empresaId), isNull(obra.excluidoEm)))
    .limit(1);
  return o ?? null;
}

export async function estruturaObra(db: Executor, obraId: string) {
  const [cc] = await db.select().from(centroCusto).where(eq(centroCusto.obraId, obraId));
  const etapas = await db.select().from(obraEtapa).where(eq(obraEtapa.obraId, obraId)).orderBy(asc(obraEtapa.ordem));
  const semanas = await db.select().from(obraSemana).where(eq(obraSemana.obraId, obraId)).orderBy(asc(obraSemana.numero));
  const orcamentos = await db.select().from(orcamento).where(eq(orcamento.obraId, obraId)).orderBy(asc(orcamento.numero), asc(orcamento.revisao));
  return { centroCusto: cc ?? null, etapas, semanas, orcamentos };
}

export async function equipeObra(db: Executor, obraId: string) {
  return db.select({ usuarioId: usuarioObra.usuarioId, papel: usuarioObra.papel, nome: usuario.nome, email: usuario.email, ativo: usuario.ativo })
    .from(usuarioObra).innerJoin(usuario, eq(usuario.id, usuarioObra.usuarioId))
    .where(eq(usuarioObra.obraId, obraId)).orderBy(asc(usuario.nome));
}

export async function vincularUsuarioObra(banco: BancoDados, ctx: Contexto, obraId: string, usuarioId: string, papel: string) {
  return banco.transaction(async (tx) => {
    const [o] = await tx.select({ id: obra.id }).from(obra).where(and(eq(obra.id, obraId), eq(obra.empresaId, ctx.empresaId)));
    const [u] = await tx.select({ id: usuario.id, nome: usuario.nome }).from(usuario).where(and(eq(usuario.id, usuarioId), eq(usuario.empresaId, ctx.empresaId)));
    if (!o || !u) throw new ErroNegocio("Obra ou usuário não encontrado");
    await tx.insert(usuarioObra).values({ obraId, usuarioId, papel }).onConflictDoUpdate({ target: [usuarioObra.usuarioId, usuarioObra.obraId], set: { papel } });
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "CRIAR", entidade: "usuario_obra", entidadeId: usuarioId, obraId, descricao: `${u.nome} vinculado à obra como ${papel}`, ip: ctx.ip });
  });
}

export async function desvincularUsuarioObra(banco: BancoDados, ctx: Contexto, obraId: string, usuarioId: string) {
  return banco.transaction(async (tx) => {
    const [o] = await tx.select({ id: obra.id }).from(obra).where(and(eq(obra.id, obraId), eq(obra.empresaId, ctx.empresaId)));
    if (!o) throw new ErroNegocio("Obra não encontrada");
    const [u] = await tx.select({ nome: usuario.nome }).from(usuario).where(eq(usuario.id, usuarioId));
    await tx.delete(usuarioObra).where(and(eq(usuarioObra.obraId, obraId), eq(usuarioObra.usuarioId, usuarioId)));
    await registrarAuditoria(tx, { empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "EXCLUIR", entidade: "usuario_obra", entidadeId: usuarioId, obraId, descricao: `${u?.nome ?? "Usuário"} desvinculado da obra`, ip: ctx.ip });
  });
}

export async function contarObrasPorCliente(db: Executor, clienteId: string) {
  const [r] = await db.select({ n: count() }).from(obra).where(and(eq(obra.clienteId, clienteId), isNull(obra.excluidoEm)));
  return r?.n ?? 0;
}

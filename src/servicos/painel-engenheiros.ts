import { and, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Executor } from "@/db";
import { obra, usuario } from "@/db/schema";
import { agruparPorEngenheiro, resumoEmpresa, type ObraPainel } from "@/dominio/painel-engenheiros";
import { filtroAcessoObras } from "./obras";

/** Obras visíveis ao usuário com o engenheiro (responsável técnico, ou gestor) e o valor de contrato. */
export async function obrasDoPainel(db: Executor, u: { id: string; empresaId: string; acessoTodasObras: boolean }): Promise<ObraPainel[]> {
  const rt = alias(usuario, "rt");
  const ge = alias(usuario, "ge");
  const linhas = await db.select({
    id: obra.id, codigo: obra.codigo, nome: obra.nome, situacao: obra.situacao, valor: obra.valorContratoOriginal,
    rtId: obra.responsavelTecnicoId, rtNome: rt.nome, geId: obra.gestorId, geNome: ge.nome,
  }).from(obra).leftJoin(rt, eq(rt.id, obra.responsavelTecnicoId)).leftJoin(ge, eq(ge.id, obra.gestorId))
    .where(and(eq(obra.empresaId, u.empresaId), isNull(obra.excluidoEm), filtroAcessoObras(u.id, u.acessoTodasObras)));
  return linhas.map((l) => ({
    id: l.id, codigo: l.codigo, nome: l.nome, situacao: l.situacao, valor: Number(l.valor),
    engenheiroId: l.rtId ?? l.geId ?? null, engenheiro: l.rtId ? l.rtNome : l.geNome,
  }));
}

export async function painelEngenheiros(db: Executor, u: { id: string; empresaId: string; acessoTodasObras: boolean }) {
  const obras = await obrasDoPainel(db, u);
  return { resumo: resumoEmpresa(obras), grupos: agruparPorEngenheiro(obras) };
}

import { and, asc, eq, isNull } from "drizzle-orm";
import type { Executor } from "@/db";
import { cliente, fornecedor, obraEtapa } from "@/db/schema";
import { NATUREZAS, type Natureza } from "@/dominio/financeiro";
import { listarCentros, listarContas, listarPlano } from "./financeiro";

/** Opções usadas pelos formulários financeiros (selects). */
export async function opcoesFinanceiras(db: Executor, empresaId: string) {
  const [contas, centros, plano, fornecedores, clientes] = await Promise.all([
    listarContas(db, empresaId), listarCentros(db, empresaId, true), listarPlano(db, empresaId, true),
    db.select({ id: fornecedor.id, nome: fornecedor.nome, documento: fornecedor.documento }).from(fornecedor)
      .where(and(eq(fornecedor.empresaId, empresaId), isNull(fornecedor.excluidoEm), eq(fornecedor.ativo, true))).orderBy(asc(fornecedor.nome)),
    db.select({ id: cliente.id, nome: cliente.nome }).from(cliente).where(and(eq(cliente.empresaId, empresaId), isNull(cliente.excluidoEm))).orderBy(asc(cliente.nome)),
  ]);
  const obrasIds = centros.filter((c) => c.obraId).map((c) => c.obraId!);
  const etapas = obrasIds.length ? await db.select({ id: obraEtapa.id, obraId: obraEtapa.obraId, ordem: obraEtapa.ordem, nome: obraEtapa.nome }).from(obraEtapa).orderBy(asc(obraEtapa.ordem)) : [];
  const ordemNat = Object.keys(NATUREZAS) as Natureza[];
  const gruposPlano = (filtro?: (n: Natureza) => boolean) => {
    const m = new Map<string, { rotulo: string; opcoes: { valor: string; rotulo: string }[]; ordem: number }>();
    for (const p of plano.filter((x) => !filtro || filtro(x.natureza))) {
      const k = `${p.natureza}|${p.grupo}`;
      const g = m.get(k) ?? { rotulo: `${p.grupo} (${NATUREZAS[p.natureza].rotulo.toLowerCase()})`, opcoes: [], ordem: ordemNat.indexOf(p.natureza) };
      g.opcoes.push({ valor: p.id, rotulo: p.subitem });
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => a.ordem - b.ordem || a.rotulo.localeCompare(b.rotulo)).map(({ ordem: _o, ...g }) => g);
  };
  return {
    contas: contas.filter((c) => c.ativo).map((c) => ({ valor: c.id, rotulo: c.nome })),
    centros: centros.map((c) => ({ valor: c.id, rotulo: `${c.codigo} · ${c.nome}`, obraId: c.obraId })),
    fornecedores: fornecedores.map((f) => ({ valor: f.id, rotulo: f.nome, documento: f.documento })),
    clientes: clientes.map((c) => ({ valor: c.id, rotulo: c.nome })),
    etapasPorObra: Object.fromEntries(obrasIds.map((o) => [o, etapas.filter((e) => e.obraId === o).map((e) => ({ valor: e.id, rotulo: `${e.ordem}. ${e.nome}` }))])),
    plano, gruposPlano,
  };
}

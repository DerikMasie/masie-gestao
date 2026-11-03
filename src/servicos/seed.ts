import { eq, sql } from "drizzle-orm";
import type { BancoDados } from "@/db";
import { empresa, etapaPadrao, perfil, usuario } from "@/db/schema";
import { ETAPAS_PADRAO } from "@/dominio/obra";
import { PARAMETROS_PADRAO } from "@/dominio/orcamento";
import { PERFIS_PADRAO } from "@/dominio/permissoes";
import { gerarHashSenha } from "@/lib/auth/senha";
import { registrarAuditoria } from "./auditoria";

/**
 * Carga inicial idempotente: empresa, 5 perfis padrão, 19 etapas padrão e o primeiro administrador.
 * Dados da empresa extraídos do "Relatório Situação" da planilha AO (CNPJ e conta para depósito).
 */
export async function semear(banco: BancoDados, admin: { email: string; senha: string; nome?: string }) {
  return banco.transaction(async (tx) => {
    let [emp] = await tx.select().from(empresa).limit(1);
    if (!emp) {
      [emp] = await tx.insert(empresa).values({
        razaoSocial: "Masie Engenharia", nomeFantasia: "Masie Engenharia", cnpj: "27527577000102",
        banco: "Itaú", agencia: "0392", conta: "08371-3", pix: "27.527.577/0001-02",
        corPrimaria: "#1e3a5f", parametrosOrcamento: PARAMETROS_PADRAO,
      }).returning();
    }
    const empresaId = emp!.id;

    const existentes = await tx.select({ nome: perfil.nome, id: perfil.id }).from(perfil).where(eq(perfil.empresaId, empresaId));
    for (const p of PERFIS_PADRAO) {
      if (!existentes.some((e) => e.nome === p.nome)) await tx.insert(perfil).values({ ...p, empresaId, sistema: true });
    }
    const [admPerfil] = await tx.select().from(perfil).where(sql`${perfil.empresaId} = ${empresaId} and ${perfil.nome} = 'Administrador'`);

    const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(etapaPadrao).where(eq(etapaPadrao.empresaId, empresaId))) as [{ n: number }];
    if (n === 0) await tx.insert(etapaPadrao).values(ETAPAS_PADRAO.map((e, i) => ({ ...e, ordem: i + 1, empresaId })));

    let criado = false;
    const [jaExiste] = await tx.select({ id: usuario.id }).from(usuario).where(sql`lower(${usuario.email}) = ${admin.email.toLowerCase()}`);
    if (!jaExiste) {
      const [u] = await tx.insert(usuario).values({
        empresaId, nome: admin.nome ?? "Administrador", email: admin.email.toLowerCase(),
        senhaHash: await gerarHashSenha(admin.senha), perfilId: admPerfil!.id, deveTrocarSenha: true,
      }).returning();
      await registrarAuditoria(tx, { empresaId, usuarioId: null, acao: "CRIAR", entidade: "usuario", entidadeId: u!.id, descricao: "Administrador inicial criado pela carga inicial" });
      criado = true;
    }
    return { empresaId, adminCriado: criado };
  });
}

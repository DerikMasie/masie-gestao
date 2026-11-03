import { eq, sql } from "drizzle-orm";
import type { BancoDados } from "@/db";
import { centroCusto, contaFinanceira, empresa, etapaPadrao, obraEtapa, perfil, quadro, quadroColuna, etiqueta, usuario } from "@/db/schema";
import { EAP_UNICA } from "@/dominio/eap";
import { garantirPlanoPadrao } from "./financeiro";
import { COLUNAS_PADRAO, ETIQUETAS_PADRAO } from "@/dominio/quadro";
import type { Modulo } from "@/dominio/permissoes";
import { ETAPAS_PADRAO } from "@/dominio/obra";
import { PARAMETROS_PADRAO } from "@/dominio/orcamento";
import { orcamento } from "@/db/schema";
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
        corPrimaria: "#111111", parametrosOrcamento: PARAMETROS_PADRAO,
      }).returning();
    }
    const empresaId = emp!.id;

    // Atualização de identidade visual (Fase 2.1): azul provisório → preto Masie.
    if (emp!.corPrimaria === "#1e3a5f") await tx.update(empresa).set({ corPrimaria: "#111111" }).where(eq(empresa.id, empresaId));
    // Parâmetros de orçamento (Fase 3): formato antigo (lucro/fórmula) → padrões definidos pela Masie (BDI MO 30%, material 10%, imposto 10,5%).
    if (!("bdiMaoDeObra" in (emp!.parametrosOrcamento as object))) {
      await tx.update(empresa).set({ parametrosOrcamento: PARAMETROS_PADRAO }).where(eq(empresa.id, empresaId));
      await tx.update(orcamento).set({ parametros: PARAMETROS_PADRAO }).where(sql`${orcamento.empresaId} = ${empresaId} and not (${orcamento.parametros} ? 'bdiMaoDeObra')`);
    }

    const existentes = await tx.select().from(perfil).where(eq(perfil.empresaId, empresaId));
    for (const p of PERFIS_PADRAO) {
      const atual = existentes.find((e) => e.nome === p.nome);
      if (!atual) {
        await tx.insert(perfil).values({ ...p, empresaId, sistema: true });
        continue;
      }
      // Módulos novos entram nos perfis padrão sem sobrescrever o que o administrador já ajustou.
      if (atual.sistema) {
        const faltantes = (Object.keys(p.permissoes) as Modulo[]).filter((m) => !(m in atual.permissoes));
        if (faltantes.length) {
          const novas = { ...atual.permissoes, ...Object.fromEntries(faltantes.map((m) => [m, p.permissoes[m]])) };
          await tx.update(perfil).set({ permissoes: novas }).where(eq(perfil.id, atual.id));
        }
      }
    }

    const [algumQuadro] = await tx.select({ id: quadro.id }).from(quadro).where(eq(quadro.empresaId, empresaId)).limit(1);
    if (!algumQuadro) {
      const [q] = await tx.insert(quadro).values({ empresaId, nome: "Escritório", descricao: "Atividades internas do escritório" }).returning();
      await tx.insert(quadroColuna).values(COLUNAS_PADRAO.map((c, i) => ({ ...c, quadroId: q!.id, ordem: i + 1 })));
      await tx.insert(etiqueta).values(ETIQUETAS_PADRAO.map((e) => ({ ...e, quadroId: q!.id })));
    }
    const [admPerfil] = await tx.select().from(perfil).where(sql`${perfil.empresaId} = ${empresaId} and ${perfil.nome} = 'Administrador'`);

    const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(etapaPadrao).where(eq(etapaPadrao.empresaId, empresaId))) as [{ n: number }];
    if (n === 0) await tx.insert(etapaPadrao).values(ETAPAS_PADRAO.map((e, i) => ({ ...e, ordem: i + 1, empresaId })));

    // EAP única (D11): renomeia etapas com nomes antigos (padrão da empresa e obras existentes).
    for (const e of EAP_UNICA) {
      for (const antigo of e.antigos) {
        await tx.update(etapaPadrao).set({ nome: e.nome }).where(sql`${etapaPadrao.empresaId} = ${empresaId} and ${etapaPadrao.nome} = ${antigo}`);
        await tx.update(obraEtapa).set({ nome: e.nome }).where(sql`${obraEtapa.nome} = ${antigo} and ${obraEtapa.obraId} in (select id from obra where empresa_id = ${empresaId})`);
      }
    }

    // Financeiro (Fase 3): plano de contas padrão, conta "Caixa" e centro de custo administrativo.
    await garantirPlanoPadrao(tx, empresaId);
    const [algumaConta] = await tx.select({ id: contaFinanceira.id }).from(contaFinanceira).where(eq(contaFinanceira.empresaId, empresaId)).limit(1);
    if (!algumaConta) await tx.insert(contaFinanceira).values({ empresaId, nome: "Caixa", tipo: "CAIXA" });
    await tx.insert(centroCusto).values({ empresaId, codigo: "ADM", nome: "Administração do escritório", tipo: "ADMINISTRATIVO" }).onConflictDoNothing();

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

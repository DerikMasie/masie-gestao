import { sql } from "drizzle-orm";
import { criarBanco } from "@/db";
import { cliente, perfil, usuario } from "@/db/schema";
import { gerarHashSenha } from "@/lib/auth/senha";
import { semear } from "@/servicos/seed";
import type { Contexto } from "@/servicos/contexto";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL não configurada");
if (!/test/.test(url)) throw new Error("TEST_DATABASE_URL deve apontar para um banco de testes");
export const db = criarBanco(url);

export async function limparBanco() {
  await db.execute(sql`truncate table auditoria, arquivo_conteudo, anexo, obra_servico_semana, obra_servico, lancamento, titulo_parcela, titulo, nota_fiscal, importacao, plano_conta, conta_financeira, orcamento_item, cartao_comentario, cartao_checklist, cartao_etiqueta, cartao, etiqueta, quadro_coluna, quadro, orcamento, usuario_obra, obra_semana, obra_etapa, centro_custo, obra,
    fornecedor, cliente, etapa_padrao, sessao, tentativa_login, usuario, perfil, empresa restart identity cascade`);
}

export async function prepararEmpresa() {
  await limparBanco();
  const { empresaId } = await semear(db, { email: "admin@teste.com", senha: "Senha123" });
  const [admin] = await db.select().from(usuario).where(sql`email = 'admin@teste.com'`);
  const ctx: Contexto = { empresaId, usuarioId: admin!.id, ip: "127.0.0.1" };
  const [cli] = await db.insert(cliente).values({ empresaId, nome: "Cliente Palco", tipoPessoa: "PJ" }).returning();
  return { empresaId, admin: admin!, ctx, clienteId: cli!.id };
}

export async function criarUsuarioComPerfil(empresaId: string, email: string, nomePerfil: string) {
  const [p] = await db.select().from(perfil).where(sql`${perfil.empresaId} = ${empresaId} and ${perfil.nome} = ${nomePerfil}`);
  const [u] = await db.insert(usuario).values({ empresaId, nome: email, email, senhaHash: await gerarHashSenha("Senha123"), perfilId: p!.id, deveTrocarSenha: false }).returning();
  return { usuario: u!, perfil: p! };
}

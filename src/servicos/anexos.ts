import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { BancoDados, Executor } from "@/db";
import { db } from "@/db";
import { anexo, arquivoConteudo, usuario } from "@/db/schema";
import { sha256, tokenAleatorio } from "@/lib/cripto";
import { registrarAuditoria } from "./auditoria";
import { type Contexto, ErroNegocio } from "./contexto";

export const TAMANHO_MAXIMO = 20 * 1024 * 1024;

/** Tipos aceitos, conferidos também pela assinatura do arquivo (não só pela extensão informada). */
const TIPOS: Record<string, { ext: string[]; assinatura?: number[][] }> = {
  "application/pdf": { ext: [".pdf"], assinatura: [[0x25, 0x50, 0x44, 0x46]] },
  "image/jpeg": { ext: [".jpg", ".jpeg"], assinatura: [[0xff, 0xd8, 0xff]] },
  "image/png": { ext: [".png"], assinatura: [[0x89, 0x50, 0x4e, 0x47]] },
  "image/webp": { ext: [".webp"], assinatura: [[0x52, 0x49, 0x46, 0x46]] },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: [".xlsx"], assinatura: [[0x50, 0x4b]] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: [".docx"], assinatura: [[0x50, 0x4b]] },
  "application/xml": { ext: [".xml"] },
  "text/xml": { ext: [".xml"] },
  "application/acad": { ext: [".dwg"] },
};

export function validarArquivo(nome: string, tipo: string, dados: Buffer): string {
  if (dados.length === 0) throw new ErroNegocio("Arquivo vazio");
  if (dados.length > TAMANHO_MAXIMO) throw new ErroNegocio("Arquivo maior que 20 MB");
  const ext = path.extname(nome).toLowerCase();
  const entrada = Object.entries(TIPOS).find(([mime, t]) => t.ext.includes(ext) && (mime === tipo || !TIPOS[tipo]));
  if (!entrada) throw new ErroNegocio("Tipo de arquivo não permitido (aceitos: PDF, imagens, XLSX, DOCX, XML, DWG)");
  const [mime, t] = entrada;
  if (t.assinatura && !t.assinatura.some((sig) => sig.every((b, i) => dados[i] === b))) {
    throw new ErroNegocio("O conteúdo do arquivo não corresponde à extensão informada");
  }
  return mime;
}

function pastaBase() {
  return path.resolve(/* turbopackIgnore: true */ process.env.ARMAZENAMENTO_DIR ?? "./storage");
}

/**
 * Armazenamento do conteúdo: "banco" (tabela arquivo_conteudo — padrão na Vercel, que não tem disco persistente)
 * ou "local" (pasta ARMAZENAMENTO_DIR). Escolha por ARMAZENAMENTO=banco|local. Anexos antigos continuam legíveis
 * pelo driver em que foram gravados (o prefixo "db:" da chave indica o banco).
 */
const usarBanco = () => (process.env.ARMAZENAMENTO ?? (process.env.VERCEL ? "banco" : "local")) === "banco";

async function gravar(banco: Executor, chave: string, dados: Buffer): Promise<string> {
  if (usarBanco()) {
    const k = `db:${chave}`;
    await banco.insert(arquivoConteudo).values({ chave: k, dados });
    return k;
  }
  const destino = path.join(/* turbopackIgnore: true */ pastaBase(), chave);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, dados, { flag: "wx" });
  return chave;
}

export async function lerConteudo(chave: string, banco: Executor = db): Promise<Buffer> {
  if (chave.startsWith("db:")) {
    const [r] = await banco.select({ dados: arquivoConteudo.dados }).from(arquivoConteudo).where(eq(arquivoConteudo.chave, chave));
    if (!r) throw new Error("Conteúdo do anexo não encontrado");
    return Buffer.from(r.dados);
  }
  const base = pastaBase();
  const destino = path.resolve(/* turbopackIgnore: true */ base, chave);
  if (!destino.startsWith(base + path.sep)) throw new Error("Caminho inválido");
  return readFile(destino);
}

export async function anexarArquivo(
  banco: BancoDados, ctx: Contexto,
  alvo: { entidade: string; entidadeId: string; obraId?: string | null },
  arquivo: { nome: string; tipo: string; dados: Buffer; descricao?: string | null },
) {
  const mime = validarArquivo(arquivo.nome, arquivo.tipo, arquivo.dados);
  const nomeSeguro = path.basename(arquivo.nome).replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 150);
  const chave = `${ctx.empresaId}/${alvo.entidade}/${alvo.entidadeId}/${tokenAleatorio(12)}${path.extname(nomeSeguro).toLowerCase()}`;
  const caminho = await gravar(banco, chave, arquivo.dados);
  return banco.transaction(async (tx) => {
    const [a] = await tx.insert(anexo).values({
      empresaId: ctx.empresaId, entidade: alvo.entidade, entidadeId: alvo.entidadeId, obraId: alvo.obraId ?? null,
      nomeArquivo: nomeSeguro, tipoMime: mime, tamanho: arquivo.dados.length, sha256: sha256(arquivo.dados),
      caminho, descricao: arquivo.descricao ?? null, criadoPor: ctx.usuarioId,
    }).returning();
    await registrarAuditoria(tx, {
      empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "ANEXAR", entidade: alvo.entidade, entidadeId: alvo.entidadeId,
      obraId: alvo.obraId, descricao: `Arquivo "${nomeSeguro}" anexado`, ip: ctx.ip,
    });
    return a!;
  });
}

export async function listarAnexos(db: Executor, empresaId: string, entidade: string, entidadeId: string) {
  return db.select({
    id: anexo.id, nomeArquivo: anexo.nomeArquivo, tipoMime: anexo.tipoMime, tamanho: anexo.tamanho,
    descricao: anexo.descricao, criadoEm: anexo.criadoEm, autor: usuario.nome,
  }).from(anexo).leftJoin(usuario, eq(usuario.id, anexo.criadoPor))
    .where(and(eq(anexo.empresaId, empresaId), eq(anexo.entidade, entidade), eq(anexo.entidadeId, entidadeId), isNull(anexo.excluidoEm)))
    .orderBy(desc(anexo.criadoEm));
}

export async function obterAnexo(db: Executor, empresaId: string, id: string) {
  const [a] = await db.select().from(anexo).where(and(eq(anexo.id, id), eq(anexo.empresaId, empresaId), isNull(anexo.excluidoEm)));
  return a ?? null;
}

export async function removerAnexo(banco: BancoDados, ctx: Contexto, id: string) {
  return banco.transaction(async (tx) => {
    const a = await obterAnexo(tx, ctx.empresaId, id);
    if (!a) throw new ErroNegocio("Anexo não encontrado");
    await tx.update(anexo).set({ excluidoEm: new Date() }).where(eq(anexo.id, id));
    await registrarAuditoria(tx, {
      empresaId: ctx.empresaId, usuarioId: ctx.usuarioId, acao: "REMOVER_ANEXO", entidade: a.entidade, entidadeId: a.entidadeId,
      obraId: a.obraId, descricao: `Arquivo "${a.nomeArquivo}" removido`, ip: ctx.ip,
    });
    return a;
  });
}

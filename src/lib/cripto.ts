/** Cifragem AES-256-GCM para dados sensíveis (dados bancários e PIX de fornecedores — LGPD). */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSAO = "v1";

function chave(): Buffer {
  const b64 = process.env.DADOS_SENSIVEIS_CHAVE;
  if (!b64) throw new Error("DADOS_SENSIVEIS_CHAVE não configurada");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new Error("DADOS_SENSIVEIS_CHAVE deve ter 32 bytes em base64");
  return k;
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [VERSAO, iv.toString("base64"), c.getAuthTag().toString("base64"), dados.toString("base64")].join(":");
}

export function decifrar(pacote: string): string {
  const [versao, iv, tag, dados] = pacote.split(":");
  if (versao !== VERSAO || !iv || !tag || !dados) throw new Error("Formato de dado cifrado inválido");
  const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(dados, "base64")), d.final()]).toString("utf8");
}

export function cifrarJson(obj: Record<string, unknown>): string | null {
  const limpo = Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null && v !== ""));
  return Object.keys(limpo).length ? cifrar(JSON.stringify(limpo)) : null;
}

export function decifrarJson<T>(pacote: string | null | undefined): T | null {
  return pacote ? (JSON.parse(decifrar(pacote)) as T) : null;
}

export const sha256 = (dados: string | Buffer) => createHash("sha256").update(dados).digest("hex");

export const tokenAleatorio = (bytes = 32) => randomBytes(bytes).toString("base64url");

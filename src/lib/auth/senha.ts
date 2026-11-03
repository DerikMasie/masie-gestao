import { hash, verify } from "@node-rs/argon2";

// Parâmetros recomendados pela OWASP para Argon2id.
const OPCOES = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const gerarHashSenha = (senha: string) => hash(senha, OPCOES);

export async function verificarSenha(hashArmazenado: string, senha: string): Promise<boolean> {
  try {
    return await verify(hashArmazenado, senha);
  } catch {
    return false;
  }
}

/** Política mínima: 8+ caracteres, com letras e números. */
export function problemaSenha(senha: string): string | null {
  if (senha.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
  if (senha.length > 128) return "A senha deve ter no máximo 128 caracteres.";
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return "A senha deve conter letras e números.";
  return null;
}

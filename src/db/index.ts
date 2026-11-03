import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function criar(url: string) {
  const cliente = postgres(url, { max: 10, prepare: true });
  return drizzle(cliente, { schema, casing: "snake_case" });
}

export type BancoDados = ReturnType<typeof criar>;
/** Transação ou conexão — os serviços aceitam ambos. */
export type Executor = BancoDados | Parameters<Parameters<BancoDados["transaction"]>[0]>[0];

const globalBanco = globalThis as unknown as { __masieDb?: BancoDados };

export function obterBanco(): BancoDados {
  if (!globalBanco.__masieDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada");
    globalBanco.__masieDb = criar(url);
  }
  return globalBanco.__masieDb;
}

/** Proxy preguiçoso: só conecta no primeiro uso (evita conexão durante o build). */
export const db = new Proxy({} as BancoDados, {
  get: (_alvo, prop) => Reflect.get(obterBanco(), prop),
});

export { criar as criarBanco };

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function criar(url: string) {
  // Pool do Neon/PgBouncer ("-pooler") não aceita prepared statements; em servidor sem estado (Vercel) poucas conexões por instância.
  const pool = /-pooler\.|pgbouncer=true/.test(url);
  const cliente = postgres(url, { max: process.env.VERCEL ? 3 : 10, prepare: !pool, ...(process.env.VERCEL ? { idle_timeout: 20 } : {}) });
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

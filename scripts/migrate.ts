import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não configurada");
const cliente = postgres(url, { max: 1, onnotice: () => {} });
await migrate(drizzle(cliente), { migrationsFolder: "./drizzle" });
await cliente.end();
console.log("Migrações aplicadas.");

import "dotenv/config";
import { criarBanco } from "@/db";
import { semear } from "@/servicos/seed";

const email = process.env.SEED_ADMIN_EMAIL ?? "admin@masie.com.br";
const senha = process.env.SEED_ADMIN_SENHA;
if (!senha) throw new Error("Defina SEED_ADMIN_SENHA no .env");
const db = criarBanco(process.env.DATABASE_URL!);
const r = await semear(db, { email, senha });
console.log(r.adminCriado ? `Administrador criado: ${email} (troca de senha obrigatória no 1º acesso)` : "Carga inicial já aplicada.");
process.exit(0);

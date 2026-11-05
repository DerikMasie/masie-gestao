import "dotenv/config";
import { criarBanco } from "@/db";
import { semear } from "@/servicos/seed";

const email = process.env.SEED_ADMIN_EMAIL ?? "admin@masie.com.br";
const senha = process.env.SEED_ADMIN_SENHA;
if (!senha) {
  // Na publicação automática sem senha definida, não interrompe o build: a carga inicial fica para depois.
  console.log("SEED_ADMIN_SENHA não definida — carga inicial ignorada.");
  process.exit(0);
}
const db = criarBanco(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);
const r = await semear(db, { email, senha });
console.log(r.adminCriado ? `Administrador criado: ${email} (troca de senha obrigatória no 1º acesso)` : "Carga inicial já aplicada.");
process.exit(0);

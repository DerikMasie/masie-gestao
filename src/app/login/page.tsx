import { redirect } from "next/navigation";
import { obterUsuarioAtual } from "@/lib/auth/atual";
import { BotaoEnviar, Campo, Formulario } from "@/componentes/formulario";
import { entrar } from "./acoes";

export const metadata = { title: "Entrar" };

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<{ destino?: string }> }) {
  if (await obterUsuarioAtual()) redirect("/");
  const { destino } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#1e3a5f] to-[#0f1f33] p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-marca text-lg font-bold text-white">M</div>
          <h1 className="text-xl font-semibold">Masie Gestão</h1>
          <p className="text-sm text-suave">Masie Engenharia</p>
        </div>
        <Formulario acao={entrar}>
          <input type="hidden" name="destino" value={destino ?? "/"} />
          <Campo nome="email" rotulo="E-mail" type="email" autoComplete="username" required autoFocus />
          <Campo nome="senha" rotulo="Senha" type="password" autoComplete="current-password" required />
          <BotaoEnviar className="w-full">Entrar</BotaoEnviar>
        </Formulario>
        <p className="mt-6 text-center text-xs text-suave">Esqueceu a senha? Peça ao administrador para redefini-la.</p>
      </div>
    </main>
  );
}

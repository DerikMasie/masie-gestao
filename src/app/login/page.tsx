import { redirect } from "next/navigation";
import { obterUsuarioAtual } from "@/lib/auth/atual";
import { BotaoEnviar, Campo, Formulario } from "@/componentes/formulario";
import { entrar } from "./acoes";
import { LogoMasie } from "@/componentes/logo";

export const metadata = { title: "Entrar" };

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<{ destino?: string }> }) {
  if (await obterUsuarioAtual()) redirect("/");
  const { destino } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-lateral p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="h-1.5 bg-destaque" />
        <div className="p-8">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <LogoMasie />
          <h1 className="text-sm font-medium tracking-wide text-suave">Sistema de gestão de obras</h1>
        </div>
        <Formulario acao={entrar}>
          <input type="hidden" name="destino" value={destino ?? "/"} />
          <Campo nome="email" rotulo="E-mail" type="email" autoComplete="username" required autoFocus />
          <Campo nome="senha" rotulo="Senha" type="password" autoComplete="current-password" required />
          <BotaoEnviar className="w-full">Entrar</BotaoEnviar>
        </Formulario>
        <p className="mt-6 text-center text-xs text-suave">Esqueceu a senha? Peça ao administrador para redefini-la.</p>
        </div>
      </div>
    </main>
  );
}

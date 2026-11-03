import Link from "next/link";

export default function SemPermissao() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Acesso não autorizado</h1>
        <p className="mt-2 text-sm text-suave">Seu perfil não tem permissão para acessar esta página. Se precisar do acesso, fale com o administrador.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-marca">Voltar ao início</Link>
      </div>
    </main>
  );
}

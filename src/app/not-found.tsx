import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Página não encontrada</h1>
        <p className="mt-2 text-sm text-suave">O registro pode ter sido excluído ou você não tem acesso a ele.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-texto">Voltar ao início</Link>
      </div>
    </main>
  );
}

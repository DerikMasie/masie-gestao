import { db } from "@/db";
import { pode } from "@/dominio/permissoes";
import { obterUsuarioAtual, podeAcessarObra } from "@/lib/auth/atual";
import { lerConteudo, obterAnexo } from "@/servicos/anexos";

const EXIBIR_NO_NAVEGADOR = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

/** Download autenticado de anexos: confere sessão, permissão do módulo e acesso à obra. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await obterUsuarioAtual();
  if (!u) return new Response("Não autenticado", { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Não encontrado", { status: 404 });
  const a = await obterAnexo(db, u.empresaId, id);
  if (!a) return new Response("Não encontrado", { status: 404 });
  const modulo = a.entidade === "obra" ? "obras" : a.entidade === "fornecedor" ? "fornecedores" : a.entidade === "cliente" ? "clientes" : a.entidade === "cartao" ? "quadro" : a.entidade === "relatorio_semanal" ? "relatorios" : null;
  if (!modulo || !pode(u.perfil.permissoes, modulo)) return new Response("Sem permissão", { status: 403 });
  if (a.obraId && !(await podeAcessarObra(u, a.obraId))) return new Response("Sem permissão", { status: 403 });

  const dados = await lerConteudo(a.caminho);
  const disposicao = EXIBIR_NO_NAVEGADOR.has(a.tipoMime) ? "inline" : "attachment";
  return new Response(new Uint8Array(dados), {
    headers: {
      "Content-Type": a.tipoMime,
      "Content-Length": String(dados.length),
      "Content-Disposition": `${disposicao}; filename*=UTF-8''${encodeURIComponent(a.nomeArquivo)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}

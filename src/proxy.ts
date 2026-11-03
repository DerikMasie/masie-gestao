import { NextResponse, type NextRequest } from "next/server";

const PUBLICAS = ["/login", "/sem-permissao"];

/**
 * Filtro rápido: sem cookie de sessão → login. A validação real da sessão (banco) acontece
 * no layout e em cada server action; aqui só evitamos renderizar páginas para anônimos.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const publica = PUBLICAS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!publica && !req.cookies.has("masie_sessao")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?destino=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  const h = new Headers(req.headers);
  h.set("x-caminho", pathname);
  return NextResponse.next({ request: { headers: h } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

// Checagem "otimista": so olha se o cookie de sessao existe, sem consultar o
// banco. A validacao completa (expiracao, existencia real da sessao) acontece
// no server component de /dashboard antes de renderizar qualquer dado - essa
// e a linha de defesa real.
export function proxy(request: NextRequest) {
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);

  if (!hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/onboarding/:path*",
    "/dashboard/:path*",
    "/empresa/:path*",
    "/financeiro/:path*",
    "/clientes/:path*",
    "/vendas/:path*",
    "/insights/:path*",
    "/caixa/:path*",
    "/assistente/:path*",
    "/configuracoes/:path*",
  ],
};

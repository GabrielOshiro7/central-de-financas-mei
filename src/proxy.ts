import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import {
  CSP_REPORT_ONLY_HEADER,
  NONCE_REQUEST_HEADER,
  buildCspReportOnly,
  generateNonce,
  staticSecurityHeaders,
} from "@/lib/security/headers";

// O proxy faz duas coisas, em TODA requisicao (menos arquivos estaticos do Next e o favicon):
//
// 1) Cabecalhos de seguranca. A CSP e em modo de observacao e baseada em nonce: um nonce novo
//    por requisicao vai (a) no cabecalho de REQUISICAO, de onde o Next.js o le e o aplica aos
//    seus scripts e aos <Script>, e (b) no cabecalho de RESPOSTA. Os cabecalhos fixos tambem sao
//    definidos em next.config.ts; aqui eles cobrem as respostas que o proprio proxy devolve
//    (redirects), onde a configuracao de headers() pode nao chegar.
//
// 2) Checagem "otimista" de login: so olha se o cookie de sessao existe, sem consultar o banco,
//    nas rotas protegidas (PROTECTED_PREFIXES). A validacao completa (expiracao, existencia
//    real da sessao) acontece no server component do layout (app) antes de renderizar qualquer
//    dado - essa e a linha de defesa real.
const PROTECTED_PREFIXES = [
  "/onboarding",
  "/dashboard",
  "/empresa",
  "/financeiro",
  "/clientes",
  "/agenda",
  "/vendas",
  "/insights",
  "/caixa",
  "/assistente",
  "/configuracoes",
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function applyStaticHeaders(response: NextResponse) {
  for (const { key, value } of staticSecurityHeaders({ isProduction: process.env.NODE_ENV === "production" })) {
    response.headers.set(key, value);
  }
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isProtectedPath(pathname) && !request.cookies.has(SESSION_COOKIE_NAME)) {
    return applyStaticHeaders(NextResponse.redirect(new URL("/login", request.url)));
  }

  // A API devolve JSON: nao tem HTML nem scripts, entao nao precisa de CSP (os cabecalhos fixos
  // vem de next.config.ts, e tambem daqui).
  if (pathname.startsWith("/api/")) {
    return applyStaticHeaders(NextResponse.next());
  }

  const nonce = generateNonce();
  const csp = buildCspReportOnly({ nonce, isDevelopment: process.env.NODE_ENV === "development", host: request.headers.get("host") });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_REQUEST_HEADER, nonce);
  // O Next.js procura o nonce no cabecalho de requisicao (content-security-policy ou
  // content-security-policy-report-only).
  requestHeaders.set(CSP_REPORT_ONLY_HEADER, csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CSP_REPORT_ONLY_HEADER, csp);
  return applyStaticHeaders(response);
}

export const config = {
  // Tudo, exceto os arquivos estaticos do Next e o favicon (nao precisam de nonce; os cabecalhos
  // fixos deles vem de next.config.ts).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

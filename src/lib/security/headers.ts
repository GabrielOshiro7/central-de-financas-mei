// Cabecalhos HTTP de seguranca. Fonte unica: next.config.ts (headers() - todas as respostas,
// incluindo API e arquivos estaticos) e src/proxy.ts (paginas: CSP com nonce por requisicao,
// e tambem os cabecalhos fixos nas respostas que o proprio proxy devolve, como o redirect).
//
// Sem dependencia de Next/Node: roda no proxy e e testavel como funcao pura.

export type HeaderEntry = { key: string; value: string };

// Camera liberada so para o proprio site (futuro escaneamento de recibos); o resto bloqueado.
export const PERMISSIONS_POLICY = "camera=(self), microphone=(), geolocation=(), payment=()";

// Cabecalhos fixos, iguais em toda resposta.
//  - X-Frame-Options: DENY (e `frame-ancestors 'none'` na CSP): ninguem embute o site em iframe.
//  - Strict-Transport-Security SO em producao: em desenvolvimento/teste quebraria o acesso por
//    http://localhost (o navegador passaria a exigir HTTPS nesse host por um ano). Sem
//    "preload": difícil de desfazer, fica como decisao futura.
export function staticSecurityHeaders({ isProduction }: { isProduction: boolean }): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  ];
  if (isProduction) headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
  return headers;
}

// Nonce novo por requisicao (base64 de um UUID aleatorio, como no guia do Next.js). Usa so
// APIs da plataforma web (crypto.randomUUID, btoa), disponiveis no proxy.
export function generateNonce(): string {
  return btoa(crypto.randomUUID());
}

// CSP em MODO DE OBSERVACAO (Content-Security-Policy-Report-Only): o navegador so registra
// violacoes no console, nada e bloqueado. Baseada em nonce - o Next.js le o nonce do cabecalho
// de REQUISICAO (o proxy repassa) e o coloca nos scripts do framework e nos <Script>.
//
//  - script-src: 'strict-dynamic' faz o navegador confiar em scripts carregados por um script
//    com nonce (os chunks do Next); 'self' fica de fallback para navegadores sem CSP3.
//  - style-src 'unsafe-inline': decisao consciente - o app usa atributos style="" e <style>
//    do Next/fontes; estilo inline tem risco bem menor que script inline.
//  - Fontes: next/font/google baixa e serve as fontes do proprio site ('self').
//
// Em DESENVOLVIMENTO so entra o necessario para o hot reload:
//  - 'unsafe-eval' em script-src: o React usa eval em dev para reconstruir pilhas de erro do
//    servidor no navegador (nao e necessario em producao - guia do Next.js).
//  - ws://<host> em connect-src: o websocket do HMR, no proprio host do servidor de dev
//    (inclui o acesso pelo IP da rede local).
export function buildCspReportOnly({ nonce, isDevelopment, host }: { nonce: string; isDevelopment: boolean; host?: string | null }): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  const connectSrc = ["'self'"];
  if (isDevelopment) {
    scriptSrc.push("'unsafe-eval'");
    if (host) connectSrc.push(`ws://${host}`);
  }
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connectSrc.join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export const CSP_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";
export const NONCE_REQUEST_HEADER = "x-nonce";

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  CSP_REPORT_ONLY_HEADER,
  NONCE_REQUEST_HEADER,
  PERMISSIONS_POLICY,
  buildCspReportOnly,
  generateNonce,
  staticSecurityHeaders,
} from "@/lib/security/headers";

const asMap = (headers: { key: string; value: string }[]) => Object.fromEntries(headers.map((h) => [h.key, h.value]));

describe("cabeçalhos fixos", () => {
  it("fora de produção: nosniff, referrer, frame DENY, permissions; SEM HSTS", () => {
    expect(asMap(staticSecurityHeaders({ isProduction: false }))).toEqual({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=()",
    });
  });

  it("em produção: acrescenta HSTS de 1 ano com includeSubDomains e SEM preload", () => {
    const hsts = asMap(staticSecurityHeaders({ isProduction: true }))["Strict-Transport-Security"];
    expect(hsts).toBe("max-age=31536000; includeSubDomains");
    expect(hsts).not.toMatch(/preload/i);
  });

  it("a câmera é liberada só para o próprio site; microfone, geolocalização e pagamento bloqueados", () => {
    expect(PERMISSIONS_POLICY).toBe("camera=(self), microphone=(), geolocation=(), payment=()");
  });
});

describe("CSP em modo de observação", () => {
  const nonce = "dGVzdGUtbm9uY2U=";
  const parse = (csp: string) => Object.fromEntries(csp.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1).join(" ")]));

  it("produção: política exata, nonce no script-src, sem unsafe-eval e sem ws:", () => {
    const csp = parse(buildCspReportOnly({ nonce, isDevelopment: false, host: "app.exemplo.com" }));
    expect(csp).toEqual({
      "default-src": "'self'",
      "script-src": `'self' 'nonce-${nonce}' 'strict-dynamic'`,
      "style-src": "'self' 'unsafe-inline'",
      "img-src": "'self' data: blob:",
      "font-src": "'self'",
      "connect-src": "'self'",
      "frame-ancestors": "'none'",
      "base-uri": "'self'",
      "form-action": "'self'",
      "object-src": "'none'",
    });
  });

  it("desenvolvimento: só acrescenta 'unsafe-eval' (script-src) e o websocket do próprio host (connect-src)", () => {
    const prod = parse(buildCspReportOnly({ nonce, isDevelopment: false, host: "localhost:3000" }));
    const dev = parse(buildCspReportOnly({ nonce, isDevelopment: true, host: "localhost:3000" }));
    expect(dev["script-src"]).toBe(`${prod["script-src"]} 'unsafe-eval'`);
    expect(dev["connect-src"]).toBe("'self' ws://localhost:3000");
    for (const directive of Object.keys(prod).filter((d) => d !== "script-src" && d !== "connect-src")) {
      expect(dev[directive], directive).toBe(prod[directive]);
    }
  });

  it("não há script inline permitido (sem 'unsafe-inline' em script-src) nem origem externa", () => {
    const csp = buildCspReportOnly({ nonce, isDevelopment: false });
    expect(parse(csp)["script-src"]).not.toContain("unsafe-inline");
    expect(csp).not.toMatch(/https?:\/\//);
  });

  it("o nonce é novo a cada chamada, em base64", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => generateNonce()));
    expect(nonces.size).toBe(50);
    for (const n of nonces) expect(n).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });
});

describe("next.config.ts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadConfig() {
    vi.resetModules();
    return (await import("../../next.config")).default;
  }

  it("desliga o X-Powered-By e aplica os cabecalhos fixos em todas as rotas (sem HSTS fora de produção)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const config = await loadConfig();
    expect(config.poweredByHeader).toBe(false);
    const rules = await config.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*"); // páginas, API e arquivos estáticos
    expect(rules[0].headers.map((h) => h.key)).not.toContain("Strict-Transport-Security");
    expect(asMap(rules[0].headers)["X-Frame-Options"]).toBe("DENY");
  });

  it("simulando produção: o HSTS aparece", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const config = await loadConfig();
    const rules = await config.headers!();
    expect(asMap(rules[0].headers)["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
  });
});

describe("proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function run(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
    const { proxy } = await import("@/proxy");
    return proxy(new NextRequest(url, init));
  }

  it("página pública: CSP em observação com nonce, cabeçalhos fixos, e o nonce repassado à requisição", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = await run("http://localhost:3000/login");
    const csp = res.headers.get(CSP_REPORT_ONLY_HEADER)!;
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(res.headers.get("content-security-policy")).toBeNull(); // só observação, nada é bloqueado
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("strict-transport-security")).toBeNull();
    // O Next.js lê o nonce do cabecalho de REQUISICAO: o proxy o repassa (x-middleware-request-*).
    const nonce = /'nonce-([^']+)'/.exec(csp)![1];
    expect(res.headers.get(`x-middleware-request-${NONCE_REQUEST_HEADER}`)).toBe(nonce);
    expect(res.headers.get(`x-middleware-request-${CSP_REPORT_ONLY_HEADER.toLowerCase()}`)).toBe(csp);
  });

  it("cada requisição recebe um nonce diferente", async () => {
    const nonceOf = async () => /'nonce-([^']+)'/.exec((await run("http://localhost:3000/")).headers.get(CSP_REPORT_ONLY_HEADER)!)![1];
    expect(await nonceOf()).not.toBe(await nonceOf());
  });

  it("produção: HSTS presente", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await run("http://localhost:3000/login");
    expect(res.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    expect(res.headers.get(CSP_REPORT_ONLY_HEADER)).not.toContain("unsafe-eval");
  });

  it("API: cabeçalhos fixos, sem CSP (só devolve JSON)", async () => {
    const res = await run("http://localhost:3000/api/clientes/search");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get(CSP_REPORT_ONLY_HEADER)).toBeNull();
  });

  it("rota protegida sem cookie: continua redirecionando para /login, agora com os cabeçalhos fixos", async () => {
    for (const path of ["/dashboard", "/agenda/novo", "/financeiro/receitas"]) {
      const res = await run(`http://localhost:3000${path}`);
      expect(res.status, path).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
    }
  });

  it("rota protegida com cookie de sessão segue em frente; prefixo parecido não é protegido", async () => {
    const withCookie = await run("http://localhost:3000/dashboard", { headers: { cookie: "session=abc" } });
    expect(withCookie.status).toBe(200);
    // "/agendamento-publico" começa com "/agenda" mas não é "/agenda" nem "/agenda/...".
    const lookalike = await run("http://localhost:3000/agendamento-publico");
    expect(lookalike.status).toBe(200);
  });
});

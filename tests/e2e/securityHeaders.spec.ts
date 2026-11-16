import { test, expect, type APIResponse } from "@playwright/test";
import { createOnboardedUser, newTestPrisma } from "./helpers/session";
import { assertTestDatabase, loadTestEnv } from "../testEnv";

// Cabecalhos HTTP de seguranca nas respostas REAIS do servidor (paginas, API, redirect do proxy
// e arquivos estaticos). O servidor de teste e `next dev`: HSTS nao deve aparecer (o teste da
// funcao que monta os cabecalhos, em tests/unit/securityHeaders.test.ts, cobre a producao).
loadTestEnv();
assertTestDatabase();
const prisma = newTestPrisma();
const createdUserIds: string[] = [];

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

const FIXED = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(self), microphone=(), geolocation=(), payment=()",
};

function expectFixedHeaders(res: APIResponse, label: string) {
  const headers = res.headers();
  for (const [name, value] of Object.entries(FIXED)) expect(headers[name], `${label}: ${name}`).toBe(value);
  expect(headers["strict-transport-security"], `${label}: HSTS so em producao`).toBeUndefined();
  expect(headers["x-powered-by"], `${label}: X-Powered-By desligado`).toBeUndefined();
}

const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1];

test.describe("cabeçalhos de segurança", () => {
  test("páginas públicas: cabeçalhos fixos e CSP em observação com nonce", async ({ request }) => {
    for (const path of ["/", "/login", "/register", "/forgot-password", "/privacidade", "/termos", "/cookies", "/tokushoho"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      expectFixedHeaders(res, path);
      const csp = res.headers()["content-security-policy-report-only"];
      expect(csp, `${path}: CSP em observacao`).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(nonceOf(csp), `${path}: nonce`).toBeTruthy();
      // So observacao: nada e bloqueado.
      expect(res.headers()["content-security-policy"], `${path}: sem CSP de bloqueio`).toBeUndefined();
    }
  });

  test("o nonce muda a cada requisição e é o mesmo em todos os <script> da página", async ({ request }) => {
    const get = async () => {
      const res = await request.get("/login");
      const nonce = nonceOf(res.headers()["content-security-policy-report-only"])!;
      const html = await res.text();
      const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
      return { nonce, scripts };
    };
    const a = await get();
    const b = await get();
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.scripts.length).toBeGreaterThan(0);
    // Nenhum script (inclusive o inline da barra lateral) fica sem nonce, e e o desta requisicao.
    for (const tag of a.scripts) expect(tag, tag.slice(0, 120)).toContain(`nonce="${a.nonce}"`);
  });

  test("API: cabeçalhos fixos nas respostas de sucesso e de erro", async ({ request }) => {
    expectFixedHeaders(await request.get("/api/clientes/search"), "GET /api/clientes/search (401)");
    const bad = await request.post("/api/auth/login", { data: { email: "x" } });
    expect(bad.status()).toBe(400);
    expectFixedHeaders(bad, "POST /api/auth/login (400)");
    const csv = await request.get("/api/financeiro/import/template");
    expectFixedHeaders(csv, "GET /api/financeiro/import/template");
  });

  test("redirect do proxy (rota protegida sem sessão) também leva os cabeçalhos", async ({ request }) => {
    for (const path of ["/dashboard", "/agenda", "/financeiro/receitas"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(307);
      expect(res.headers().location).toContain("/login");
      expectFixedHeaders(res, `redirect ${path}`);
    }
  });

  test("arquivo estático do Next (chunk de JS) leva os cabeçalhos fixos", async ({ request }) => {
    const html = await (await request.get("/login")).text();
    const chunk = /\/_next\/static\/[^"'\s<>)\\]+\.js/.exec(html)?.[0];
    expect(chunk).toBeTruthy();
    const res = await request.get(chunk!);
    expect(res.status()).toBe(200);
    expectFixedHeaders(res, chunk!);
  });

  test("área logada: páginas do app com sessão levam os cabeçalhos e a CSP", async ({ request }) => {
    const user = await createOnboardedUser(prisma, "headers");
    createdUserIds.push(user.userId);
    for (const path of ["/dashboard", "/financeiro/receitas", "/agenda", "/vendas", "/insights"]) {
      const res = await request.get(path, { headers: { cookie: user.cookieHeader } });
      expect(res.status(), path).toBe(200);
      expectFixedHeaders(res, path);
      expect(nonceOf(res.headers()["content-security-policy-report-only"]), `${path}: nonce`).toBeTruthy();
    }
  });
});

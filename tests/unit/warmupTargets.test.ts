import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clientAssetPaths, discoverWarmupTargets, WARMUP_DYNAMIC_VALUE } from "../e2e/helpers/warmup";

// A lista do aquecimento do servidor de teste sai do sistema de arquivos (src/app/**/page.tsx e
// route.ts): pagina ou rota nova entra sozinha. Aqui: as regras de mapeamento arquivo -> URL.
let root: string;
const touch = (rel: string) => {
  const file = join(root, rel);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, "export {};\n");
};

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "warmup-targets-"));
  touch("page.tsx"); // raiz
  touch("login/page.tsx"); // publica
  touch("(app)/dashboard/page.tsx"); // grupo de rotas: nao entra na URL, exige sessao
  touch("(app)/agenda/[id]/editar/page.tsx"); // segmento dinamico
  touch("reset-password/[token]/page.tsx"); // dinamico fora do grupo: publica
  touch("api/agenda/[id]/undo/route.ts"); // rota de API
  touch("api/docs/[...slug]/route.ts"); // catch-all
  touch("(app)/_privada/page.tsx"); // pasta privada: ignorada
  touch("@modal/page.tsx"); // rota paralela: ignorada
  touch("login/layout.tsx"); // nao e page nem route: ignorado
  touch("login/LoginForm.tsx"); // componente: ignorado
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("discoverWarmupTargets (fixture)", () => {
  it("mapeia arquivos para URLs: grupo some, segmento dinamico vira um valor qualquer, pasta privada e rota paralela saem", () => {
    const targets = discoverWarmupTargets(root).map((t) => `${t.kind} ${t.authenticated ? "auth" : "pub "} ${t.url}`);
    expect(targets).toEqual([
      "page pub  /",
      `page auth /agenda/${WARMUP_DYNAMIC_VALUE}/editar`,
      `api auth /api/agenda/${WARMUP_DYNAMIC_VALUE}/undo`,
      `api auth /api/docs/${WARMUP_DYNAMIC_VALUE}`,
      "page auth /dashboard",
      "page pub  /login",
      `page pub  /reset-password/${WARMUP_DYNAMIC_VALUE}`,
    ]);
  });

  it("arquivo novo entra sozinho na lista", () => {
    touch("(app)/relatorios/page.tsx");
    expect(discoverWarmupTargets(root).map((t) => t.url)).toContain("/relatorios");
  });
});

describe("discoverWarmupTargets (src/app real)", () => {
  function count(dir: string): number {
    return readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => {
      if (e.isDirectory()) return sum + count(join(dir, e.name));
      return sum + (/^(page\.(tsx|ts|jsx|js)|route\.(ts|js))$/.test(e.name) ? 1 : 0);
    }, 0);
  }

  it("cobre todas as paginas e rotas do app, sem URL com colchetes e sem duplicata", () => {
    const targets = discoverWarmupTargets();
    expect(targets.length).toBe(count(join(process.cwd(), "src", "app")));
    expect(targets.every((t) => !/[[\]()]/.test(t.url))).toBe(true);
    const keys = targets.map((t) => `${t.kind} ${t.url}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("inclui as paginas publicas (sem sessao) e as do app (com sessao)", () => {
    const targets = discoverWarmupTargets();
    const find = (url: string) => targets.find((t) => t.kind === "page" && t.url === url);
    for (const url of ["/", "/login", "/register", "/privacidade", "/termos", "/cookies", "/tokushoho"]) {
      expect(find(url)?.authenticated, url).toBe(false);
    }
    for (const url of ["/dashboard", "/agenda", "/vendas", "/financeiro/receitas"]) {
      expect(find(url)?.authenticated, url).toBe(true);
    }
    expect(targets.some((t) => t.kind === "api" && t.url === `/api/agenda/${WARMUP_DYNAMIC_VALUE}/undo`)).toBe(true);
  });
});

describe("clientAssetPaths", () => {
  it("extrai os chunks de JS e CSS do cliente citados no HTML (tags e payload inline), sem repetir", () => {
    const html = `<link rel="stylesheet" href="/_next/static/chunks/app_globals.css?v=1"/>
      <script src="/_next/static/chunks/a.js" async></script><script src="/_next/static/chunks/a.js"></script>
      <script>self.__next_f.push([1,"/_next/static/chunks/b.js"])</script><img src="/logo.png"/>`;
    expect(clientAssetPaths(html)).toEqual(["/_next/static/chunks/app_globals.css?v=1", "/_next/static/chunks/a.js", "/_next/static/chunks/b.js"]);
  });
});

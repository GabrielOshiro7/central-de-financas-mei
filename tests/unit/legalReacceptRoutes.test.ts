import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { REACCEPT_EXEMPT_API_PREFIXES, isReacceptExemptApiPath } from "@/lib/legal/reacceptExempt";

// Toda rota de API do app que exige login precisa responder 403 ao usuário com reaceite pendente
// (legalReacceptBlock, logo depois da checagem de login). Ficam de fora SÓ as rotas da lista única
// REACCEPT_EXEMPT_API_PREFIXES (src/lib/legal/reacceptExempt.ts). Se uma rota nova esquecer a
// chamada, este teste falha.
const API_DIR = join(process.cwd(), "src", "app", "api");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === "route.ts" ? [path] : [];
  });
}

const rel = (file: string) => relative(API_DIR, file).split("\\").join("/");

describe("lista única de rotas liberadas do reaceite", () => {
  it("tem só as rotas de autenticação e a de aceite (e cada prefixo é uma pasta que existe)", () => {
    expect([...REACCEPT_EXEMPT_API_PREFIXES]).toEqual(["auth/", "legal/"]);
    for (const prefix of REACCEPT_EXEMPT_API_PREFIXES) {
      expect(prefix.endsWith("/"), prefix).toBe(true);
      expect(existsSync(join(API_DIR, prefix)), prefix).toBe(true);
    }
  });

  it("isReacceptExemptApiPath: casa pelo prefixo da pasta, com / ou \\ e sem confundir nomes parecidos", () => {
    expect(isReacceptExemptApiPath("auth/logout/route.ts")).toBe(true);
    expect(isReacceptExemptApiPath("auth\\login\\route.ts")).toBe(true);
    expect(isReacceptExemptApiPath("/legal/accept/route.ts")).toBe(true);
    expect(isReacceptExemptApiPath("clientes/route.ts")).toBe(false);
    expect(isReacceptExemptApiPath("authentic/route.ts")).toBe(false);
    expect(isReacceptExemptApiPath("account/theme/route.ts")).toBe(false);
  });

  it("o comentário avisa que exportação de dados e exclusão de conta DEVEM entrar na lista", () => {
    // Junta as linhas do comentário (quebra de linha + "//") para o texto poder atravessar a quebra.
    const source = readFileSync(join(process.cwd(), "src", "lib", "legal", "reacceptExempt.ts"), "utf8").replace(/\r?\n\/\/ ?/g, " ");
    expect(source).toMatch(/EXPORTACAO DE DADOS/);
    expect(source).toMatch(/EXCLUSAO DE CONTA/);
    expect(source).toMatch(/DEVEM ser acrescentadas a esta lista/);
    expect(source).toMatch(/Direitos do titular nao podem depender de aceitar termos novos/);
  });
});

describe("rotas de API e o bloqueio de reaceite", () => {
  const files = routeFiles(API_DIR).map((file) => ({ path: rel(file), source: readFileSync(file, "utf8") }));
  const guarded = files.filter((f) => !isReacceptExemptApiPath(f.path));
  const exempt = files.filter((f) => isReacceptExemptApiPath(f.path));

  it("encontra as rotas (sanidade)", () => {
    expect(files.length).toBeGreaterThan(40);
    expect(guarded.length).toBeGreaterThan(30);
    expect(exempt.length).toBeGreaterThan(5);
  });

  it("toda rota fora da lista chama legalReacceptBlock", () => {
    const missing = guarded.filter((f) => !f.source.includes("legalReacceptBlock(")).map((f) => f.path);
    expect(missing, `Rotas sem o bloqueio de reaceite (ou faltando na lista de rotas liberadas): ${missing.join(", ")}`).toEqual([]);
  });

  it("o bloqueio vem DEPOIS da checagem de login (401 antes de 403) e ANTES de qualquer acesso a dados", () => {
    const wrong: string[] = [];
    for (const f of guarded) {
      const lines = f.source.split(/\r?\n/);
      const gate = lines.findIndex((l) => l.includes("legalReacceptBlock("));
      const login = lines.findIndex((l) => l.includes("Não autenticado."));
      const data = lines.findIndex((l) => /prisma\./.test(l) && !l.startsWith("import"));
      if (gate < login || (data >= 0 && gate > data && login < data)) wrong.push(f.path);
    }
    expect(wrong).toEqual([]);
  });

  it("as rotas da lista NÃO são bloqueadas (senão o usuário não conseguiria sair nem aceitar)", () => {
    const blocked = exempt.filter((f) => f.source.includes("legalReacceptBlock(")).map((f) => f.path);
    expect(blocked).toEqual([]);
    expect(files.some((f) => f.path === "legal/accept/route.ts")).toBe(true);
    expect(files.some((f) => f.path === "auth/logout/route.ts")).toBe(true);
  });

  it("a rota de aceite exige login e grava as versões vigentes (não as do cliente)", () => {
    const accept = files.find((f) => f.path === "legal/accept/route.ts")!.source;
    expect(accept).toContain("getCurrentUser()");
    expect(accept).toContain("currentAcceptanceData()");
    expect(accept).not.toMatch(/termsVersion:\s*parsed/);
  });
});

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { REACCEPT_EXEMPT_ACTION_FILES } from "@/lib/legal/reacceptExempt";
import { LEGAL_REACCEPT_ERROR_CODE, LegalReacceptRequiredError, requireLegalAcceptanceForAction } from "@/lib/legal/apiGate";

// Hoje o projeto NÃO tem nenhuma server action ("use server"). Este teste garante que, se alguém criar
// uma, ela passe pelo guard do reaceite (requireLegalAcceptanceForAction) - ou entre, de propósito, na
// lista REACCEPT_EXEMPT_ACTION_FILES (src/lib/legal/reacceptExempt.ts).
const GUARD_CALL = "requireLegalAcceptanceForAction(";
// A diretiva "use server" vale de arquivo inteiro ou dentro de uma funcao: sempre numa linha propria.
const DIRECTIVE = /^[ \t]*(["'])use server\1;?[ \t]*$/m;

type Source = { path: string; source: string };

export function findServerActionViolations(files: Source[], exempt: readonly string[] = []): string[] {
  return files
    .filter((f) => DIRECTIVE.test(f.source))
    .filter((f) => !exempt.includes(f.path))
    .filter((f) => !f.source.includes(GUARD_CALL))
    .map((f) => f.path);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(name) ? [path] : [];
  });
}

describe("server actions e o guard de reaceite", () => {
  const root = process.cwd();
  const files = sourceFiles(join(root, "src")).map((file) => ({ path: relative(root, file).split("\\").join("/"), source: readFileSync(file, "utf8") }));

  it("varre o código-fonte (sanidade)", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("todo arquivo com \"use server\" chama requireLegalAcceptanceForAction (hoje não há nenhum)", () => {
    const violations = findServerActionViolations(files, REACCEPT_EXEMPT_ACTION_FILES);
    expect(violations, `Server action sem o guard de reaceite: ${violations.join(", ")}`).toEqual([]);
  });

  it("a lista de actions isentas está vazia (nenhuma action existe; só direito do titular/autenticação poderia entrar)", () => {
    expect([...REACCEPT_EXEMPT_ACTION_FILES]).toEqual([]);
  });

  describe("o detector funciona (arquivos de exemplo)", () => {
    const action = (body: string) => `"use server";\n\nimport { x } from "y";\n${body}\n`;

    it("acha \"use server\" de arquivo inteiro, de função e com aspas simples", () => {
      expect(findServerActionViolations([{ path: "a.ts", source: action("export async function a() {}") }])).toEqual(["a.ts"]);
      expect(findServerActionViolations([{ path: "b.ts", source: "export async function b() {\n  'use server'\n  return 1;\n}\n" }])).toEqual(["b.ts"]);
      expect(findServerActionViolations([{ path: "c.tsx", source: "  \"use server\"\nexport default function C() {}\n" }])).toEqual(["c.tsx"]);
    });

    it("não acusa quem chama o guard, quem está na lista de isentas, nem a simples menção em comentário/texto", () => {
      expect(findServerActionViolations([{ path: "d.ts", source: action("requireLegalAcceptanceForAction(user);") }])).toEqual([]);
      expect(findServerActionViolations([{ path: "e.ts", source: action("export async function e() {}") }], ["e.ts"])).toEqual([]);
      expect(findServerActionViolations([{ path: "f.ts", source: '// nao usar "use server" aqui\nconst s = "use server";\n' }])).toEqual([]);
    });
  });
});

describe("guard de server action (equivalente ao 403 da API)", () => {
  const NEVER = { legalAcceptedAt: null, termsVersion: null, privacyVersion: null };

  it("com o rascunho ligado (mecanismo desligado) não lança", () => {
    expect(() => requireLegalAcceptanceForAction(NEVER)).not.toThrow();
  });

  it("o erro carrega status 403 e o mesmo código da API (LEGAL_REACCEPT_REQUIRED)", () => {
    const error = new LegalReacceptRequiredError();
    expect(error.status).toBe(403);
    expect(error.code).toBe(LEGAL_REACCEPT_ERROR_CODE);
    expect(error.reacceptUrl).toBe("/reaceite");
    expect(error.message).toMatch(/aceite os Termos de Serviço e a Política de Privacidade atualizados/i);
  });
});

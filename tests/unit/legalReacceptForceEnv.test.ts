import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// LEGAL_REACCEPT_FORCE=1 existe SÓ para o servidor de teste do Playwright ligar o reaceite com o
// rascunho ainda ligado (playwright.config.ts). Em produção ele NUNCA vale: o trecho que o ignora é
// isReacceptEnabled em src/lib/legal/acceptance.ts:
//
//   if (!draft) return true;
//   return env.NODE_ENV !== "production" && env[REACCEPT_FORCE_ENV] === "1";
//
// Estes testes usam o process.env DE VERDADE (vi.stubEnv), sem objeto injetado, e passam por todo o
// caminho do app: a regra, o bloqueio das rotas de API, o guard das server actions e o guard das telas.
class RedirectError extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`);
  }
}

const NEVER = { legalAcceptedAt: null, termsVersion: null, privacyVersion: null };

function mockDraft(draft: boolean) {
  vi.doMock("@/content/legal/meta", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/content/legal/meta")>()), LEGAL_DOCS_DRAFT: draft }));
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("@/content/legal/meta");
});

describe("LEGAL_REACCEPT_FORCE em produção (NODE_ENV=production)", () => {
  it("rascunho ligado + FORCE=1 + produção: o reaceite continua DESLIGADO (comportamento de produção)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LEGAL_REACCEPT_FORCE", "1");
    mockDraft(true);
    const acceptance = await import("@/lib/legal/acceptance");
    expect(process.env.NODE_ENV).toBe("production");
    expect(process.env.LEGAL_REACCEPT_FORCE).toBe("1");
    expect(acceptance.isReacceptEnabled()).toBe(false);
    expect(acceptance.needsReaccept(NEVER)).toBe(false);
  });

  it("rotas de API: sem 403 (legalReacceptBlock devolve null) em produção, mesmo com FORCE=1", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LEGAL_REACCEPT_FORCE", "1");
    mockDraft(true);
    const { legalReacceptBlock, requireLegalAcceptanceForAction } = await import("@/lib/legal/apiGate");
    expect(legalReacceptBlock(NEVER)).toBeNull();
    expect(() => requireLegalAcceptanceForAction(NEVER)).not.toThrow();
  });

  it("telas: o guard do app NÃO redireciona ao reaceite em produção, mesmo com FORCE=1", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LEGAL_REACCEPT_FORCE", "1");
    mockDraft(true);
    vi.doMock("next/navigation", () => ({
      redirect: (url: string) => {
        throw new RedirectError(url);
      },
    }));
    vi.doMock("@/lib/auth/cookies", () => ({
      getCurrentUserWithReason: async () => ({ user: { id: "u1", name: "N", email: "e@example.com", themePreference: null, ...NEVER } }),
    }));
    vi.doMock("@/lib/db", () => ({ prisma: { business: { findUnique: async () => ({ id: "b1", userId: "u1", onboardingCompleted: true }) } } }));
    const { requireOnboardedUser } = await import("@/lib/auth/guards");
    await expect(requireOnboardedUser()).resolves.toMatchObject({ user: { id: "u1" } });
  });

  it("em produção quem manda é o rascunho: desligado => reaceite LIGADO, com ou sem FORCE", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockDraft(false);
    const a = await import("@/lib/legal/acceptance");
    expect(a.isReacceptEnabled()).toBe(true);
    expect(a.needsReaccept(NEVER)).toBe(true);
    vi.stubEnv("LEGAL_REACCEPT_FORCE", "1");
    expect(a.isReacceptEnabled()).toBe(true);
  });

  it("contraste (prova de que o teste enxerga a diferença): fora de produção, FORCE=1 liga o reaceite com o rascunho ligado", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LEGAL_REACCEPT_FORCE", "1");
    mockDraft(true);
    const a = await import("@/lib/legal/acceptance");
    expect(a.isReacceptEnabled()).toBe(true);
    expect(a.needsReaccept(NEVER)).toBe(true);
    const { legalReacceptBlock } = await import("@/lib/legal/apiGate");
    expect(legalReacceptBlock(NEVER)?.status).toBe(403);
  });

  it("sem FORCE (ou com outro valor), nem fora de produção o rascunho liga o reaceite", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mockDraft(true);
    const a = await import("@/lib/legal/acceptance");
    expect(a.isReacceptEnabled()).toBe(false);
    vi.stubEnv("LEGAL_REACCEPT_FORCE", "true");
    expect(a.isReacceptEnabled()).toBe(false);
    vi.stubEnv("LEGAL_REACCEPT_FORCE", "0");
    expect(a.isReacceptEnabled()).toBe(false);
  });

  it("o código-fonte confere: só o servidor de teste define LEGAL_REACCEPT_FORCE (playwright.config.ts)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
    expect(read("playwright.config.ts")).toContain('LEGAL_REACCEPT_FORCE: "1"');
    for (const file of ["package.json", "next.config.ts", ".env.example", "docker-compose.yml"]) {
      let text = "";
      try {
        text = read(file);
      } catch {
        // arquivo opcional
      }
      expect(text, file).not.toContain("LEGAL_REACCEPT_FORCE");
    }
    expect(read("src/lib/legal/acceptance.ts")).toContain('env.NODE_ENV !== "production" && env[REACCEPT_FORCE_ENV] === "1"');
  });
});

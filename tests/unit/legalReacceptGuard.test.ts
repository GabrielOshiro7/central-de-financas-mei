import { describe, it, expect, vi, beforeEach } from "vitest";

// Prova do interruptor: com LEGAL_DOCS_DRAFT desligado, usuários sem aceite (ou com versão antiga) são
// redirecionados ao reaceite; com o rascunho ligado, ninguém é redirecionado. As dependências de
// requisição (cookies, banco, redirect do Next) são trocadas por dublês; o guard é o mesmo do app.
class RedirectError extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`);
  }
}

type Fields = { legalAcceptedAt: Date | null; termsVersion: string | null; privacyVersion: string | null };

function mockMeta(draft: boolean) {
  vi.doMock("@/content/legal/meta", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/content/legal/meta")>()), LEGAL_DOCS_DRAFT: draft }));
}

async function loadGuard(draft: boolean, user: Fields | null) {
  vi.resetModules();
  mockMeta(draft);
  vi.doMock("next/navigation", () => ({
    redirect: (url: string) => {
      throw new RedirectError(url);
    },
  }));
  vi.doMock("@/lib/auth/cookies", () => ({
    getCurrentUserWithReason: async () => ({ user: user ? { id: "u1", name: "N", email: "e@example.com", themePreference: null, ...user } : null }),
  }));
  vi.doMock("@/lib/db", () => ({
    prisma: { business: { findUnique: async () => ({ id: "b1", userId: "u1", onboardingCompleted: true }) } },
  }));
  const guards = await import("@/lib/auth/guards");
  const meta = await import("@/content/legal/meta");
  return { requireOnboardedUser: guards.requireOnboardedUser, meta };
}

async function redirectedTo(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    if (error instanceof RedirectError) return error.url;
    throw error;
  }
}

const NEVER: Fields = { legalAcceptedAt: null, termsVersion: null, privacyVersion: null };

beforeEach(() => {
  vi.resetModules();
});

describe("guard do app: reaceite dos documentos legais", () => {
  it("rascunho LIGADO: usuário sem aceite entra no app normalmente (mecanismo desligado)", async () => {
    const { requireOnboardedUser, meta } = await loadGuard(true, NEVER);
    expect(meta.LEGAL_DOCS_DRAFT).toBe(true);
    expect(await redirectedTo(requireOnboardedUser)).toBeNull();
  });

  it("rascunho DESLIGADO: usuário sem aceite (campos nulos) é redirecionado ao reaceite", async () => {
    const { requireOnboardedUser, meta } = await loadGuard(false, NEVER);
    expect(meta.LEGAL_DOCS_DRAFT).toBe(false);
    expect(await redirectedTo(requireOnboardedUser)).toBe("/reaceite");
  });

  it("rascunho DESLIGADO: versão aceita menor que a vigente também vai ao reaceite", async () => {
    const { requireOnboardedUser } = await loadGuard(false, { legalAcceptedAt: new Date(), termsVersion: "0.1", privacyVersion: "0.1" });
    expect(await redirectedTo(requireOnboardedUser)).toBe("/reaceite");
  });

  it("rascunho DESLIGADO: quem aceitou as versões vigentes segue para o app", async () => {
    const { TERMS_VERSION, PRIVACY_POLICY_VERSION } = await import("@/content/legal/meta");
    const ok = await loadGuard(false, { legalAcceptedAt: new Date(), termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_POLICY_VERSION });
    expect(await redirectedTo(ok.requireOnboardedUser)).toBeNull();
  });

  it("sem login continua indo ao /login (o reaceite não mascara a checagem de sessão)", async () => {
    const { requireOnboardedUser } = await loadGuard(false, null);
    expect(await redirectedTo(requireOnboardedUser)).toBe("/login");
  });
});

describe("rotas de API: bloqueio 403 só com o mecanismo ligado", () => {
  async function loadGate(draft: boolean) {
    vi.resetModules();
    mockMeta(draft);
    return import("@/lib/legal/apiGate");
  }

  it("rascunho ligado: não bloqueia", async () => {
    const { legalReacceptBlock } = await loadGate(true);
    expect(legalReacceptBlock(NEVER)).toBeNull();
  });

  it("rascunho desligado + pendência: 403 com mensagem clara, código e endereço do reaceite", async () => {
    const { legalReacceptBlock, LEGAL_REACCEPT_ERROR_CODE } = await loadGate(false);
    const response = legalReacceptBlock(NEVER)!;
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toMatch(/aceite os Termos de Serviço e a Política de Privacidade atualizados/i);
    expect(body.code).toBe(LEGAL_REACCEPT_ERROR_CODE);
    expect(body.reacceptUrl).toBe("/reaceite");
  });

  it("rascunho desligado, sem pendência: libera", async () => {
    const { legalReacceptBlock } = await loadGate(false);
    const meta = await import("@/content/legal/meta");
    expect(legalReacceptBlock({ legalAcceptedAt: new Date(), termsVersion: meta.TERMS_VERSION, privacyVersion: meta.PRIVACY_POLICY_VERSION })).toBeNull();
  });
});

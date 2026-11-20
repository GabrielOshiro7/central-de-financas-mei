import { describe, it, expect } from "vitest";
import { acceptancePending, compareVersions, currentAcceptanceData, isReacceptEnabled, needsReaccept, REACCEPT_FORCE_ENV } from "@/lib/legal/acceptance";
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from "@/content/legal/meta";

const CURRENT = { terms: "0.2", privacy: "0.3" };
const accepted = (terms: string | null, privacy: string | null, at: Date | null = new Date()) => ({ legalAcceptedAt: at, termsVersion: terms, privacyVersion: privacy });

describe("compareVersions", () => {
  it("compara campo a campo, em número (0.10 > 0.9) e trata campos faltando como 0", () => {
    expect(compareVersions("0.2", "0.2")).toBe(0);
    expect(compareVersions("0.1", "0.2")).toBeLessThan(0);
    expect(compareVersions("0.3", "0.2")).toBeGreaterThan(0);
    expect(compareVersions("0.10", "0.9")).toBeGreaterThan(0);
    expect(compareVersions("1", "0.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0", "1")).toBe(0);
  });
});

describe("acceptancePending (independe de o mecanismo estar ligado)", () => {
  it("pendente quando nunca aceitou (campos nulos)", () => {
    expect(acceptancePending(accepted(null, null, null), CURRENT)).toBe(true);
  });
  it("pendente quando falta a data ou qualquer uma das versões", () => {
    expect(acceptancePending(accepted("0.2", "0.3", null), CURRENT)).toBe(true);
    expect(acceptancePending(accepted(null, "0.3"), CURRENT)).toBe(true);
    expect(acceptancePending(accepted("0.2", null), CURRENT)).toBe(true);
  });
  it("pendente quando QUALQUER versão aceita é menor que a vigente", () => {
    expect(acceptancePending(accepted("0.1", "0.3"), CURRENT)).toBe(true);
    expect(acceptancePending(accepted("0.2", "0.2"), CURRENT)).toBe(true);
  });
  it("em dia quando as duas versões são iguais (ou maiores) às vigentes", () => {
    expect(acceptancePending(accepted("0.2", "0.3"), CURRENT)).toBe(false);
    expect(acceptancePending(accepted("0.9", "1.0"), CURRENT)).toBe(false);
  });
  it("usa as versões vigentes do código por padrão", () => {
    expect(acceptancePending(accepted(TERMS_VERSION, PRIVACY_POLICY_VERSION))).toBe(false);
    expect(acceptancePending(accepted("0.0", PRIVACY_POLICY_VERSION))).toBe(true);
  });
});

describe("isReacceptEnabled", () => {
  it("DESLIGADO enquanto o texto é rascunho (LEGAL_DOCS_DRAFT = true), mesmo sem aceite", () => {
    expect(isReacceptEnabled(true, {})).toBe(false);
    expect(isReacceptEnabled(true, { NODE_ENV: "development" })).toBe(false);
  });
  it("LIGA sozinho quando o rascunho desliga (LEGAL_DOCS_DRAFT = false)", () => {
    expect(isReacceptEnabled(false, {})).toBe(true);
    expect(isReacceptEnabled(false, { NODE_ENV: "production" })).toBe(true);
  });
  it("a variável de teste força o mecanismo só fora de produção", () => {
    expect(isReacceptEnabled(true, { [REACCEPT_FORCE_ENV]: "1", NODE_ENV: "development" })).toBe(true);
    expect(isReacceptEnabled(true, { [REACCEPT_FORCE_ENV]: "1", NODE_ENV: "test" })).toBe(true);
    expect(isReacceptEnabled(true, { [REACCEPT_FORCE_ENV]: "1", NODE_ENV: "production" })).toBe(false);
    expect(isReacceptEnabled(true, { [REACCEPT_FORCE_ENV]: "true", NODE_ENV: "development" })).toBe(false);
  });
});

describe("needsReaccept com o estado real do código (rascunho ligado)", () => {
  it("é falso para qualquer usuário, inclusive sem aceite, enquanto LEGAL_DOCS_DRAFT for true", () => {
    // O Vitest não liga LEGAL_REACCEPT_FORCE. Quando o rascunho for desligado de verdade, o
    // comportamento ligado já é coberto por legalReacceptGuard.test.ts (que simula o rascunho desligado).
    expect(needsReaccept(accepted(null, null, null))).toBe(false);
    expect(needsReaccept(accepted("0.0", "0.0"))).toBe(false);
  });
});

describe("currentAcceptanceData", () => {
  it("grava a hora informada e as versões vigentes (nunca do cliente)", () => {
    const now = new Date("2026-11-19T12:00:00Z");
    expect(currentAcceptanceData(now)).toEqual({ legalAcceptedAt: now, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_POLICY_VERSION });
  });
});

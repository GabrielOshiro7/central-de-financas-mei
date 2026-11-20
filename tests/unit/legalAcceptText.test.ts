import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  INFORMATIONAL_NOTICE,
  MINIMUM_AGE,
  PRIVACY_POLICY_VERSION,
  REGISTER_ACCEPT_LEAD,
  REGISTER_ACCEPT_PRIVACY_LABEL,
  REGISTER_ACCEPT_TERMS_LABEL,
  REGISTER_ACCEPT_TEXT,
  TERMS_VERSION,
} from "@/content/legal/meta";
import { registerSchema, legalAcceptSchema } from "@/lib/validation/auth";
import { CURRENT_VERSIONS, PRIVACY_CHANGES, TERMS_CHANGES, changesSince, summarizeChanges } from "@/content/legal/changes";
import { PRIVACY_POLICY } from "@/content/legal";
import { compareVersions } from "@/lib/legal/acceptance";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("maioridade: caixa de aceite do cadastro", () => {
  it("o texto é exatamente o combinado", () => {
    expect(REGISTER_ACCEPT_TEXT).toBe("Declaro ter 18 anos ou mais e li e aceito os Termos de Serviço e a Política de Privacidade");
    expect(REGISTER_ACCEPT_LEAD).toBe("Declaro ter 18 anos ou mais e li e aceito os");
    expect(REGISTER_ACCEPT_TERMS_LABEL).toBe("Termos de Serviço");
    expect(REGISTER_ACCEPT_PRIVACY_LABEL).toBe("Política de Privacidade");
  });

  it("a idade vem de UMA constante: nada no formulário, na validação ou no reaceite repete o número", () => {
    expect(MINIMUM_AGE).toBe(18);
    expect(REGISTER_ACCEPT_TEXT).toContain(`${MINIMUM_AGE} anos`);
    for (const file of ["src/app/register/RegisterForm.tsx", "src/lib/validation/auth.ts", "src/app/reaceite/ReacceptForm.tsx", "src/app/reaceite/page.tsx"]) {
      expect(read(file), file).not.toMatch(/\b18\b/);
    }
    // A Política cita a idade pela constante, nunca com o número digitado.
    expect(read("src/content/legal/privacy.ts")).toContain("${MINIMUM_AGE}");
  });

  it("o formulário monta o texto a partir das constantes", () => {
    const form = read("src/app/register/RegisterForm.tsx");
    expect(form).toContain("REGISTER_ACCEPT_LEAD");
    expect(form).toContain("REGISTER_ACCEPT_TERMS_LABEL");
    expect(form).toContain("REGISTER_ACCEPT_PRIVACY_LABEL");
    expect(form).not.toContain("Li e aceito");
  });

  const valid = { name: "Ana", email: "ana@example.com", password: "SenhaValida123", confirmPassword: "SenhaValida123" };

  it("validação no servidor: sem aceite é recusado, e a mensagem cita a idade da constante", () => {
    for (const acceptTerms of [false, undefined, "true", 1]) {
      const result = registerSchema.safeParse({ ...valid, acceptTerms });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].message).toBe(`Declare ter ${MINIMUM_AGE} anos ou mais e aceite os Termos de Serviço e a Política de Privacidade para criar a conta.`);
    }
    expect(registerSchema.safeParse({ ...valid, acceptTerms: true }).success).toBe(true);
  });

  it("a rota de cadastro valida com o mesmo schema e grava o aceite vigente", () => {
    const route = read("src/app/api/auth/register/route.ts");
    expect(route).toContain("registerSchema.safeParse");
    expect(route).toContain("currentAcceptanceData()");
  });

  it("reaceite: a caixa também é obrigatória e a mensagem traz a declaração de maioridade (idade da constante)", () => {
    for (const body of [{ acceptTerms: false }, {}, { acceptTerms: "true" }]) {
      const result = legalAcceptSchema.safeParse(body);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].message).toBe(`Declare ter ${MINIMUM_AGE} anos ou mais e aceite os Termos de Serviço e a Política de Privacidade para continuar.`);
    }
    expect(legalAcceptSchema.safeParse({ acceptTerms: true }).success).toBe(true);
  });

  it("reaceite: a caixa tem o MESMO texto do cadastro, montado das mesmas constantes (sem \"atualizados\" nem texto antigo)", () => {
    const form = read("src/app/reaceite/ReacceptForm.tsx");
    expect(form).toContain("REGISTER_ACCEPT_LEAD");
    expect(form).toContain("REGISTER_ACCEPT_TERMS_LABEL");
    expect(form).toContain("REGISTER_ACCEPT_PRIVACY_LABEL");
    expect(form).not.toContain("Li e aceito");
    expect(form).not.toContain("atualizados");
    // O texto que o usuário lê (lead + nomes dos documentos) é exatamente o do cadastro.
    expect(`${REGISTER_ACCEPT_LEAD} ${REGISTER_ACCEPT_TERMS_LABEL} e a ${REGISTER_ACCEPT_PRIVACY_LABEL}`).toBe(REGISTER_ACCEPT_TEXT);
  });

  it("reaceite: o servidor valida a caixa com o mesmo schema e grava o aceite vigente", () => {
    const route = read("src/app/api/legal/accept/route.ts");
    expect(route).toContain("legalAcceptSchema.safeParse");
    expect(route).toContain("currentAcceptanceData()");
  });
});

// Versões de um histórico posteriores a "accepted" (o que o reaceite deve mostrar) - calculado a partir das
// próprias listas, sem números de versão escritos à mão (os aceites "0.1"/"0.2" abaixo são ENTRADAS do passado).
const versionsAfter = (changes: { version: string }[], accepted: string) =>
  changes.map((c) => c.version).filter((v) => compareVersions(v, accepted) > 0);

describe("resumo do que mudou (reaceite)", () => {
  it("toda versão vigente dos Termos e da Política tem resumo", () => {
    expect(CURRENT_VERSIONS).toEqual({ terms: TERMS_VERSION, privacy: PRIVACY_POLICY_VERSION });
    expect(TERMS_CHANGES.map((c) => c.version)).toContain(TERMS_VERSION);
    expect(PRIVACY_CHANGES.map((c) => c.version)).toContain(PRIVACY_POLICY_VERSION);
    for (const change of [...TERMS_CHANGES, ...PRIVACY_CHANGES]) expect(change.summary.length).toBeGreaterThan(0);
  });

  it("changesSince devolve só o que é maior que a versão aceita (tudo se nunca aceitou)", () => {
    expect(changesSince(PRIVACY_CHANGES, null).map((c) => c.version)).toEqual(PRIVACY_CHANGES.map((c) => c.version));
    expect(changesSince(PRIVACY_CHANGES, "0.1").map((c) => c.version)).toEqual(versionsAfter(PRIVACY_CHANGES, "0.1"));
    expect(changesSince(PRIVACY_CHANGES, "0.1").length).toBeGreaterThan(0);
    expect(changesSince(PRIVACY_CHANGES, PRIVACY_POLICY_VERSION)).toEqual([]);
  });

  it("summarizeChanges marca o primeiro aceite quando não há data", () => {
    expect(summarizeChanges({ legalAcceptedAt: null, termsVersion: null, privacyVersion: null }).firstAcceptance).toBe(true);
    const s = summarizeChanges({ legalAcceptedAt: new Date(), termsVersion: "0.2", privacyVersion: "0.2" });
    expect(s.firstAcceptance).toBe(false);
    expect(s.terms.map((c) => c.version)).toEqual(versionsAfter(TERMS_CHANGES, "0.2"));
    expect(s.privacy.map((c) => c.version)).toEqual(versionsAfter(PRIVACY_CHANGES, "0.2"));
  });

  it("a versão da Política no documento é a vigente", () => {
    expect(PRIVACY_POLICY.version).toBe(PRIVACY_POLICY_VERSION);
  });
});

describe("avisos de caráter informativo", () => {
  it("texto único, o combinado", () => {
    expect(INFORMATIONAL_NOTICE).toBe(
      "As informações e análises são geradas automaticamente a partir dos seus lançamentos, têm caráter informativo e não substituem orientação contábil, fiscal ou financeira profissional."
    );
  });

  it("Insights, Assistente e Dashboard usam o mesmo componente (e ninguém repete o texto na mão)", () => {
    for (const file of ["src/app/(app)/insights/page.tsx", "src/app/(app)/assistente/page.tsx", "src/app/(app)/dashboard/page.tsx"]) {
      const source = read(file);
      expect(source, file).toContain("<InformationalNotice />");
      expect(source, file).not.toContain("caráter informativo");
    }
    expect(read("src/components/legal/InformationalNotice.tsx")).toContain("INFORMATIONAL_NOTICE");
  });

  it("discreto: sem cor de status (vermelho, âmbar, verde, azul)", () => {
    const source = read("src/components/legal/InformationalNotice.tsx");
    expect(source).not.toMatch(/(red|amber|yellow|orange|green|emerald|blue|rose)-\d/);
  });
});

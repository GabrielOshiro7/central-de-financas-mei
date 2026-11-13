import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST as postRegister } from "@/app/api/auth/register/route";
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from "@/content/legal/meta";

// Cadastro: aceite dos Termos e da Politica e obrigatorio (validado no SERVIDOR) e grava
// data/hora + as versoes vigentes; usuarios antigos seguem com NULL.
vi.mock("@/lib/auth/cookies", () => ({ createUserSession: async () => new Date() }));

const emails: string[] = [];
const newEmail = () => {
  const email = `aceite-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  emails.push(email);
  return email;
};

const register = (body: Record<string, unknown>) =>
  postRegister(
    new Request("http://test/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
      body: JSON.stringify(body),
    })
  );

const base = (email: string) => ({ name: "Aceite", email, password: "SenhaValida123", confirmPassword: "SenhaValida123" });

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
});

describe("POST /api/auth/register - aceite dos Termos e da Política", () => {
  it.each([[undefined], [false], ["true"], [1], [null]])("acceptTerms = %j é recusado (400) e nada é criado", async (acceptTerms) => {
    const email = newEmail();
    const res = await register({ ...base(email), acceptTerms });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Termos de Serviço e a Política de Privacidade/);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it("com aceite: cria o usuário e grava data/hora e as versões vigentes (do servidor)", async () => {
    const email = newEmail();
    const before = Date.now();
    const res = await register({ ...base(email), acceptTerms: true, termsVersion: "9.9", privacyVersion: "9.9" }); // versões do cliente não valem
    expect(res.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect([user.termsVersion, user.privacyVersion]).toEqual([TERMS_VERSION, PRIVACY_POLICY_VERSION]);
    expect(user.legalAcceptedAt).not.toBeNull();
    expect(user.legalAcceptedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(user.legalAcceptedAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("usuário criado antes da funcionalidade (sem aceite) continua com NULL e é válido", async () => {
    const old = await prisma.user.create({ data: { name: "Antigo", email: newEmail(), passwordHash: "x" } });
    expect([old.legalAcceptedAt, old.termsVersion, old.privacyVersion]).toEqual([null, null, null]);
  });
});

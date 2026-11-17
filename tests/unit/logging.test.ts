import { afterEach, describe, expect, it, vi } from "vitest";
import { describeError, maskEmail } from "@/lib/logging";
import { DevEmailService } from "@/lib/email/devEmailService";

// Logs do servidor sem dados pessoais: e-mail mascarado, nenhum token/link em producao e nenhum
// objeto de erro inteiro (os do Prisma carregam o trecho da consulta e os valores enviados).
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("maskEmail", () => {
  it("mantém só o primeiro caractere e o domínio", () => {
    expect(maskEmail("gabriel@example.com")).toBe("g***@example.com");
    expect(maskEmail("a@b.co")).toBe("a***@b.co");
  });
  it("entrada sem @ não vaza nada", () => {
    expect(maskEmail("sem-arroba")).toBe("***");
    expect(maskEmail("")).toBe("***");
    expect(maskEmail("@dominio.com")).toBe("***");
  });
});

describe("describeError", () => {
  it("erro do Prisma: só nome, código e modelo/campos - NUNCA a mensagem (que pode ter os valores enviados)", () => {
    const error = Object.assign(new Error('Invalid `prisma.client.create()` invocation:\n  data: { name: "Maria Silva", email: "maria@example.com", notes: "alergia a penicilina" }'), {
      name: "PrismaClientKnownRequestError",
      code: "P2002",
      meta: { modelName: "Client", target: ["email"] },
    });
    const text = describeError(error);
    expect(text).toBe("PrismaClientKnownRequestError [P2002] modelo=Client campos=email");
    expect(text).not.toMatch(/Maria|maria@|penicilina|invocation/);
  });

  it("erro do Prisma de validação (sem código): só o nome", () => {
    const error = Object.assign(new Error("Argument `email`: \"maria@example.com\""), { name: "PrismaClientValidationError" });
    expect(describeError(error)).toBe("PrismaClientValidationError");
  });

  it("erro comum: nome e a primeira linha da mensagem, truncada", () => {
    expect(describeError(new Error("banco fora do ar\nsegunda linha"))).toBe("Error: banco fora do ar");
    expect(describeError(new Error("x".repeat(500))).length).toBeLessThan(230);
  });

  it("valor que não é Error", () => {
    expect(describeError(undefined)).toBe("erro desconhecido");
    expect(describeError({ senha: "segredo" })).toBe("erro desconhecido");
  });
});

describe("DevEmailService (log do e-mail de recuperação de senha)", () => {
  const link = "http://localhost:3000/reset-password/TOKEN-SECRETO-123";

  it("fora de produção: e-mail mascarado e o link (para testar o fluxo na mão)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await new DevEmailService().sendPasswordResetEmail("gabriel@example.com", link);
    const line = String(log.mock.calls[0][0]);
    expect(line).toContain("g***@example.com");
    expect(line).not.toContain("gabriel@example.com");
    expect(line).toContain(link);
  });

  it("em produção: e-mail mascarado e NENHUM token/link no log", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await new DevEmailService().sendPasswordResetEmail("gabriel@example.com", link);
    const line = String(log.mock.calls[0][0]);
    expect(line).toContain("g***@example.com");
    expect(line).not.toContain("gabriel@example.com");
    expect(line).not.toContain("TOKEN-SECRETO-123");
    expect(line).not.toContain("reset-password");
    expect(line).toContain("provedor de e-mail real");
  });
});

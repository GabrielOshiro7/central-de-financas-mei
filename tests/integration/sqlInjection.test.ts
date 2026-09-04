import { describe, it, expect } from "vitest";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { prisma } from "@/lib/db";

function makeLoginRequest(email: string, password: string) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

describe("protecao contra SQL injection", () => {
  it("payload malicioso no e-mail de login nao quebra a query nem autentica indevidamente", async () => {
    const response = await loginPOST(
      makeLoginRequest("o'brien' OR '1'='1' --@example.com", "' OR '1'='1")
    );

    // Nunca deve autenticar (200) nem quebrar o servidor (500) com o payload.
    expect(response.status).not.toBe(200);
    expect(response.status).not.toBe(500);

    // A tabela continua intacta e respondendo normalmente.
    const count = await prisma.user.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("payload malicioso na senha de login nao quebra a query nem autentica indevidamente", async () => {
    const response = await loginPOST(
      makeLoginRequest("qualquer@example.com", "x'; DROP TABLE users; --")
    );

    expect(response.status).not.toBe(200);
    expect(response.status).not.toBe(500);

    const count = await prisma.user.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

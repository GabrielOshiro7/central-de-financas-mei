import { describe, it, expect, afterAll } from "vitest";
import { POST as resetPasswordPOST } from "@/app/api/auth/reset-password/route";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { generateResetToken, hashResetToken } from "@/lib/auth/resetToken";

describe("token de redefinicao de senha expirado", () => {
  const email = `reset-token-test-${Date.now()}@example.com`;
  let userId: string;
  let originalPasswordHash: string;

  it("rejeita um token ja expirado e mantem a senha original", async () => {
    originalPasswordHash = await hashPassword("senhaOriginal123");
    const user = await prisma.user.create({
      data: { name: "Teste Reset", email, passwordHash: originalPasswordHash },
    });
    userId = user.id;

    const rawToken = generateResetToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(rawToken),
        expiresAt: new Date(Date.now() - 60_000), // expirado ha 1 minuto
      },
    });

    const request = new Request("http://localhost/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: rawToken,
        password: "senhaNovaValida123",
        confirmPassword: "senhaNovaValida123",
      }),
    });

    const response = await resetPasswordPOST(request);
    expect(response.status).toBe(400);

    const userAfter = await prisma.user.findUnique({ where: { id: userId } });
    expect(userAfter?.passwordHash).toBe(originalPasswordHash);
  });

  afterAll(async () => {
    if (userId) {
      await prisma.passwordResetToken.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
  });
});

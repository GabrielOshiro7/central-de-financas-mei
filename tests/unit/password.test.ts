import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("hash de senha", () => {
  it("nunca armazena a senha em texto puro como hash", async () => {
    const hash = await hashPassword("umaSenhaSegura123");
    expect(hash).not.toBe("umaSenhaSegura123");
    expect(hash.length).toBeGreaterThan(20);
  });

  it("verifica corretamente uma senha correta", async () => {
    const hash = await hashPassword("umaSenhaSegura123");
    expect(await verifyPassword("umaSenhaSegura123", hash)).toBe(true);
  });

  it("rejeita uma senha incorreta", async () => {
    const hash = await hashPassword("umaSenhaSegura123");
    expect(await verifyPassword("outraSenhaQualquer1", hash)).toBe(false);
  });
});

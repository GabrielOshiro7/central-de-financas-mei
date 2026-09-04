import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/auth/rateLimit";

describe("rate limiting", () => {
  it("bloqueia apos exceder o numero de tentativas permitido", () => {
    const key = `test:${Math.random()}`;

    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 5, 60_000).allowed).toBe(true);
    }

    const blocked = rateLimit(key, 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("libera novamente depois que a janela de tempo expira", async () => {
    const key = `test:${Math.random()}`;

    expect(rateLimit(key, 1, 50).allowed).toBe(true);
    expect(rateLimit(key, 1, 50).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(rateLimit(key, 1, 50).allowed).toBe(true);
  });
});

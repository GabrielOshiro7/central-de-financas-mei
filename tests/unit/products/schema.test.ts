import { describe, it, expect } from "vitest";
import { productSchema } from "@/lib/products/schema";

// Agenda A3: servico sem duracao (fluxo por dia); quando informada, 1-720 min.
describe("productSchema - duração do serviço", () => {
  it("aceita SERVICO sem duração", () => {
    const parsed = productSchema("BRL").safeParse({ name: "Corte", type: "SERVICO", defaultPrice: 50 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.durationMinutes).toBeUndefined();
  });

  it.each([1, 30, 720])("aceita duração %i", (durationMinutes) => {
    expect(productSchema("BRL").safeParse({ name: "Corte", type: "SERVICO", durationMinutes }).success).toBe(true);
  });

  it.each([0, -5, 721, 30.5])("recusa duração %s", (durationMinutes) => {
    expect(productSchema("BRL").safeParse({ name: "Corte", type: "SERVICO", durationMinutes }).success).toBe(false);
  });
});

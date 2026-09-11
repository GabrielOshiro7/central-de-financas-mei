import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { isVariationRelevant } from "@/lib/insights/calculations";

const { Decimal } = Prisma;

describe("isVariationRelevant", () => {
  it("retorna false quando a variação é null (sem base de comparação)", () => {
    expect(isVariationRelevant(null, 10)).toBe(false);
  });

  it("retorna false quando o valor absoluto está abaixo do limiar", () => {
    expect(isVariationRelevant(new Decimal(9.99), 10)).toBe(false);
    expect(isVariationRelevant(new Decimal(-9.99), 10)).toBe(false);
  });

  it("retorna true quando o valor absoluto está exatamente no limiar", () => {
    expect(isVariationRelevant(new Decimal(10), 10)).toBe(true);
    expect(isVariationRelevant(new Decimal(-10), 10)).toBe(true);
  });

  it("retorna true quando o valor absoluto está acima do limiar", () => {
    expect(isVariationRelevant(new Decimal(25), 10)).toBe(true);
    expect(isVariationRelevant(new Decimal(-25), 10)).toBe(true);
  });
});

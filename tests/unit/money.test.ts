import { describe, it, expect } from "vitest";
import { formatMoney, isIntegerCurrency } from "@/lib/money";

describe("formatMoney", () => {
  it("JPY não tem casas decimais", () => {
    const formatted = formatMoney(1234, "JPY");
    expect(formatted).not.toContain(".");
    expect(formatted).toContain("1,234");
  });

  it("BRL tem 2 casas decimais", () => {
    expect(formatMoney(1234.5, "BRL")).toContain(".50");
  });

  it("USD tem 2 casas decimais", () => {
    expect(formatMoney(99, "USD")).toContain(".00");
  });
});

describe("isIntegerCurrency", () => {
  it("JPY é a única moeda sem casas decimais", () => {
    expect(isIntegerCurrency("JPY")).toBe(true);
    expect(isIntegerCurrency("BRL")).toBe(false);
    expect(isIntegerCurrency("USD")).toBe(false);
  });
});

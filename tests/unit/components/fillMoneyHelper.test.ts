import { describe, it, expect } from "vitest";
import { moneyDigits } from "../../e2e/helpers/money";
import { valueToDisplay, applyTextChange } from "@/components/MoneyInput";

// O helper dos E2E converte "1500.00" nos digitos que o campo espera. Estes
// testes garantem que helper e componente concordam (roda sem navegador).
describe("moneyDigits (helper dos E2E)", () => {
  it.each([
    ["1500", "BRL", "150000"],
    ["1500.00", "BRL", "150000"],
    ["1500.5", "BRL", "150050"],
    ["0.5", "BRL", "50"],
    ["0", "BRL", "0"],
    ["80", "BRL", "8000"],
    ["10000", "BRL", "1000000"],
    ["2000", "USD", "200000"],
    ["1500", "JPY", "1500"],
    ["-2000.50", "BRL", "-200050"],
  ] as const)("%s (%s) -> %s", (amount, currency, expected) => {
    expect(moneyDigits(amount, currency)).toBe(expected);
  });

  it("rejeita casas decimais que a moeda nao suporta", () => {
    expect(() => moneyDigits("10.505", "BRL")).toThrow();
    expect(() => moneyDigits("10.5", "JPY")).toThrow();
  });

  it("digitos gerados pelo helper viram exatamente o valor pedido no componente", () => {
    const typed = applyTextChange({
      text: moneyDigits("1500.00"),
      previousText: "",
      currency: "BRL",
      allowNegative: false,
    });
    expect(typed?.value).toBe("1500.00");
    expect(valueToDisplay(typed!.value, "BRL")).toBe("1.500,00");

    const negative = applyTextChange({
      text: moneyDigits("-2000"),
      previousText: "",
      currency: "BRL",
      allowNegative: true,
    });
    expect(negative?.value).toBe("-2000.00");
  });
});

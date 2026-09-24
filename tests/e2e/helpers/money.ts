import type { Locator } from "@playwright/test";

// Os campos de dinheiro usam MoneyInput (mascara de centavos): cada digito
// empurra os anteriores, e os 2 ultimos sao sempre centavos (JPY: inteiro
// direto, sem centavos). `fill("1500")` cairia como "15,00", entao os specs
// passam o valor decimal que querem ("1500", "1500.00", "-2000.50") e este
// helper converte para os digitos que o campo espera.
//
// `fill` (e nao `pressSequentially`) de proposito: dispara um unico evento
// `input` com o texto ja formatado, que e exatamente o que o componente
// recalcula a partir dos digitos - determinista e rapido. Sinal "-" so vale
// em campos com allowNegative (Saldo inicial).
export async function fillMoney(
  locator: Locator,
  amount: string,
  { currency = "BRL" }: { currency?: "BRL" | "USD" | "JPY" } = {}
): Promise<void> {
  await locator.fill(moneyDigits(amount, currency));
}

export function moneyDigits(amount: string, currency: "BRL" | "USD" | "JPY" = "BRL"): string {
  const negative = amount.trim().startsWith("-");
  const unsigned = negative ? amount.trim().slice(1) : amount.trim();
  const [intPart, fracPart = ""] = unsigned.split(".");
  const decimals = currency === "JPY" ? 0 : 2;

  if (fracPart.length > decimals && /[1-9]/.test(fracPart.slice(decimals))) {
    throw new Error(`fillMoney: "${amount}" tem mais casas decimais do que ${currency} suporta.`);
  }

  const digits = `${intPart}${fracPart.slice(0, decimals).padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  return `${negative ? "-" : ""}${digits}`;
}

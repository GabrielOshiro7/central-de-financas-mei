import { Prisma, type Currency } from "@prisma/client";

type Decimal = Prisma.Decimal;
const { Decimal } = Prisma;

// JPY nao tem casas decimais (nao existe "meio yen"); BRL e USD tem 2.
// Intl.NumberFormat ja aplica essa regra sozinho a partir do codigo ISO da
// moeda, entao nao precisamos de uma tabela manual para a formatacao.
export function formatMoney(amount: Decimal | number | string, currency: Currency): string {
  const value = amount instanceof Decimal ? amount.toNumber() : Number(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(value);
}

export function isIntegerCurrency(currency: Currency): boolean {
  return currency === "JPY";
}

export function toDecimal(value: Decimal | number | string): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

import { Prisma, type Currency } from "@prisma/client";

type Decimal = Prisma.Decimal;
const { Decimal } = Prisma;

// UNICA funcao de exibicao de dinheiro do app, sempre em pt-BR (ponto de
// milhar, virgula decimal) e com o simbolo simples da moeda: "R$ 1.500,00",
// "¥ 12.000", "-¥ 70.585", "$ 1.500,00" (o espaco e o U+00A0, que nao quebra
// linha). Servidor e navegador produzem exatamente o mesmo texto.
//
// JPY nao tem casas decimais (nao existe "meio yen"); BRL e USD tem 2.
// Intl.NumberFormat ja aplica essa regra sozinho a partir do codigo ISO da
// moeda, entao nao precisamos de uma tabela manual para a formatacao.
// So a EXIBICAO: calculo, arredondamento e armazenamento nao passam por aqui.
const moneyFormatters = new Map<Currency, Intl.NumberFormat>();

export function formatMoney(amount: Decimal | number | string, currency: Currency): string {
  const value = amount instanceof Decimal ? amount.toNumber() : Number(amount);
  let formatter = moneyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency, currencyDisplay: "narrowSymbol" });
    moneyFormatters.set(currency, formatter);
  }
  return formatter.format(value);
}

export function isIntegerCurrency(currency: Currency): boolean {
  return currency === "JPY";
}

export function toDecimal(value: Decimal | number | string): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

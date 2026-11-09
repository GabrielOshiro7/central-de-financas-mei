import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { formatMoney, isIntegerCurrency } from "@/lib/money";

const NBSP = " ";

// formatMoney e a UNICA funcao de exibicao de dinheiro: pt-BR (ponto de milhar,
// virgula decimal) com o simbolo simples da moeda, sempre com o espaco sem
// quebra (U+00A0) entre simbolo e numero.
describe("formatMoney", () => {
  it("JPY: sem casas decimais, ponto de milhar", () => {
    expect(formatMoney(12000, "JPY")).toBe(`¥${NBSP}12.000`);
    expect(formatMoney(110000, "JPY")).toBe(`¥${NBSP}110.000`);
    expect(formatMoney(1234, "JPY")).toBe(`¥${NBSP}1.234`);
    expect(formatMoney(1234567, "JPY")).toBe(`¥${NBSP}1.234.567`);
  });

  it("JPY: nunca mostra fracao (arredonda so na exibicao)", () => {
    expect(formatMoney(123.45, "JPY")).toBe(`¥${NBSP}123`);
    expect(formatMoney(0.5, "JPY")).toBe(`¥${NBSP}1`);
  });

  it("BRL: duas casas, ponto de milhar e virgula decimal", () => {
    expect(formatMoney(1500, "BRL")).toBe(`R$${NBSP}1.500,00`);
    expect(formatMoney(1234.5, "BRL")).toBe(`R$${NBSP}1.234,50`);
    expect(formatMoney(123.45, "BRL")).toBe(`R$${NBSP}123,45`);
    expect(formatMoney(1234567.891, "BRL")).toBe(`R$${NBSP}1.234.567,89`);
    expect(formatMoney(110000, "BRL")).toBe(`R$${NBSP}110.000,00`);
  });

  it("BRL: centavos", () => {
    expect(formatMoney(0.5, "BRL")).toBe(`R$${NBSP}0,50`);
    expect(formatMoney(0.05, "BRL")).toBe(`R$${NBSP}0,05`);
    expect(formatMoney("99.9", "BRL")).toBe(`R$${NBSP}99,90`);
  });

  it("USD: simbolo simples ($), mesmo padrao pt-BR", () => {
    expect(formatMoney(99, "USD")).toBe(`$${NBSP}99,00`);
    expect(formatMoney(1500, "USD")).toBe(`$${NBSP}1.500,00`);
    expect(formatMoney(1234567.891, "USD")).toBe(`$${NBSP}1.234.567,89`);
  });

  it("zero", () => {
    expect(formatMoney(0, "JPY")).toBe(`¥${NBSP}0`);
    expect(formatMoney(0, "BRL")).toBe(`R$${NBSP}0,00`);
    expect(formatMoney(0, "USD")).toBe(`$${NBSP}0,00`);
  });

  it("negativo: sinal antes do simbolo (formato pt-BR do Intl)", () => {
    expect(formatMoney(-70585, "JPY")).toBe(`-¥${NBSP}70.585`);
    expect(formatMoney(-1500.5, "BRL")).toBe(`-R$${NBSP}1.500,50`);
    expect(formatMoney(-70585, "USD")).toBe(`-$${NBSP}70.585,00`);
  });

  it("valores grandes", () => {
    expect(formatMoney(123456789012, "BRL")).toBe(`R$${NBSP}123.456.789.012,00`);
    expect(formatMoney(9999999999, "JPY")).toBe(`¥${NBSP}9.999.999.999`);
  });

  it("aceita Decimal, number e string (mesmo texto)", () => {
    const expected = `R$${NBSP}1.500,75`;
    expect(formatMoney(new Prisma.Decimal("1500.75"), "BRL")).toBe(expected);
    expect(formatMoney(1500.75, "BRL")).toBe(expected);
    expect(formatMoney("1500.75", "BRL")).toBe(expected);
  });

  it("o espaco entre simbolo e numero e o U+00A0 (nao quebra linha) e nao ha espaco comum", () => {
    for (const currency of ["JPY", "BRL", "USD"] as const) {
      const text = formatMoney(1500, currency);
      expect(text).toContain(NBSP);
      expect(text).not.toContain(" ");
    }
  });

  it("nao usa o padrao en-US (virgula de milhar / ponto decimal)", () => {
    expect(formatMoney(1500, "BRL")).not.toMatch(/1,500\.00/);
    expect(formatMoney(110000, "JPY")).not.toContain(",");
  });
});

describe("isIntegerCurrency", () => {
  it("JPY é a única moeda sem casas decimais", () => {
    expect(isIntegerCurrency("JPY")).toBe(true);
    expect(isIntegerCurrency("BRL")).toBe(false);
    expect(isIntegerCurrency("USD")).toBe(false);
  });
});

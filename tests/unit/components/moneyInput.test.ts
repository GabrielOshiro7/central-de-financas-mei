import { describe, it, expect } from "vitest";
import {
  applyTextChange,
  decimalsFor,
  digitsToValue,
  formatDigits,
  maxDigitsFor,
  parsePastedMoney,
  pasteToBuffer,
  symbolFor,
  valueToDigits,
  valueToDisplay,
} from "@/components/MoneyInput";

// Simula uma tecla digitada: o navegador anexa o digito ao texto exibido.
function typeDigit(value: string, digit: string, currency: "BRL" | "USD" | "JPY" | null = "BRL") {
  const previousText = valueToDisplay(value, currency);
  const result = applyTextChange({ text: previousText + digit, previousText, currency, allowNegative: false });
  return result ? result.value : value;
}

function backspace(value: string, currency: "BRL" | "USD" | "JPY" | null = "BRL") {
  const previousText = valueToDisplay(value, currency);
  const result = applyTextChange({ text: previousText.slice(0, -1), previousText, currency, allowNegative: false });
  return result ? result.value : value;
}

describe("moeda: casas, simbolo, limite", () => {
  it("BRL/USD/null = 2 casas; JPY = 0 casas", () => {
    expect(decimalsFor("BRL")).toBe(2);
    expect(decimalsFor("USD")).toBe(2);
    expect(decimalsFor(null)).toBe(2);
    expect(decimalsFor("JPY")).toBe(0);
  });

  it("simbolo por moeda; null = sem simbolo", () => {
    expect(symbolFor("BRL")).toBe("R$");
    expect(symbolFor("USD")).toBe("US$");
    expect(symbolFor("JPY")).toBe("¥");
    expect(symbolFor(null)).toBe("");
  });

  it("limite: 14 digitos com centavos, 12 em JPY (Decimal(14,2))", () => {
    expect(maxDigitsFor("BRL")).toBe(14);
    expect(maxDigitsFor(null)).toBe(14);
    expect(maxDigitsFor("JPY")).toBe(12);
  });
});

describe("valueToDigits - valores de entrada vindos de fora", () => {
  it('"45.9" -> 4590 (exibe 45,90)', () => {
    expect(valueToDigits("45.9", "BRL")).toEqual({ digits: "4590", negative: false });
    expect(valueToDisplay("45.9", "BRL")).toBe("45,90");
  });

  it('"1500" -> 150000 (exibe 1.500,00)', () => {
    expect(valueToDigits("1500", "BRL").digits).toBe("150000");
    expect(valueToDisplay("1500", "BRL")).toBe("1.500,00");
  });

  it('"" -> vazio, sem NaN', () => {
    expect(valueToDigits("", "BRL")).toEqual({ digits: "", negative: false });
    expect(valueToDisplay("", "BRL")).toBe("");
  });

  it('parcela dividida "33.3" -> 33,30', () => {
    expect(valueToDisplay("33.3", "BRL")).toBe("33,30");
  });

  it("3+ casas decimais arredondam meio para cima (sem float)", () => {
    expect(valueToDisplay("10.005", "BRL")).toBe("10,01");
    expect(valueToDisplay("10.004", "BRL")).toBe("10,00");
    expect(valueToDisplay("10.999", "BRL")).toBe("11,00");
    // Sem imprecisao de float: 1.005 * 100 em float da 100.49999...
    expect(valueToDisplay("1.005", "BRL")).toBe("1,01");
  });

  it('"0.00" e "0" viram zero exibido (nao vazio)', () => {
    expect(valueToDisplay("0.00", "BRL")).toBe("0,00");
    expect(valueToDisplay("0", "BRL")).toBe("0,00");
  });

  it("valor negativo de entrada", () => {
    expect(valueToDigits("-500.5", "BRL")).toEqual({ digits: "50050", negative: true });
    expect(valueToDisplay("-500.5", "BRL")).toBe("-500,50");
  });

  it('"-0.00" nunca fica negativo', () => {
    expect(valueToDigits("-0.00", "BRL").negative).toBe(false);
  });

  it("valor muito grande so agrupa por milhar", () => {
    expect(valueToDisplay("999999999999.99", "BRL")).toBe("999.999.999.999,99");
  });

  it("JPY: inteiro direto, sem centavos", () => {
    expect(valueToDigits("1500", "JPY").digits).toBe("1500");
    expect(valueToDisplay("1500", "JPY")).toBe("1.500");
    expect(valueToDisplay("0", "JPY")).toBe("0");
  });

  it("JPY com fracao arredonda (so por seguranca; troca de moeda limpa antes)", () => {
    expect(valueToDisplay("1500.5", "JPY")).toBe("1.501");
    expect(valueToDisplay("1500.4", "JPY")).toBe("1.500");
  });

  it("moeda null = 2 casas, igual a BRL/USD", () => {
    expect(valueToDisplay("12.34", null)).toBe("12,34");
  });

  it("texto que nao e decimal simples nao gera NaN", () => {
    expect(valueToDisplay("abc", "BRL")).toBe("");
    expect(valueToDigits("12abc", "BRL").digits).toBe("12");
  });
});

describe("digitsToValue - o que o componente emite", () => {
  it("emite string decimal limpa, nunca formatada", () => {
    expect(digitsToValue("123450", false, "BRL")).toBe("1234.50");
    expect(digitsToValue("5", false, "BRL")).toBe("0.05");
    expect(digitsToValue("0", false, "BRL")).toBe("0.00");
    expect(digitsToValue("12", false, "USD")).toBe("0.12");
  });

  it('buffer vazio emite ""', () => {
    expect(digitsToValue("", false, "BRL")).toBe("");
    expect(digitsToValue("", true, "BRL")).toBe("");
  });

  it("JPY emite inteiro", () => {
    expect(digitsToValue("1500", false, "JPY")).toBe("1500");
    expect(digitsToValue("0", false, "JPY")).toBe("0");
  });

  it("negativo carrega sinal, mas zero nunca e -0", () => {
    expect(digitsToValue("50050", true, "BRL")).toBe("-500.50");
    expect(digitsToValue("0", true, "BRL")).toBe("0.00");
    expect(digitsToValue("000", true, "BRL")).toBe("0.00");
    expect(digitsToValue("0", true, "JPY")).toBe("0");
  });

  it("ida e volta: valueToDigits -> digitsToValue e estavel", () => {
    for (const v of ["0.01", "1234.50", "999999999999.99", "45.90"]) {
      const { digits, negative } = valueToDigits(v, "BRL");
      expect(digitsToValue(digits, negative, "BRL")).toBe(v);
    }
  });
});

describe("formatDigits - texto exibido (padrao brasileiro)", () => {
  it("separador de milhar com ponto, decimal com virgula", () => {
    expect(formatDigits("123450", false, "BRL")).toBe("1.234,50");
    expect(formatDigits("100000000", false, "BRL")).toBe("1.000.000,00");
  });

  it("USD tambem usa padrao brasileiro", () => {
    expect(formatDigits("123450", false, "USD")).toBe("1.234,50");
  });

  it("JPY: milhar com ponto, sem virgula", () => {
    expect(formatDigits("1234567", false, "JPY")).toBe("1.234.567");
  });

  it('vazio exibe "" (placeholder); vazio + negativo exibe "-"', () => {
    expect(formatDigits("", false, "BRL")).toBe("");
    expect(formatDigits("", true, "BRL")).toBe("-");
  });

  it("negativo", () => {
    expect(formatDigits("123450", true, "BRL")).toBe("-1.234,50");
  });
});

describe("digitacao sequencial (mascara de centavos)", () => {
  it("1,2,3,4,5,0 -> 0,01 / 0,12 / 1,23 / 12,34 / 123,45 / 1.234,50", () => {
    const steps: string[] = [];
    let value = "";
    for (const d of ["1", "2", "3", "4", "5", "0"]) {
      value = typeDigit(value, d);
      steps.push(valueToDisplay(value, "BRL"));
    }
    expect(steps).toEqual(["0,01", "0,12", "1,23", "12,34", "123,45", "1.234,50"]);
    expect(value).toBe("1234.50");
  });

  it("a mesma sequencia em JPY nao cria centavos", () => {
    let value = "";
    const steps: string[] = [];
    for (const d of ["1", "2", "3", "4"]) {
      value = typeDigit(value, d, "JPY");
      steps.push(valueToDisplay(value, "JPY"));
    }
    expect(steps).toEqual(["1", "12", "123", "1.234"]);
    expect(value).toBe("1234");
  });

  it("primeiro digito zero mantem zero exibido; segundo digito nao acumula zeros", () => {
    let value = typeDigit("", "0");
    expect(value).toBe("0.00");
    expect(valueToDisplay(value, "BRL")).toBe("0,00");
    value = typeDigit(value, "0");
    expect(value).toBe("0.00");
    value = typeDigit(value, "5");
    expect(value).toBe("0.05");
  });

  it("zeros a esquerda sao descartados: 0 depois 7 = 0,07", () => {
    let value = typeDigit("", "0");
    value = typeDigit(value, "7");
    expect(value).toBe("0.07");
  });

  it("caracteres nao numericos digitados sao ignorados", () => {
    expect(typeDigit("12.34", "a")).toBe("12.34");
    expect(typeDigit("12.34", ",")).toBe("12.34");
    expect(typeDigit("", " ")).toBe("");
  });

  it("digitos alem do limite sao ignorados (14 digitos = 999.999.999.999,99)", () => {
    let value = "999999999999.99";
    expect(valueToDigits(value, "BRL").digits).toHaveLength(14);
    value = typeDigit(value, "1");
    expect(value).toBe("999999999999.99");
  });

  it("JPY: limite de 12 digitos", () => {
    const value = "999999999999";
    expect(typeDigit(value, "1", "JPY")).toBe("999999999999");
  });

  it("teclas muito rapidas: 20 digitos em sequencia nunca passam do limite nem geram NaN", () => {
    let value = "";
    for (let i = 0; i < 20; i++) value = typeDigit(value, String((i % 9) + 1));
    expect(valueToDigits(value, "BRL").digits.length).toBeLessThanOrEqual(14);
    expect(value).toMatch(/^\d+\.\d{2}$/);
  });
});

describe("backspace", () => {
  it("remove o ultimo digito do buffer: 1.234,50 -> 123,45 -> 12,34", () => {
    let value = "1234.50";
    value = backspace(value);
    expect(valueToDisplay(value, "BRL")).toBe("123,45");
    value = backspace(value);
    expect(valueToDisplay(value, "BRL")).toBe("12,34");
  });

  it("ate esvaziar: 0,01 -> vazio -> continua vazio", () => {
    let value = "0.01";
    value = backspace(value);
    expect(value).toBe("");
    value = backspace(value);
    expect(value).toBe("");
  });

  it("zero digitado + backspace volta para vazio", () => {
    expect(backspace("0.00")).toBe("");
  });

  it("apagar tudo de uma vez (selecionar tudo + delete) emite vazio", () => {
    const result = applyTextChange({ text: "", previousText: "1.234,50", currency: "BRL", allowNegative: false });
    expect(result?.value).toBe("");
  });

  it("JPY", () => {
    expect(backspace("1500", "JPY")).toBe("150");
  });
});

describe("sinal (allowNegative)", () => {
  const change = (text: string, previousText: string, allowNegative = true) =>
    applyTextChange({ text, previousText, currency: "BRL", allowNegative });

  it('digitar "-" alterna para negativo (campo com valor)', () => {
    expect(change("-1.234,50", "1.234,50")?.value).toBe("-1234.50");
  });

  it('digitar "-" com o campo negativo alterna de volta para positivo', () => {
    expect(change("-1.234,50-", "-1.234,50")?.value).toBe("1234.50");
  });

  it("apagar o hifen deixa positivo", () => {
    expect(change("1.234,50", "-1.234,50")?.value).toBe("1234.50");
  });

  it('"-" com campo vazio: nada a emitir ainda, mas o sinal fica pendente', () => {
    const result = change("-", "");
    expect(result).toEqual({ value: "", digits: "", negative: true });
  });

  it('pendente + digito: "-" seguido de 5 = -0,05', () => {
    expect(change("-5", "-")?.value).toBe("-0.05");
  });

  it("nunca emite -0: negativo com zero vira 0.00", () => {
    expect(change("-0", "-")?.value).toBe("0.00");
    expect(change("-0,00", "-0,0")?.value).toBe("0.00");
  });

  it("sem allowNegative o hifen e ignorado", () => {
    expect(change("-1.234,50", "1.234,50", false)?.value).toBe("1234.50");
  });

  it("negativo respeita o limite de digitos", () => {
    expect(change("-9.999.999.999.999,991", "-9.999.999.999.999,99")).toBeNull();
  });
});

describe("parsePastedMoney - reconhece o numero colado", () => {
  it.each([
    ["1500", "1500"],
    ["1500.00", "1500.00"],
    ["1.500,00", "1500.00"],
    ["R$ 1.234,56", "1234.56"],
    ["R$1.234,56", "1234.56"],
    ["1,500.00", "1500.00"],
    ["1.234.567,89", "1234567.89"],
    ["1.234.567", "1234567"],
    ["1500,5", "1500.5"],
    ["1500.5", "1500.5"],
    ["0,50", "0.50"],
    [",50", "0.50"],
    ["0.500", "0.500"],
    ["10.5", "10.5"],
    ["1.500", "1500"],
    ["US$ 1,234.56", "1234.56"],
    ["¥ 1.500", "1500"],
    ["  R$ 45,90  ", "45.90"],
    ["R$ 1.234,56", "1234.56"],
    ["-50,5", "-50.5"],
    ["−50", "-50"],
  ])("%j -> %j", (input, expected) => {
    expect(parsePastedMoney(input)).toBe(expected);
  });

  it.each(["abc", "", "R$", "1.2.3,4,5", "12abc34", "1,23,456", "..", "1.5.5"])(
    "nao reconhecivel: %j -> null",
    (input) => {
      expect(parsePastedMoney(input)).toBeNull();
    }
  );
});

describe("pasteToBuffer - reconstroi o buffer inteiro", () => {
  const paste = (text: string, currency: "BRL" | "USD" | "JPY" | null = "BRL", allowNegative = false) =>
    pasteToBuffer({ text, currency, allowNegative });

  it("formatos reconhecidos viram o valor que representam", () => {
    expect(paste("1500")?.value).toBe("1500.00");
    expect(paste("1500.00")?.value).toBe("1500.00");
    expect(paste("1.500,00")?.value).toBe("1500.00");
    expect(paste("R$ 1.234,56")?.value).toBe("1234.56");
    expect(paste("0,5")?.value).toBe("0.50");
  });

  it("exibe o valor colado ja formatado", () => {
    const result = paste("R$ 1.234,56");
    expect(formatDigits(result!.digits, result!.negative, "BRL")).toBe("1.234,56");
  });

  it("JPY: 1500 colado = 1.500 (nao 15)", () => {
    expect(paste("1500", "JPY")?.value).toBe("1500");
    expect(paste("R$ 1.234,56", "JPY")?.value).toBe("1235");
  });

  it("fallback: texto nao reconhecivel extrai so os digitos brutos", () => {
    expect(paste("abc123def")?.value).toBe("1.23");
    expect(paste("12abc34")?.value).toBe("12.34");
    expect(paste("R$ 12x,3-4")?.value).toBe("12.34");
  });

  it("sem digitos -> null (nada e alterado)", () => {
    expect(paste("abc")).toBeNull();
    expect(paste("")).toBeNull();
    expect(paste("R$")).toBeNull();
  });

  it("acima do limite de digitos -> null", () => {
    expect(paste("9999999999999.99")).toBeNull();
    expect(paste("1234567890123", "JPY")).toBeNull();
  });

  it("negativo so com allowNegative", () => {
    expect(paste("-50,5", "BRL", true)?.value).toBe("-50.50");
    expect(paste("-50,5", "BRL", false)?.value).toBe("50.50");
  });

  it("zero colado vale zero exibido", () => {
    expect(paste("0")?.value).toBe("0.00");
    expect(paste("0,00")?.value).toBe("0.00");
  });
});

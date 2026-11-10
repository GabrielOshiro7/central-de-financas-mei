import { describe, it, expect } from "vitest";
import {
  buildMonthlyInstallments,
  installmentsMatchTotal,
  monthlyDueDates,
  rebaseMonthlyDates,
  splitEqualAmounts,
} from "@/lib/installments/monthly";

// Parcelas mensais do agendamento: mesmo dia do mes da primeira (ultimo dia do
// mes quando ele nao existe), sempre a partir do dia ORIGINAL; divisao em
// unidades minimas da moeda com a sobra na ultima.
describe("monthlyDueDates", () => {
  it("dia 25 -> 25 em todos os meses; dia 15 -> 15", () => {
    expect(monthlyDueDates("2026-10-25", 4)).toEqual(["2026-10-25", "2026-11-25", "2026-12-25", "2027-01-25"]);
    expect(monthlyDueDates("2026-03-15", 3)).toEqual(["2026-03-15", "2026-04-15", "2026-05-15"]);
  });

  it("dia 31 em ano comum: 31/01 -> 28/02 -> 31/03 -> 30/04 (volta ao 31, sem encadear)", () => {
    expect(monthlyDueDates("2027-01-31", 5)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31"]);
  });

  it("dia 31 em ano bissexto: fevereiro tem 29", () => {
    expect(monthlyDueDates("2028-01-31", 3)).toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]);
  });

  it("dias 29 e 30 também caem no último dia de fevereiro e voltam", () => {
    expect(monthlyDueDates("2027-01-30", 3)).toEqual(["2027-01-30", "2027-02-28", "2027-03-30"]);
    expect(monthlyDueDates("2027-01-29", 3)).toEqual(["2027-01-29", "2027-02-28", "2027-03-29"]);
    expect(monthlyDueDates("2028-01-29", 2)).toEqual(["2028-01-29", "2028-02-29"]);
  });

  it("virada de ano", () => {
    expect(monthlyDueDates("2026-11-30", 4)).toEqual(["2026-11-30", "2026-12-30", "2027-01-30", "2027-02-28"]);
    expect(monthlyDueDates("2026-12-31", 2)).toEqual(["2026-12-31", "2027-01-31"]);
  });

  it("uma parcela é a própria data; contagem inválida vira 1", () => {
    expect(monthlyDueDates("2026-10-20", 1)).toEqual(["2026-10-20"]);
    expect(monthlyDueDates("2026-10-20", 0)).toEqual(["2026-10-20"]);
  });
});

describe("splitEqualAmounts", () => {
  it("JPY 12.000 / 7: seis de 1.714 e a última com a sobra (1.716); soma exata", () => {
    const amounts = splitEqualAmounts(12000, 7, 0);
    expect(amounts).toEqual(["1714", "1714", "1714", "1714", "1714", "1714", "1716"]);
    expect(amounts.reduce((t, a) => t + Number(a), 0)).toBe(12000);
  });

  it("BRL 100,00 / 3: 33,33 / 33,33 / 33,34", () => {
    expect(splitEqualAmounts(100, 3, 2)).toEqual(["33.33", "33.33", "33.34"]);
  });

  it("arredonda para BAIXO (a sobra é sempre da última, nunca negativa): BRL 10,00 / 6", () => {
    const amounts = splitEqualAmounts(10, 6, 2);
    expect(amounts).toEqual(["1.66", "1.66", "1.66", "1.66", "1.66", "1.7"]);
    expect(Math.round(amounts.reduce((t, a) => t + Number(a) * 100, 0))).toBe(1000);
  });

  it("divisão exata, uma parcela e total fracionado em ponto flutuante (0,1 + 0,2)", () => {
    expect(splitEqualAmounts(300, 3, 2)).toEqual(["100", "100", "100"]);
    expect(splitEqualAmounts(80, 1, 0)).toEqual(["80"]);
    expect(splitEqualAmounts(0.1 + 0.2, 2, 2)).toEqual(["0.15", "0.15"]);
  });

  it("a soma em centavos é sempre o total, para vários totais e contagens", () => {
    for (const total of [1, 99.99, 1234.56, 100000.01]) {
      for (const count of [1, 2, 3, 7, 12, 60]) {
        const sum = splitEqualAmounts(total, count, 2).reduce((t, a) => t + Math.round(Number(a) * 100), 0);
        expect(sum).toBe(Math.round(total * 100));
      }
    }
  });
});

describe("buildMonthlyInstallments / rebase / match", () => {
  it("gera datas mensais e valores juntos", () => {
    expect(buildMonthlyInstallments(100, 3, "2027-01-31", 2)).toEqual([
      { dueDateInput: "2027-01-31", amount: "33.33" },
      { dueDateInput: "2027-02-28", amount: "33.33" },
      { dueDateInput: "2027-03-31", amount: "33.34" },
    ]);
  });

  it("rebase troca só as datas (valores editados ficam)", () => {
    const rows = [
      { dueDateInput: "2026-10-31", amount: "10" },
      { dueDateInput: "2026-11-30", amount: "55" },
      { dueDateInput: "2026-12-31", amount: "35" },
    ];
    expect(rebaseMonthlyDates(rows, "2026-10-15")).toEqual([
      { dueDateInput: "2026-10-15", amount: "10" },
      { dueDateInput: "2026-11-15", amount: "55" },
      { dueDateInput: "2026-12-15", amount: "35" },
    ]);
  });

  it("installmentsMatchTotal compara em unidades mínimas e recusa valor vazio", () => {
    expect(installmentsMatchTotal([{ dueDateInput: "2026-10-01", amount: "33.33" }, { dueDateInput: "2026-11-01", amount: "66.67" }], 100, 2)).toBe(true);
    expect(installmentsMatchTotal([{ dueDateInput: "2026-10-01", amount: "" }], 100, 2)).toBe(false);
    expect(installmentsMatchTotal([{ dueDateInput: "2026-10-01", amount: "99" }], 100, 2)).toBe(false);
  });
});

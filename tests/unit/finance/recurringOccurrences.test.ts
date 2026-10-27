import { describe, it, expect } from "vitest";
import {
  firstOccurrence,
  nextOccurrence,
  generateOccurrences,
  type RecurrenceRule,
} from "@/lib/finance/recurring/occurrences";
import { addDays, parseDateKey, weekdayOf } from "@/lib/time/zoned";

describe("firstOccurrence - regra de primeira ocorrência relativa ao startDate", () => {
  describe("MONTHLY", () => {
    const rule: RecurrenceRule = { frequency: "MONTHLY", dayOfMonth: 10 };

    it("dia configurado ainda não passou no mês do startDate -> ocorre nesse mesmo mês", () => {
      expect(firstOccurrence(rule, "2026-03-03")).toEqual("2026-03-10");
    });

    it("startDate cai exatamente no dia configurado -> primeira ocorrência é o próprio dia", () => {
      expect(firstOccurrence(rule, "2026-03-10")).toEqual("2026-03-10");
    });

    it("dia configurado já passou no mês do startDate -> avança para o mês seguinte", () => {
      expect(firstOccurrence(rule, "2026-03-15")).toEqual("2026-04-10");
    });

    it("dezembro -> janeiro do ano seguinte (virada de ano)", () => {
      expect(firstOccurrence(rule, "2026-12-15")).toEqual("2027-01-10");
    });
  });

  describe("WEEKLY", () => {
    const rule: RecurrenceRule = { frequency: "WEEKLY", dayOfWeek: 3 }; // quarta-feira

    it("dia da semana ainda não passou -> ocorre nessa mesma semana", () => {
      // 15/mar/2026 é domingo; a próxima quarta é 18/mar/2026.
      expect(firstOccurrence(rule, "2026-03-15")).toEqual("2026-03-18");
    });

    it("startDate cai exatamente no dia da semana configurado -> primeira ocorrência é o próprio dia", () => {
      expect(firstOccurrence(rule, "2026-03-18")).toEqual("2026-03-18");
    });

    it("dia da semana já passou na semana do startDate -> avança para a semana seguinte", () => {
      // 19/mar/2026 é quinta - a quarta (18) já passou, entao a proxima e 25/mar/2026.
      expect(firstOccurrence(rule, "2026-03-19")).toEqual("2026-03-25");
    });
  });

  describe("YEARLY", () => {
    const rule: RecurrenceRule = { frequency: "YEARLY", yearMonth: 5, dayOfMonth: 15 }; // 15/junho

    it("data configurada ainda não passou no ano do startDate -> ocorre nesse mesmo ano", () => {
      expect(firstOccurrence(rule, "2026-01-01")).toEqual("2026-06-15");
    });

    it("startDate cai exatamente na data configurada -> primeira ocorrência é o próprio dia", () => {
      expect(firstOccurrence(rule, "2026-06-15")).toEqual("2026-06-15");
    });

    it("data configurada já passou no ano do startDate -> avança para o ano seguinte", () => {
      expect(firstOccurrence(rule, "2026-07-01")).toEqual("2027-06-15");
    });
  });
});

describe("MONTHLY - clamp de dayOfMonth pro último dia do mês (29/30/31)", () => {
  const rule: RecurrenceRule = { frequency: "MONTHLY", dayOfMonth: 31 };

  it("janeiro (31 dias) não precisa de clamp", () => {
    expect(firstOccurrence(rule, "2026-01-01")).toEqual("2026-01-31");
  });

  it("fevereiro comum (2026, 28 dias) -> clampa pro dia 28", () => {
    const jan31 = "2026-01-31";
    expect(nextOccurrence(rule, jan31)).toEqual("2026-02-28");
  });

  it("fevereiro bissexto (2028, 29 dias) -> clampa pro dia 29", () => {
    const jan31 = "2028-01-31";
    expect(nextOccurrence(rule, jan31)).toEqual("2028-02-29");
  });

  it("mês de 30 dias (abril) -> clampa pro dia 30", () => {
    const mar31 = "2026-03-31";
    expect(nextOccurrence(rule, mar31)).toEqual("2026-04-30");
  });

  it("depois do clamp, o mês seguinte com 31 dias volta a usar o dia 31 (não fica preso em 28/30)", () => {
    const feb28 = "2026-02-28";
    expect(nextOccurrence(rule, feb28)).toEqual("2026-03-31");
  });
});

describe("YEARLY - 29 de fevereiro (distinto da normalização de period.ts)", () => {
  const rule: RecurrenceRule = { frequency: "YEARLY", yearMonth: 1, dayOfMonth: 29 }; // 29/fevereiro

  it("ano bissexto -> gera exatamente em 29/fevereiro", () => {
    expect(firstOccurrence(rule, "2028-01-01")).toEqual("2028-02-29");
  });

  it("ano não bissexto -> gera em 28/fevereiro, NUNCA rola para março", () => {
    const result = firstOccurrence(rule, "2027-01-01");
    expect(result).toEqual("2027-02-28");
    expect(parseDateKey(result).month).toBe(2); // continua em fevereiro (mes 2), nao mes 3 (marco)
  });

  it("sequência plurianual alterna corretamente entre 29/fev (bissexto) e 28/fev (comum), sem nunca cair em março", () => {
    const y2028 = firstOccurrence(rule, "2028-01-01");
    expect(y2028).toEqual("2028-02-29");

    const y2029 = nextOccurrence(rule, y2028);
    expect(y2029).toEqual("2029-02-28");
    expect(parseDateKey(y2029).month).toBe(2);

    const y2030 = nextOccurrence(rule, y2029);
    expect(y2030).toEqual("2030-02-28");
    expect(parseDateKey(y2030).month).toBe(2);

    const y2031 = nextOccurrence(rule, y2030);
    expect(y2031).toEqual("2031-02-28");
    expect(parseDateKey(y2031).month).toBe(2);

    const y2032 = nextOccurrence(rule, y2031); // 2032 é bissexto de novo
    expect(y2032).toEqual("2032-02-29");
  });
});

describe("generateOccurrences", () => {
  it("respeita endDate (inclusive): para a partir da ocorrência seguinte a ela", () => {
    const rule: RecurrenceRule = { frequency: "MONTHLY", dayOfMonth: 1 };
    const dates = generateOccurrences({
      rule,
      startDate: "2026-01-01",
      uptoDate: "2026-12-31",
      endDate: "2026-03-01",
    });
    expect(dates).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });

  it("nunca gera além de uptoDate, mesmo com endDate no futuro distante", () => {
    const rule: RecurrenceRule = { frequency: "MONTHLY", dayOfMonth: 1 };
    const dates = generateOccurrences({
      rule,
      startDate: "2026-01-01",
      uptoDate: "2026-03-15",
      endDate: "2030-01-01",
    });
    expect(dates).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });

  it("sem nenhuma ocorrência dentro do intervalo, retorna lista vazia", () => {
    const rule: RecurrenceRule = { frequency: "MONTHLY", dayOfMonth: 1 };
    const dates = generateOccurrences({
      rule,
      startDate: "2026-06-01",
      uptoDate: "2026-04-30", // uptoDate antes do startDate
    });
    expect(dates).toEqual([]);
  });

  it("WEEKLY: histórico longo (104 semanas) gera a contagem e o espaçamento corretos", () => {
    const rule: RecurrenceRule = { frequency: "WEEKLY", dayOfWeek: 1 }; // segunda-feira
    const startDate = "2026-01-05"; // uma segunda-feira
    const uptoDate = addDays(startDate, 104 * 7);

    const start = performance.now();
    const dates = generateOccurrences({ rule, startDate, uptoDate });
    const elapsedMs = performance.now() - start;

    expect(dates).toHaveLength(105); // 104 intervalos completos + a primeira ocorrência
    expect(dates[0]).toEqual(startDate);
    expect(dates[dates.length - 1]).toEqual(uptoDate);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBe(addDays(dates[i - 1], 7));
      expect(weekdayOf(dates[i])).toBe(1);
    }
    expect(elapsedMs).toBeLessThan(500);
  });
});

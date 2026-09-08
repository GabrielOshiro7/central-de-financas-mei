import { describe, it, expect } from "vitest";
import {
  firstOccurrence,
  nextOccurrence,
  generateOccurrences,
  type RecurrenceRule,
} from "@/lib/finance/recurring/occurrences";

describe("firstOccurrence - regra de primeira ocorrência relativa ao startDate", () => {
  describe("MONTHLY", () => {
    const rule: RecurrenceRule = { frequency: "MONTHLY", dayOfMonth: 10 };

    it("dia configurado ainda não passou no mês do startDate -> ocorre nesse mesmo mês", () => {
      expect(firstOccurrence(rule, new Date(2026, 2, 3))).toEqual(new Date(2026, 2, 10));
    });

    it("startDate cai exatamente no dia configurado -> primeira ocorrência é o próprio dia", () => {
      expect(firstOccurrence(rule, new Date(2026, 2, 10))).toEqual(new Date(2026, 2, 10));
    });

    it("dia configurado já passou no mês do startDate -> avança para o mês seguinte", () => {
      expect(firstOccurrence(rule, new Date(2026, 2, 15))).toEqual(new Date(2026, 3, 10));
    });

    it("dezembro -> janeiro do ano seguinte (virada de ano)", () => {
      expect(firstOccurrence(rule, new Date(2026, 11, 15))).toEqual(new Date(2027, 0, 10));
    });
  });

  describe("WEEKLY", () => {
    const rule: RecurrenceRule = { frequency: "WEEKLY", dayOfWeek: 3 }; // quarta-feira

    it("dia da semana ainda não passou -> ocorre nessa mesma semana", () => {
      // 15/mar/2026 é domingo; a próxima quarta é 18/mar/2026.
      expect(firstOccurrence(rule, new Date(2026, 2, 15))).toEqual(new Date(2026, 2, 18));
    });

    it("startDate cai exatamente no dia da semana configurado -> primeira ocorrência é o próprio dia", () => {
      expect(firstOccurrence(rule, new Date(2026, 2, 18))).toEqual(new Date(2026, 2, 18));
    });

    it("dia da semana já passou na semana do startDate -> avança para a semana seguinte", () => {
      // 19/mar/2026 é quinta - a quarta (18) já passou, entao a proxima e 25/mar/2026.
      expect(firstOccurrence(rule, new Date(2026, 2, 19))).toEqual(new Date(2026, 2, 25));
    });
  });

  describe("YEARLY", () => {
    const rule: RecurrenceRule = { frequency: "YEARLY", yearMonth: 5, dayOfMonth: 15 }; // 15/junho

    it("data configurada ainda não passou no ano do startDate -> ocorre nesse mesmo ano", () => {
      expect(firstOccurrence(rule, new Date(2026, 0, 1))).toEqual(new Date(2026, 5, 15));
    });

    it("startDate cai exatamente na data configurada -> primeira ocorrência é o próprio dia", () => {
      expect(firstOccurrence(rule, new Date(2026, 5, 15))).toEqual(new Date(2026, 5, 15));
    });

    it("data configurada já passou no ano do startDate -> avança para o ano seguinte", () => {
      expect(firstOccurrence(rule, new Date(2026, 6, 1))).toEqual(new Date(2027, 5, 15));
    });
  });
});

describe("MONTHLY - clamp de dayOfMonth pro último dia do mês (29/30/31)", () => {
  const rule: RecurrenceRule = { frequency: "MONTHLY", dayOfMonth: 31 };

  it("janeiro (31 dias) não precisa de clamp", () => {
    expect(firstOccurrence(rule, new Date(2026, 0, 1))).toEqual(new Date(2026, 0, 31));
  });

  it("fevereiro comum (2026, 28 dias) -> clampa pro dia 28", () => {
    const jan31 = new Date(2026, 0, 31);
    expect(nextOccurrence(rule, jan31)).toEqual(new Date(2026, 1, 28));
  });

  it("fevereiro bissexto (2028, 29 dias) -> clampa pro dia 29", () => {
    const jan31 = new Date(2028, 0, 31);
    expect(nextOccurrence(rule, jan31)).toEqual(new Date(2028, 1, 29));
  });

  it("mês de 30 dias (abril) -> clampa pro dia 30", () => {
    const mar31 = new Date(2026, 2, 31);
    expect(nextOccurrence(rule, mar31)).toEqual(new Date(2026, 3, 30));
  });

  it("depois do clamp, o mês seguinte com 31 dias volta a usar o dia 31 (não fica preso em 28/30)", () => {
    const feb28 = new Date(2026, 1, 28);
    expect(nextOccurrence(rule, feb28)).toEqual(new Date(2026, 2, 31));
  });
});

describe("YEARLY - 29 de fevereiro (distinto da normalização de period.ts)", () => {
  const rule: RecurrenceRule = { frequency: "YEARLY", yearMonth: 1, dayOfMonth: 29 }; // 29/fevereiro

  it("ano bissexto -> gera exatamente em 29/fevereiro", () => {
    expect(firstOccurrence(rule, new Date(2028, 0, 1))).toEqual(new Date(2028, 1, 29));
  });

  it("ano não bissexto -> gera em 28/fevereiro, NUNCA rola para março", () => {
    const result = firstOccurrence(rule, new Date(2027, 0, 1));
    expect(result).toEqual(new Date(2027, 1, 28));
    expect(result.getMonth()).toBe(1); // continua em fevereiro (mes 1), nao mes 2 (marco)
  });

  it("sequência plurianual alterna corretamente entre 29/fev (bissexto) e 28/fev (comum), sem nunca cair em março", () => {
    const y2028 = firstOccurrence(rule, new Date(2028, 0, 1));
    expect(y2028).toEqual(new Date(2028, 1, 29));

    const y2029 = nextOccurrence(rule, y2028);
    expect(y2029).toEqual(new Date(2029, 1, 28));
    expect(y2029.getMonth()).toBe(1);

    const y2030 = nextOccurrence(rule, y2029);
    expect(y2030).toEqual(new Date(2030, 1, 28));
    expect(y2030.getMonth()).toBe(1);

    const y2031 = nextOccurrence(rule, y2030);
    expect(y2031).toEqual(new Date(2031, 1, 28));
    expect(y2031.getMonth()).toBe(1);

    const y2032 = nextOccurrence(rule, y2031); // 2032 é bissexto de novo
    expect(y2032).toEqual(new Date(2032, 1, 29));
  });
});

describe("generateOccurrences", () => {
  it("respeita endDate (inclusive): para a partir da ocorrência seguinte a ela", () => {
    const rule: RecurrenceRule = { frequency: "MONTHLY", dayOfMonth: 1 };
    const dates = generateOccurrences({
      rule,
      startDate: new Date(2026, 0, 1),
      uptoDate: new Date(2026, 11, 31),
      endDate: new Date(2026, 2, 1),
    });
    expect(dates).toEqual([new Date(2026, 0, 1), new Date(2026, 1, 1), new Date(2026, 2, 1)]);
  });

  it("nunca gera além de uptoDate, mesmo com endDate no futuro distante", () => {
    const rule: RecurrenceRule = { frequency: "MONTHLY", dayOfMonth: 1 };
    const dates = generateOccurrences({
      rule,
      startDate: new Date(2026, 0, 1),
      uptoDate: new Date(2026, 2, 15),
      endDate: new Date(2030, 0, 1),
    });
    expect(dates).toEqual([new Date(2026, 0, 1), new Date(2026, 1, 1), new Date(2026, 2, 1)]);
  });

  it("sem nenhuma ocorrência dentro do intervalo, retorna lista vazia", () => {
    const rule: RecurrenceRule = { frequency: "MONTHLY", dayOfMonth: 1 };
    const dates = generateOccurrences({
      rule,
      startDate: new Date(2026, 5, 1),
      uptoDate: new Date(2026, 3, 30), // uptoDate antes do startDate
    });
    expect(dates).toEqual([]);
  });

  it("WEEKLY: histórico longo (104 semanas) gera a contagem e o espaçamento corretos", () => {
    const rule: RecurrenceRule = { frequency: "WEEKLY", dayOfWeek: 1 }; // segunda-feira
    const startDate = new Date(2026, 0, 5); // uma segunda-feira
    const uptoDate = new Date(startDate);
    uptoDate.setDate(uptoDate.getDate() + 104 * 7);

    const start = performance.now();
    const dates = generateOccurrences({ rule, startDate, uptoDate });
    const elapsedMs = performance.now() - start;

    expect(dates).toHaveLength(105); // 104 intervalos completos + a primeira ocorrência
    expect(dates[0]).toEqual(startDate);
    expect(dates[dates.length - 1]).toEqual(uptoDate);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i].getTime() - dates[i - 1].getTime()).toBe(7 * 24 * 60 * 60 * 1000);
      expect(dates[i].getDay()).toBe(1);
    }
    expect(elapsedMs).toBeLessThan(500);
  });
});

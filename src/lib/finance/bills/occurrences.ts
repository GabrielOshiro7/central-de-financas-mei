import type { RecurringBillFrequency } from "@prisma/client";
import { firstOccurrence, nextOccurrence, type RecurrenceRule } from "@/lib/finance/recurring/occurrences";
import { compareKeys, toDateKey, type TimeZone } from "@/lib/time/zoned";

// Reaproveita INTEGRALMENTE o motor puro de datas de
// src/lib/finance/recurring/occurrences.ts (firstOccurrence/nextOccurrence,
// que ja tratam clamp de dia 29/30/31 e a regra de primeira ocorrencia) -
// este arquivo so mapeia RecurringBillFrequency para uma regra BASE
// (WEEKLY/MONTHLY/YEARLY) mais um "step" (numero de ocorrencias da base a
// avancar por vez). Nao existe um segundo calculo de calendario aqui (ver
// ADENDO da Etapa 5, item 3): BIWEEKLY = WEEKLY a cada 2 ocorrencias,
// QUARTERLY = MONTHLY a cada 3, SEMIANNUAL = MONTHLY a cada 6.
export type RecurringBillLike = {
  frequency: RecurringBillFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  yearMonth: number | null;
  startDate: Date;
  endDate: Date | null;
};

function toBaseRuleAndStep(entry: RecurringBillLike): { base: RecurrenceRule; step: number } {
  switch (entry.frequency) {
    case "WEEKLY":
      if (entry.dayOfWeek === null) throw new Error("dayOfWeek é obrigatório para frequência semanal.");
      return { base: { frequency: "WEEKLY", dayOfWeek: entry.dayOfWeek }, step: 1 };
    case "BIWEEKLY":
      if (entry.dayOfWeek === null) throw new Error("dayOfWeek é obrigatório para frequência quinzenal.");
      return { base: { frequency: "WEEKLY", dayOfWeek: entry.dayOfWeek }, step: 2 };
    case "MONTHLY":
      if (entry.dayOfMonth === null) throw new Error("dayOfMonth é obrigatório para frequência mensal.");
      return { base: { frequency: "MONTHLY", dayOfMonth: entry.dayOfMonth }, step: 1 };
    case "QUARTERLY":
      if (entry.dayOfMonth === null) throw new Error("dayOfMonth é obrigatório para frequência trimestral.");
      return { base: { frequency: "MONTHLY", dayOfMonth: entry.dayOfMonth }, step: 3 };
    case "SEMIANNUAL":
      if (entry.dayOfMonth === null) throw new Error("dayOfMonth é obrigatório para frequência semestral.");
      return { base: { frequency: "MONTHLY", dayOfMonth: entry.dayOfMonth }, step: 6 };
    case "YEARLY":
      if (entry.yearMonth === null || entry.dayOfMonth === null) {
        throw new Error("yearMonth e dayOfMonth são obrigatórios para frequência anual.");
      }
      return { base: { frequency: "YEARLY", yearMonth: entry.yearMonth, dayOfMonth: entry.dayOfMonth }, step: 1 };
    default: {
      const exhaustiveCheck: never = entry.frequency;
      throw new Error(`Frequência não tratada: ${exhaustiveCheck}`);
    }
  }
}

// Aplica nextOccurrence da regra base `step` vezes seguidas - e assim que
// BIWEEKLY/QUARTERLY/SEMIANNUAL "pulam" ocorrencias da base sem duplicar a
// aritmetica de datas (cada chamada individual continua sendo a mesma funcao
// pura ja testada em recurringOccurrences.test.ts).
function advanceBySteps(base: RecurrenceRule, from: Date, step: number): Date {
  let current = from;
  for (let i = 0; i < step; i += 1) {
    current = nextOccurrence(base, current);
  }
  return current;
}

// Mesma forma de generateOccurrences (recurring/occurrences.ts): todas as
// datas entre a primeira ocorrencia valida e `uptoDate` (inclusive),
// respeitando endDate. Pura - quem materializa (bills/materialize.ts) e que
// transforma essas datas em Bill reais. O LIMITE (uptoDate/endDate) e
// comparado por dia de calendario no fuso da empresa (Etapa F3b); as datas
// das ocorrencias em si ainda vem do motor de recurring/occurrences.ts, que
// passa a operar em datas de calendario na F5.
export function generateBillOccurrences(entry: RecurringBillLike, uptoDate: Date, timeZone: TimeZone): Date[] {
  const { base, step } = toBaseRuleAndStep(entry);

  const upto = toDateKey(uptoDate, timeZone);
  const cappedEnd = entry.endDate ? toDateKey(entry.endDate, timeZone) : null;
  const effectiveEnd = cappedEnd && compareKeys(cappedEnd, upto) < 0 ? cappedEnd : upto;

  const dates: Date[] = [];
  let current: Date | null = firstOccurrence(base, entry.startDate);
  while (current !== null && compareKeys(toDateKey(current, timeZone), effectiveEnd) <= 0) {
    dates.push(current);
    current = advanceBySteps(base, current, step);
  }
  return dates;
}

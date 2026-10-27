import type { RecurrenceFrequency } from "@prisma/client";
import {
  addDays,
  compareKeys,
  lastDayOfMonth,
  parseDateKey,
  toDateKey,
  weekdayOf,
  type DateKey,
  type TimeZone,
} from "@/lib/time/zoned";

// Motor de ocorrencias (Etapa F5): opera SO em dias de calendario (DateKey,
// "YYYY-MM-DD"), sem instante e sem fuso - aritmetica pura de calendario via
// src/lib/time/zoned.ts. O fuso so entra na borda (generateOccurrencesForEntry):
// startDate/endDate/"ate quando" gravados como instantes viram o dia de
// calendario no fuso da EMPRESA. Assim a mesma regra gera exatamente os
// mesmos dias com o processo em qualquer TZ - a causa das duplicatas da
// Academia Gabriel (servidor em UTC gerando "meia-noite" em outro instante).

export type RecurrenceRule =
  | { frequency: "WEEKLY"; dayOfWeek: number } // 0=domingo..6=sabado
  | { frequency: "MONTHLY"; dayOfMonth: number } // 1-31
  | { frequency: "YEARLY"; yearMonth: number; dayOfMonth: number }; // yearMonth: 0=jan..11=dez

export type RecurringEntryLike = {
  frequency: RecurrenceFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  yearMonth: number | null;
  startDate: Date;
  endDate: Date | null;
};

export function toRecurrenceRule(entry: RecurringEntryLike): RecurrenceRule {
  switch (entry.frequency) {
    case "WEEKLY":
      if (entry.dayOfWeek === null) {
        throw new Error("dayOfWeek é obrigatório para frequência WEEKLY.");
      }
      return { frequency: "WEEKLY", dayOfWeek: entry.dayOfWeek };
    case "MONTHLY":
      if (entry.dayOfMonth === null) {
        throw new Error("dayOfMonth é obrigatório para frequência MONTHLY.");
      }
      return { frequency: "MONTHLY", dayOfMonth: entry.dayOfMonth };
    case "YEARLY":
      if (entry.yearMonth === null || entry.dayOfMonth === null) {
        throw new Error("yearMonth e dayOfMonth são obrigatórios para frequência YEARLY.");
      }
      return { frequency: "YEARLY", yearMonth: entry.yearMonth, dayOfMonth: entry.dayOfMonth };
    default: {
      const exhaustiveCheck: never = entry.frequency;
      throw new Error(`Frequência não tratada: ${exhaustiveCheck}`);
    }
  }
}

function keyOf(year: number, month: number, day: number): DateKey {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// MONTHLY (e a parte "dia do mes" de YEARLY): dayOfMonth 29/30/31 num mes que
// nao tem esse dia usa o ULTIMO DIA daquele mes (secao "MONTHLY" da Etapa
// 4.1) - nunca rola pro mes seguinte. `month` aqui e 1-12.
function monthlyKeyInMonth(year: number, month: number, dayOfMonth: number): DateKey {
  return keyOf(year, month, Math.min(dayOfMonth, lastDayOfMonth(year, month)));
}

// YEARLY: fica SEMPRE no mes `yearMonth`, mesmo com dayOfMonth=29 (fevereiro)
// num ano nao bissexto (vira 28/fev). Isso e DELIBERADAMENTE diferente da
// normalizacao usada em period.ts pras janelas de COMPARACAO
// (SAME_PERIOD_LAST_YEAR por dia), que deixa 29/fev "rolar" pra 1/mar quando
// o ano de destino nao e bissexto - la e so um deslocamento de datas pra
// comparar periodos, aqui e um LANCAMENTO FINANCEIRO REAL, que precisa contar
// no mes certo (fevereiro) pra nao distorcer em qual mes aquele valor aparece
// no dashboard/relatorios. `yearMonth` e 0-11 (como gravado no molde).
function yearlyKeyInYear(year: number, yearMonth: number, dayOfMonth: number): DateKey {
  return monthlyKeyInMonth(year, yearMonth + 1, dayOfMonth);
}

// `month` 1-12; devolve o mes `delta` meses depois (delta pode cruzar anos).
function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

// Regra de primeira ocorrencia (secao "REGRA DE PRIMEIRA OCORRENCIA" da
// Etapa 4.1): NUNCA anterior ao startDate. Se a data calculada pela regra de
// dia ja tiver passado dentro do periodo corrente (semana/mes/ano de
// startDate), avanca pro periodo seguinte.
export function firstOccurrence(rule: RecurrenceRule, startDate: DateKey): DateKey {
  const { year, month } = parseDateKey(startDate);

  switch (rule.frequency) {
    case "WEEKLY":
      // Proximo dia (a partir de startDate, inclusive) com esse dia da semana.
      return addDays(startDate, (rule.dayOfWeek - weekdayOf(startDate) + 7) % 7);

    case "MONTHLY": {
      const candidate = monthlyKeyInMonth(year, month, rule.dayOfMonth);
      if (compareKeys(candidate, startDate) >= 0) return candidate;
      const next = addMonths(year, month, 1);
      return monthlyKeyInMonth(next.year, next.month, rule.dayOfMonth);
    }

    case "YEARLY": {
      const candidate = yearlyKeyInYear(year, rule.yearMonth, rule.dayOfMonth);
      if (compareKeys(candidate, startDate) >= 0) return candidate;
      return yearlyKeyInYear(year + 1, rule.yearMonth, rule.dayOfMonth);
    }

    default: {
      const exhaustiveCheck: never = rule;
      throw new Error(`Frequência não tratada: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}

// Ocorrencia seguinte a `previous` (que deve ser, ela mesma, uma ocorrencia
// valida da regra - normalmente o resultado de firstOccurrence ou de uma
// chamada anterior a nextOccurrence).
export function nextOccurrence(rule: RecurrenceRule, previous: DateKey): DateKey {
  const { year, month } = parseDateKey(previous);
  switch (rule.frequency) {
    case "WEEKLY":
      return addDays(previous, 7);
    case "MONTHLY": {
      const next = addMonths(year, month, 1);
      return monthlyKeyInMonth(next.year, next.month, rule.dayOfMonth);
    }
    case "YEARLY":
      return yearlyKeyInYear(year + 1, rule.yearMonth, rule.dayOfMonth);
    default: {
      const exhaustiveCheck: never = rule;
      throw new Error(`Frequência não tratada: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}

// Todos os dias de ocorrencia entre a primeira ocorrencia valida (relativa
// a startDate) e `uptoDate` (inclusive), respeitando endDate (inclusive,
// interrompe a geracao a partir da ocorrencia SEGUINTE a ela) quando
// definido. Pura - nao toca o banco; materializeRecurringEntries (materialize.ts)
// e quem transforma esses dias em FinancialEntry reais.
export function generateOccurrences(params: {
  rule: RecurrenceRule;
  startDate: DateKey;
  uptoDate: DateKey;
  endDate?: DateKey | null;
}): DateKey[] {
  const { rule, startDate, uptoDate, endDate } = params;
  const effectiveEnd = endDate && compareKeys(endDate, uptoDate) < 0 ? endDate : uptoDate;

  const dates: DateKey[] = [];
  let current = firstOccurrence(rule, startDate);
  while (compareKeys(current, effectiveEnd) <= 0) {
    dates.push(current);
    current = nextOccurrence(rule, current);
  }
  return dates;
}

// Borda com o banco: startDate/endDate do molde e o "ate quando" sao
// instantes; viram dias de calendario no fuso da empresa.
export function generateOccurrencesForEntry(entry: RecurringEntryLike, uptoDate: Date, timeZone: TimeZone): DateKey[] {
  const rule = toRecurrenceRule(entry);
  return generateOccurrences({
    rule,
    startDate: toDateKey(entry.startDate, timeZone),
    uptoDate: toDateKey(uptoDate, timeZone),
    endDate: entry.endDate ? toDateKey(entry.endDate, timeZone) : null,
  });
}

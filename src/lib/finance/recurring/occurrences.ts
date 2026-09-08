import type { RecurrenceFrequency } from "@prisma/client";

// Fuso horario: mesma convencao ja documentada em src/lib/finance/period.ts -
// Date local do processo Node, sem TZ explicito. Nao resolvido aqui (decisao
// de escopo ja tomada na Etapa 4).

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

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function lastDayOfMonth(year: number, month: number): number {
  // Dia 0 do mes seguinte = ultimo dia do mes atual (truque padrao de Date).
  return new Date(year, month + 1, 0).getDate();
}

// MONTHLY (e a parte "dia do mes" de YEARLY): dayOfMonth 29/30/31 num mes que
// nao tem esse dia usa o ULTIMO DIA daquele mes (secao "MONTHLY" da Etapa
// 4.1) - nunca rola pro mes seguinte.
function clampDayOfMonth(year: number, month: number, dayOfMonth: number): number {
  return Math.min(dayOfMonth, lastDayOfMonth(year, month));
}

function monthlyDateInMonth(year: number, month: number, dayOfMonth: number): Date {
  return new Date(year, month, clampDayOfMonth(year, month, dayOfMonth));
}

// YEARLY: fica SEMPRE no mes `yearMonth`, mesmo com dayOfMonth=29 (fevereiro)
// num ano nao bissexto (vira 28/fev). Isso e DELIBERADAMENTE diferente da
// normalizacao nativa de `Date` usada em period.ts pras janelas de
// COMPARACAO (SAME_PERIOD_LAST_YEAR por dia), que deixa 29/fev "rolar" pra
// 1/mar quando o ano de destino nao e bissexto - la e so um deslocamento de
// datas pra comparar periodos, aqui e um LANCAMENTO FINANCEIRO REAL, que
// precisa contar no mes certo (fevereiro) pra nao distorcer em qual mes
// aquele valor aparece no dashboard/relatorios.
function yearlyDateInYear(year: number, yearMonth: number, dayOfMonth: number): Date {
  return new Date(year, yearMonth, clampDayOfMonth(year, yearMonth, dayOfMonth));
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = month + delta;
  const y = year + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  return { year: y, month: m };
}

// Proximo dia (a partir de `from`, inclusive) cujo getDay() seja `dayOfWeek`.
function nextWeeklyOnOrAfter(from: Date, dayOfWeek: number): Date {
  const start = startOfDay(from);
  const diff = (dayOfWeek - start.getDay() + 7) % 7;
  const d = new Date(start);
  d.setDate(d.getDate() + diff);
  return d;
}

// Regra de primeira ocorrencia (secao "REGRA DE PRIMEIRA OCORRENCIA" da
// Etapa 4.1): NUNCA anterior ao startDate. Se a data calculada pela regra de
// dia ja tiver passado dentro do periodo corrente (semana/mes/ano de
// startDate), avanca pro periodo seguinte.
export function firstOccurrence(rule: RecurrenceRule, startDate: Date): Date {
  const start = startOfDay(startDate);

  switch (rule.frequency) {
    case "WEEKLY":
      return nextWeeklyOnOrAfter(start, rule.dayOfWeek);

    case "MONTHLY": {
      const candidate = monthlyDateInMonth(start.getFullYear(), start.getMonth(), rule.dayOfMonth);
      if (candidate.getTime() >= start.getTime()) return candidate;
      const { year, month } = addMonths(start.getFullYear(), start.getMonth(), 1);
      return monthlyDateInMonth(year, month, rule.dayOfMonth);
    }

    case "YEARLY": {
      const candidate = yearlyDateInYear(start.getFullYear(), rule.yearMonth, rule.dayOfMonth);
      if (candidate.getTime() >= start.getTime()) return candidate;
      return yearlyDateInYear(start.getFullYear() + 1, rule.yearMonth, rule.dayOfMonth);
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
export function nextOccurrence(rule: RecurrenceRule, previous: Date): Date {
  switch (rule.frequency) {
    case "WEEKLY": {
      const d = new Date(previous);
      d.setDate(d.getDate() + 7);
      return d;
    }
    case "MONTHLY": {
      const { year, month } = addMonths(previous.getFullYear(), previous.getMonth(), 1);
      return monthlyDateInMonth(year, month, rule.dayOfMonth);
    }
    case "YEARLY":
      return yearlyDateInYear(previous.getFullYear() + 1, rule.yearMonth, rule.dayOfMonth);
    default: {
      const exhaustiveCheck: never = rule;
      throw new Error(`Frequência não tratada: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}

// Todas as datas de ocorrencia entre a primeira ocorrencia valida (relativa
// a startDate) e `uptoDate` (inclusive), respeitando endDate (inclusive,
// interrompe a geracao a partir da ocorrencia SEGUINTE a ela) quando
// definido. Pura - nao toca o banco; materializeRecurringEntries (materialize.ts)
// e quem transforma essas datas em FinancialEntry reais.
export function generateOccurrences(params: {
  rule: RecurrenceRule;
  startDate: Date;
  uptoDate: Date;
  endDate?: Date | null;
}): Date[] {
  const { rule, startDate, uptoDate, endDate } = params;
  const upto = startOfDay(uptoDate);
  const cappedEnd = endDate ? startOfDay(endDate) : null;
  const effectiveEnd = cappedEnd && cappedEnd.getTime() < upto.getTime() ? cappedEnd : upto;

  const dates: Date[] = [];
  let current: Date | null = firstOccurrence(rule, startDate);
  while (current !== null && current.getTime() <= effectiveEnd.getTime()) {
    dates.push(current);
    current = nextOccurrence(rule, current);
  }
  return dates;
}

export function generateOccurrencesForEntry(entry: RecurringEntryLike, uptoDate: Date): Date[] {
  const rule = toRecurrenceRule(entry);
  return generateOccurrences({ rule, startDate: entry.startDate, uptoDate, endDate: entry.endDate });
}

import { dateKeyToDbDate, dbDateOfInstant, startOfDayInstant, toDateKey, type DateKey, type TimeZone } from "@/lib/time/zoned";

// Dia de calendario dos lancamentos (Etapa F6a-2): FinancialEntry.occurredOn
// (e Business.openingBalanceOn) e a FONTE DA VERDADE do dia; occurredAt
// (instante) continua gravado ate a F6d, sempre derivado do dia.

// Origem de um dia gravado: ou o usuario/planilha/molde disse QUAL dia
// (DateKey), ou so existe um instante real (ex.: liquidacao sem data, que usa
// o momento do clique).
export type DaySource = { day: DateKey } | { instant: Date };

// Colunas gravadas para um dia, garantindo toDateKey(at, fuso) == on em
// QUALQUER fuso:
// - DateKey: on = o proprio dia; at = 00:00 desse dia no fuso da empresa;
// - instante: on = o dia do instante no fuso da empresa; at = o instante.
export function dayColumns(source: DaySource, timeZone: TimeZone): { at: Date; on: Date } {
  if ("day" in source) {
    return { at: startOfDayInstant(source.day, timeZone), on: dateKeyToDbDate(source.day) };
  }
  return { at: source.instant, on: dbDateOfInstant(source.instant, timeZone) };
}

// Filtro Prisma de um periodo [start, end) sobre uma coluna @db.Date. Os
// periodos do app sao sempre alinhados a 00:00 no fuso da empresa
// (period.ts/zoned.ts), entao o dia de cada limite e exato.
export function dayRangeFilter(range: { start: Date; end: Date }, timeZone: TimeZone): { gte: Date; lt: Date } {
  return { gte: dateKeyToDbDate(toDateKey(range.start, timeZone)), lt: dateKeyToDbDate(toDateKey(range.end, timeZone)) };
}

// "Antes do dia de `instant`" (exclusivo) sobre uma coluna @db.Date.
export function beforeDayFilter(instant: Date, timeZone: TimeZone): { lt: Date } {
  return { lt: dateKeyToDbDate(toDateKey(instant, timeZone)) };
}

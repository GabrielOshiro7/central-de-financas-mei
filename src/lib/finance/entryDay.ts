import {
  dateKeyToDbDate,
  dbDateOfInstant,
  isDateKey,
  startOfDayInstant,
  startOfDayOf,
  toDateKey,
  type DateKey,
  type TimeZone,
} from "@/lib/time/zoned";

// Dia de calendario dos lancamentos (Etapa F6a-2): FinancialEntry.occurredOn
// (e Business.openingBalanceOn) e a FONTE DA VERDADE do dia; occurredAt
// (instante) continua gravado ate a F6d, sempre derivado do dia. Contas
// (Bill.dueOn/issueOn/paidOn, RecurringBill.startOn/endOn) seguem a mesma
// regra desde a Etapa F6b-2.

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

// Dia de calendario de um valor de data vindo de formulario/API (Etapa
// F6b-2): "YYYY-MM-DD" e o proprio dia, sem fuso; qualquer outro formato
// aceito pelos schemas (Date.parse, ex.: ISO com hora) vira o dia em que esse
// instante cai no fuso da empresa.
export function dayFromInput(value: string, timeZone: TimeZone): DateKey {
  return isDateKey(value) ? value : toDateKey(new Date(value), timeZone);
}

// Os periodos do app sao sempre alinhados a 00:00 no fuso da empresa
// (period.ts/zoned.ts). Um limite fora disso seria arredondado em silencio
// para o dia dele - um periodo "das 15h de 10/10" passaria a incluir a manha
// do dia 10 - entao e erro de programacao, nunca um caso a tolerar (F6b-2).
function assertStartOfDay(instant: Date, timeZone: TimeZone, label: string): void {
  if (startOfDayOf(instant, timeZone).getTime() !== instant.getTime()) {
    throw new RangeError(
      `Filtro de período inválido: ${label} (${instant.toISOString()}) não é o início de um dia em ${timeZone}.`
    );
  }
}

// Filtro Prisma de um periodo [start, end) sobre uma coluna @db.Date. Os
// limites precisam ser exatamente o inicio de um dia no fuso da empresa
// (assertStartOfDay); o dia de cada limite e entao exato.
export function dayRangeFilter(range: { start: Date; end: Date }, timeZone: TimeZone): { gte: Date; lt: Date } {
  assertStartOfDay(range.start, timeZone, "início");
  assertStartOfDay(range.end, timeZone, "fim");
  return { gte: dateKeyToDbDate(toDateKey(range.start, timeZone)), lt: dateKeyToDbDate(toDateKey(range.end, timeZone)) };
}

// "Antes do dia de `instant`" (exclusivo) sobre uma coluna @db.Date.
export function beforeDayFilter(instant: Date, timeZone: TimeZone): { lt: Date } {
  return { lt: dateKeyToDbDate(toDateKey(instant, timeZone)) };
}

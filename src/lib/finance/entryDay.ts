import {
  dateKeyToDbDate,
  dbDateOfInstant,
  isDateKey,
  startOfDayOf,
  toDateKey,
  type DateKey,
  type TimeZone,
} from "@/lib/time/zoned";

// Dia de calendario (Etapa F6): FinancialEntry.occurredOn, Business.
// openingBalanceOn, Bill.dueOn/issueOn/paidOn, Sale.saleOn e os startOn/endOn
// dos moldes sao colunas @db.Date - o dia no fuso da empresa, sem instante ao
// lado (as colunas de instante sairam na F6d; so Bill.paidAt fica, como
// auditoria).

// Origem de um dia gravado: ou o usuario/planilha/molde disse QUAL dia
// (DateKey), ou so existe um instante real (Date - ex.: um cliente da API
// que mandou data com hora), cujo dia e o do fuso da empresa.
export type DaySource = DateKey | Date;

export function dbDateOfDaySource(source: DaySource, timeZone: TimeZone): Date {
  return typeof source === "string" ? dateKeyToDbDate(source) : dbDateOfInstant(source, timeZone);
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

// Utilitario UNICO de datas (Etapa F1 do plano docs/plano-retrabalho-fuso-
// agenda.md, secao 3.2). Toda conta de "dia", "mes", "hoje" e conversao entre
// instante e calendario passa por aqui, com o fuso IANA SEMPRE como parametro
// explicito - nada depende do fuso do processo Node.
//
// Regras deste arquivo (verificadas por tests/unit/time/zoned.test.ts):
// - nunca getters/setters LOCAIS do Date (getDate, getHours, setHours,
//   getMonth, getFullYear, getDay...) - so os getters UTC, Date.UTC e
//   Intl.DateTimeFormat com timeZone explicito;
// - nunca `new Date("YYYY-MM-DD")` para data de calendario;
// - nunca toLocale* sem timeZone.
//
// Duas representacoes, nunca misturadas:
// - DateKey ("YYYY-MM-DD"): DATA DE CALENDARIO, sem hora e sem fuso ("20 de
//   outubro de 2026"). Aritmetica de dias/meses e feita direto na DateKey
//   (puro calendario gregoriano, via Date.UTC), sem fuso nenhum.
// - Date: INSTANTE absoluto. So vira dia/hora quando combinado com um fuso.
//
// Horario de verao: a conversao calendario -> instante (zonedInstant) usa a
// mesma desambiguacao "compatible" do Temporal: um horario local que nao
// existe (salto para frente) avanca pela duracao do salto; um horario local
// que existe duas vezes (volta do relogio) usa a PRIMEIRA ocorrencia. Por
// isso o inicio do dia e sempre o primeiro instante daquele dia, mesmo em
// fusos cujo horario de verao comeca a meia-noite.

export type TimeZone = string; // IANA, ex.: "Asia/Tokyo"
export type DateKey = string; // "YYYY-MM-DD"
export type DateRange = { start: Date; end: Date }; // [start, end) em instantes

export type ZonedParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=domingo..6=sabado
};

// Relogio da empresa: o unico jeito de obter "agora"/"hoje" no servidor
// (chamadores passam a usar em F3; aqui so a forma).
export type BusinessClock = { timeZone: TimeZone; now: Date };

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// ---------------------------------------------------------------------------
// Validacao de fuso

const partsFormatters = new Map<TimeZone, Intl.DateTimeFormat>();

export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== "string" || timeZone.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function assertValidTimeZone(timeZone: string): TimeZone {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(`Fuso horário inválido: "${timeZone}". Use um identificador IANA, ex.: "Asia/Tokyo".`);
  }
  return timeZone;
}

// Formatter por fuso, criado uma vez (Intl.DateTimeFormat e caro de montar).
function partsFormatter(timeZone: TimeZone): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    assertValidTimeZone(timeZone);
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

export function clockFor(source: { timezone: TimeZone }, now: Date = new Date()): BusinessClock {
  return { timeZone: assertValidTimeZone(source.timezone), now };
}

// ---------------------------------------------------------------------------
// Instante -> calendario no fuso

export function zonedParts(instant: Date, timeZone: TimeZone): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = WEEKDAY_INDEX[get("weekday")];
  if (weekday === undefined) throw new Error(`Dia da semana inesperado retornado pelo Intl: ${get("weekday")}`);
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    // Alguns ambientes devolvem "24" para meia-noite mesmo com h23.
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday,
  };
}

export function toDateKey(instant: Date, timeZone: TimeZone): DateKey {
  const { year, month, day } = zonedParts(instant, timeZone);
  return formatKey(year, month, day);
}

export function todayKey(clock: BusinessClock): DateKey {
  return toDateKey(clock.now, clock.timeZone);
}

export function weekdayIndex(instant: Date, timeZone: TimeZone): number {
  return zonedParts(instant, timeZone).weekday;
}

// Deslocamento do fuso (em ms) no instante dado: horario local - UTC.
function offsetMs(instant: number, timeZone: TimeZone): number {
  const p = zonedParts(new Date(instant), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const wholeSeconds = Math.floor(instant / 1000) * 1000;
  return asUtc - wholeSeconds;
}

// ---------------------------------------------------------------------------
// Calendario -> instante no fuso

// Instante em que o relogio de `timeZone` marca a data/hora dada. `month` e
// 1-indexado. Componentes fora do intervalo normalizam como Date.UTC (ex.:
// month 13 = janeiro do ano seguinte). Desambiguacao "compatible" (ver topo).
export function zonedInstant(
  timeZone: TimeZone,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  assertValidTimeZone(timeZone);
  const local = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  // Offsets um dia antes/depois: cobrem a (no maximo uma) transicao proxima.
  const offsetBefore = offsetMs(local - MS_PER_DAY, timeZone);
  const offsetAfter = offsetMs(local + MS_PER_DAY, timeZone);
  const candidates = [local - offsetBefore, local - offsetAfter].filter(
    (t) => offsetMs(t, timeZone) === local - t
  );
  if (candidates.length > 0) return new Date(Math.min(...candidates));
  // Horario inexistente (salto para frente): o offset de antes do salto leva
  // ao instante logo depois dele.
  return new Date(local - offsetBefore);
}

export function startOfDayInstant(key: DateKey, timeZone: TimeZone): Date {
  const { year, month, day } = parseDateKey(key);
  return zonedInstant(timeZone, year, month, day);
}

// Primeiro instante do dia de `instant` no fuso.
export function startOfDayOf(instant: Date, timeZone: TimeZone): Date {
  return startOfDayInstant(toDateKey(instant, timeZone), timeZone);
}

// [00:00 do dia, 00:00 do dia seguinte) - tem 23h ou 25h nos dias de
// transicao de horario de verao.
export function dayRange(key: DateKey, timeZone: TimeZone): DateRange {
  return { start: startOfDayInstant(key, timeZone), end: startOfDayInstant(addDays(key, 1), timeZone) };
}

// `month` 1-indexado. [00:00 do dia 1, 00:00 do dia 1 do mes seguinte).
export function monthRange(year: number, month: number, timeZone: TimeZone): DateRange {
  const first = formatKey(year, month, 1);
  return { start: startOfDayInstant(first, timeZone), end: startOfDayInstant(addMonthsClamped(first, 1), timeZone) };
}

// Semana que contem `key`, comecando em `weekStartsOn` (0=domingo, 1=segunda).
export function weekRange(key: DateKey, timeZone: TimeZone, weekStartsOn: 0 | 1 = 1): DateRange {
  const diff = (weekdayOf(key) - weekStartsOn + 7) % 7;
  const first = addDays(key, -diff);
  return { start: startOfDayInstant(first, timeZone), end: startOfDayInstant(addDays(first, 7), timeZone) };
}

// "YYYY-MM-DDTHH:mm" (valor de <input type="datetime-local">) interpretado
// SEMPRE no fuso dado - nunca no do navegador/servidor.
export function parseDateTimeInput(value: string, timeZone: TimeZone): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Formato de data/hora invalido: ${value}`);
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  return zonedInstant(timeZone, year, month, day, hour, minute);
}

// ---------------------------------------------------------------------------
// Aritmetica pura de calendario (sem fuso)

function formatKey(year: number, month: number, day: number): DateKey {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Normaliza ano/mes/dia (com overflow) para DateKey via aritmetica UTC.
function keyFromUtcParts(year: number, month: number, day: number): DateKey {
  const d = new Date(Date.UTC(year, month - 1, day));
  return formatKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function isDateKey(value: string): value is DateKey {
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  return month >= 1 && month <= 12 && day >= 1 && day <= lastDayOfMonth(year, month);
}

export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  if (!isDateKey(key)) throw new Error(`Data de calendario invalida (esperado YYYY-MM-DD): ${key}`);
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(key: DateKey, days: number): DateKey {
  const { year, month, day } = parseDateKey(key);
  return keyFromUtcParts(year, month, day + days);
}

// 31/01 + 1 mes = 28/02 (ou 29 em ano bissexto): nunca rola para o mes seguinte.
export function addMonthsClamped(key: DateKey, months: number): DateKey {
  const { year, month, day } = parseDateKey(key);
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;
  return formatKey(targetYear, targetMonth, Math.min(day, lastDayOfMonth(targetYear, targetMonth)));
}

export function weekdayOf(key: DateKey): number {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function compareKeys(a: DateKey, b: DateKey): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Ponte com colunas @db.Date (Prisma devolve Date a 00:00 UTC)

export function dateKeyToDbDate(key: DateKey): Date {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day));
}

export function dbDateToKey(date: Date): DateKey {
  return formatKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

// ---------------------------------------------------------------------------
// Formatacao

// Data de calendario em pt-BR, independente de fuso ("20/10/2026" ou
// "20 de outubro de 2026").
export function formatDateKey(key: DateKey, style: "short" | "long" = "short"): string {
  const options: Intl.DateTimeFormatOptions =
    style === "long"
      ? { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }
      : { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" };
  return new Intl.DateTimeFormat("pt-BR", options).format(dateKeyToDbDate(key));
}

// Instante formatado no fuso dado (o timeZone das opcoes e sempre o do
// parametro, nunca o do processo).
export function formatInstant(
  instant: Date,
  timeZone: TimeZone,
  options: Omit<Intl.DateTimeFormatOptions, "timeZone">,
  locale = "pt-BR"
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: assertValidTimeZone(timeZone) }).format(instant);
}

// Dia de calendario de um INSTANTE gravado (timestamp), no fuso dado, em
// pt-BR ("20/10/2026"). E o equivalente de `toLocaleDateString("pt-BR")`
// sem depender do fuso do processo/navegador (Etapa F4).
export function formatZonedDate(instant: Date, timeZone: TimeZone, style: "short" | "long" = "short"): string {
  return formatDateKey(toDateKey(instant, timeZone), style);
}

// Coluna @db.Date (dia de calendario) do dia em que `instant` cai no fuso
// dado - a gravacao dupla da Etapa F6a-1: o dia novo e SEMPRE o mesmo dia que
// o app ja enxerga no instante antigo (toDateKey(instante, fuso da empresa)).
export function dbDateOfInstant(instant: Date, timeZone: TimeZone): Date {
  return dateKeyToDbDate(toDateKey(instant, timeZone));
}

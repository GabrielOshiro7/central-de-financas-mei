// Etapa 8 (Agenda): TODAS as datas deste arquivo (e de quem o consome) sao
// resolvidas EXPLICITAMENTE em Asia/Tokyo, via Intl.DateTimeFormat com
// timeZone fixo - nunca getters/setters locais do processo Node
// (getHours/getDate/getDay/getMonth/getFullYear/setHours), que refletiriam o
// fuso do HOST, nao de Toquio (ver a limitacao ja documentada e
// deliberadamente NAO reaproveitada de src/lib/finance/period.ts). Um teste
// estatico (tests/unit/agenda/noLocalTimeUsage.test.ts) falha se qualquer
// arquivo de src/lib/agenda usar esses metodos.
//
// AGENDA_TIMEZONE e AGENDA_WEEK_START_DAY sao a UNICA fonte de verdade do
// fuso e do primeiro dia da semana da Agenda - nenhum outro arquivo deve
// hardcodear "Asia/Tokyo" ou o numero 1 (segunda) de novo.
export const AGENDA_TIMEZONE = "Asia/Tokyo";

// 1 = segunda-feira (ISO-8601 / convencao brasileira). 0=domingo..6=sabado.
export const AGENDA_WEEK_START_DAY = 1;

// Asia/Tokyo nunca observou horario de verao desde 1951 - por isso um offset
// fixo de +9h e seguro e deterministico aqui (sem tabela de transicoes de
// DST). NAO reaproveitar esse atalho para outro fuso sem verificar se ele
// tem DST.
const TOKYO_OFFSET_MINUTES = 9 * 60;
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

type TokyoParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

// Decompoe um instante UTC nos componentes de calendario/hora de Toquio.
// `month` e 1-indexado (janeiro=1), diferente do Date nativo.
function toTokyoParts(date: Date): TokyoParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AGENDA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    // hour12:false pode devolver "24" para meia-noite em alguns ambientes -
    // normaliza para 0.
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

// Constroi o instante UTC correspondente a uma data/hora de Toquio.
// `month` e 1-indexado (janeiro=1).
function fromTokyoParts(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  const utcMillis = Date.UTC(year, month - 1, day, hour, minute, second, 0) - TOKYO_OFFSET_MINUTES * MS_PER_MINUTE;
  return new Date(utcMillis);
}

function addDaysTokyo(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function tokyoWeekdayIndex(date: Date): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: AGENDA_TIMEZONE, weekday: "short" }).format(date);
  const idx = WEEKDAY_INDEX[weekday];
  if (idx === undefined) throw new Error(`Dia da semana inesperado retornado pelo Intl: ${weekday}`);
  return idx;
}

export type DateRange = { start: Date; end: Date };

// Meia-noite de Toquio do dia em que `date` cai (em Toquio).
export function startOfDayTokyo(date: Date): Date {
  const { year, month, day } = toTokyoParts(date);
  return fromTokyoParts(year, month, day);
}

export function todayRangeTokyo(now: Date): DateRange {
  const start = startOfDayTokyo(now);
  return { start, end: addDaysTokyo(start, 1) };
}

// Inicio da semana (AGENDA_WEEK_START_DAY, segunda) em que `date` cai, em
// Toquio.
export function startOfWeekTokyo(date: Date): Date {
  const start = startOfDayTokyo(date);
  const weekday = tokyoWeekdayIndex(start);
  const diff = (weekday - AGENDA_WEEK_START_DAY + 7) % 7;
  return addDaysTokyo(start, -diff);
}

export function weekRangeTokyo(now: Date): DateRange {
  const start = startOfWeekTokyo(now);
  return { start, end: addDaysTokyo(start, 7) };
}

// Dia 1 (meia-noite de Toquio) do mes em que `date` cai, em Toquio.
export function startOfMonthTokyo(date: Date): Date {
  const { year, month } = toTokyoParts(date);
  return fromTokyoParts(year, month, 1);
}

// Dia 1 (meia-noite de Toquio) do mes SEGUINTE ao de `date` - usado como
// limite exclusivo de range mensal. Vira o ano explicitamente em dezembro
// (sem depender de normalizacao de Date local).
export function startOfNextMonthTokyo(date: Date): Date {
  const { year, month } = toTokyoParts(date);
  if (month === 12) return fromTokyoParts(year + 1, 1, 1);
  return fromTokyoParts(year, month + 1, 1);
}

export function monthRangeTokyo(now: Date): DateRange {
  return { start: startOfMonthTokyo(now), end: startOfNextMonthTokyo(now) };
}

// Interpreta o valor de um <input type="datetime-local"> ("YYYY-MM-DDTHH:mm",
// sem segundos/fuso) SEMPRE como horario de Toquio - nunca o fuso do
// navegador/servidor.
export function parseTokyoDateTimeInput(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Formato de data/hora invalido: ${value}`);
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  return fromTokyoParts(year, month, day, hour, minute);
}

// "YYYY-MM-DD" do dia em Toquio - usado tanto para exibicao quanto (Etapa 8,
// incremento 3) como a mesma representacao de string que createSale ja
// recebe para Sale.saleDate (ver decisao do incremento 3 - NAO implementada
// aqui).
export function formatTokyoDateKey(date: Date): string {
  const { year, month, day } = toTokyoParts(date);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatTokyoDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: AGENDA_TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function formatTokyoTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: AGENDA_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

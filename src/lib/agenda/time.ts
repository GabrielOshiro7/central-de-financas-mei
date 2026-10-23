// Etapa 8 (Agenda): TODAS as datas deste arquivo (e de quem o consome) sao
// resolvidas EXPLICITAMENTE em Asia/Tokyo - nunca getters/setters locais do
// processo Node (getHours/getDate/getDay/getMonth/getFullYear/setHours), que
// refletiriam o fuso do HOST, nao de Toquio. Um teste estatico
// (tests/unit/agenda/noLocalTimeUsage.test.ts) falha se qualquer arquivo de
// src/lib/agenda usar esses metodos.
//
// Etapa F1: a conta de fuso em si mora no utilitario unico
// src/lib/time/zoned.ts (fuso por parametro, seguro para horario de verao).
// Este arquivo so fixa o fuso da Agenda e mantem a API `*Tokyo` de sempre,
// com exatamente o mesmo comportamento, ate os chamadores passarem a usar o
// fuso da empresa (etapas seguintes do plano).
//
// AGENDA_TIMEZONE e AGENDA_WEEK_START_DAY sao a UNICA fonte de verdade do
// fuso e do primeiro dia da semana da Agenda - nenhum outro arquivo deve
// hardcodear "Asia/Tokyo" ou o numero 1 (segunda) de novo.
import {
  dayRange,
  formatInstant,
  monthRange,
  parseDateTimeInput,
  startOfDayOf,
  toDateKey,
  weekRange,
  weekdayIndex,
  zonedInstant,
  zonedParts,
  type DateRange,
} from "@/lib/time/zoned";

export const AGENDA_TIMEZONE = "Asia/Tokyo";

// 1 = segunda-feira (ISO-8601 / convencao brasileira). 0=domingo..6=sabado.
export const AGENDA_WEEK_START_DAY = 1;

export type { DateRange };

// Constroi o instante UTC correspondente a uma data/hora de Toquio.
// `month` e 1-indexado (janeiro=1). Exportada (Etapa Agenda-calendario) para
// calendar.ts construir datas a partir de ano/mes/dia explicitos (grade do
// mes, range do mes).
export function fromTokyoParts(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  return zonedInstant(AGENDA_TIMEZONE, year, month, day, hour, minute, second);
}

// Exportada (Etapa Agenda-calendario) - calendar.ts usa pra saber em que
// coluna (domingo=0) comeca a grade do mes, sem reimplementar a conversao.
export function tokyoWeekdayIndex(date: Date): number {
  return weekdayIndex(date, AGENDA_TIMEZONE);
}

// Meia-noite de Toquio do dia em que `date` cai (em Toquio).
export function startOfDayTokyo(date: Date): Date {
  return startOfDayOf(date, AGENDA_TIMEZONE);
}

export function todayRangeTokyo(now: Date): DateRange {
  return dayRange(toDateKey(now, AGENDA_TIMEZONE), AGENDA_TIMEZONE);
}

// Inicio da semana (AGENDA_WEEK_START_DAY, segunda) em que `date` cai, em
// Toquio.
export function startOfWeekTokyo(date: Date): Date {
  return weekRangeTokyo(date).start;
}

export function weekRangeTokyo(now: Date): DateRange {
  return weekRange(toDateKey(now, AGENDA_TIMEZONE), AGENDA_TIMEZONE, AGENDA_WEEK_START_DAY);
}

// Dia 1 (meia-noite de Toquio) do mes em que `date` cai, em Toquio.
export function startOfMonthTokyo(date: Date): Date {
  return monthRangeTokyo(date).start;
}

// Dia 1 (meia-noite de Toquio) do mes SEGUINTE ao de `date` - usado como
// limite exclusivo de range mensal (vira o ano em dezembro).
export function startOfNextMonthTokyo(date: Date): Date {
  return monthRangeTokyo(date).end;
}

export function monthRangeTokyo(now: Date): DateRange {
  const { year, month } = zonedParts(now, AGENDA_TIMEZONE);
  return monthRange(year, month, AGENDA_TIMEZONE);
}

// Interpreta o valor de um <input type="datetime-local"> ("YYYY-MM-DDTHH:mm",
// sem segundos/fuso) SEMPRE como horario de Toquio - nunca o fuso do
// navegador/servidor.
export function parseTokyoDateTimeInput(value: string): Date {
  return parseDateTimeInput(value, AGENDA_TIMEZONE);
}

// "YYYY-MM-DD" do dia em Toquio - usado tanto para exibicao quanto (Etapa 8,
// incremento 3) como a mesma representacao de string que createSale ja
// recebe para Sale.saleDate.
export function formatTokyoDateKey(date: Date): string {
  return toDateKey(date, AGENDA_TIMEZONE);
}

export function formatTokyoDate(date: Date): string {
  return formatInstant(date, AGENDA_TIMEZONE, { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatTokyoTime(date: Date): string {
  return formatInstant(date, AGENDA_TIMEZONE, { hour: "2-digit", minute: "2-digit", hour12: false });
}

// "2 de outubro de 2026" - usado pelos cabecalhos por extenso do redesign do
// calendario (grade mensal, painel do dia, agrupamento da aba Mes).
export function formatTokyoDateLong(date: Date): string {
  return formatInstant(date, AGENDA_TIMEZONE, { day: "numeric", month: "long", year: "numeric" });
}

// "outubro de 2026" (minusculo - quem exibe no cabecalho do calendario
// capitaliza a primeira letra na hora de montar o texto, nao aqui).
export function formatTokyoMonthYear(date: Date): string {
  return formatInstant(date, AGENDA_TIMEZONE, { month: "long", year: "numeric" });
}

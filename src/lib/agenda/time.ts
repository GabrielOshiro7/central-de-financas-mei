// Etapa 8 (Agenda): TODAS as datas deste arquivo (e de quem o consome) sao
// resolvidas com fuso EXPLICITO - nunca getters/setters locais do processo
// Node (getHours/getDate/getDay/getMonth/getFullYear/setHours), que
// refletiriam o fuso do HOST. Um teste estatico
// (tests/unit/agenda/noLocalTimeUsage.test.ts) falha se qualquer arquivo de
// src/lib/agenda usar esses metodos.
//
// Etapa F1: a conta de fuso em si mora no utilitario unico
// src/lib/time/zoned.ts (fuso por parametro, seguro para horario de verao).
//
// Etapa F3c: o fuso deixou de ser fixo (era AGENDA_TIMEZONE = "Asia/Tokyo")
// e passou a ser o FUSO DA EMPRESA (Business.timezone), recebido por
// parametro de quem ja carregou a empresa. Para empresa em Asia/Tokyo o
// comportamento e identico ao de antes.
//
// AGENDA_WEEK_START_DAY continua a UNICA fonte de verdade do primeiro dia da
// semana da Agenda - nenhum outro arquivo deve hardcodear o numero 1
// (segunda) de novo.
import {
  dayRange,
  formatInstant,
  monthRange,
  parseDateTimeInput,
  startOfDayOf,
  toDateKey,
  weekRange,
  zonedParts,
  type DateRange,
  type TimeZone,
} from "@/lib/time/zoned";

// 1 = segunda-feira (ISO-8601 / convencao brasileira). 0=domingo..6=sabado.
export const AGENDA_WEEK_START_DAY = 1;

export type { DateRange };

// Meia-noite (no fuso dado) do dia em que `date` cai nesse fuso.
export function startOfAgendaDay(date: Date, timeZone: TimeZone): Date {
  return startOfDayOf(date, timeZone);
}

export function todayRange(now: Date, timeZone: TimeZone): DateRange {
  return dayRange(toDateKey(now, timeZone), timeZone);
}

// Inicio da semana (AGENDA_WEEK_START_DAY, segunda) em que `date` cai, no
// fuso dado.
export function startOfAgendaWeek(date: Date, timeZone: TimeZone): Date {
  return agendaWeekRange(date, timeZone).start;
}

export function agendaWeekRange(now: Date, timeZone: TimeZone): DateRange {
  return weekRange(toDateKey(now, timeZone), timeZone, AGENDA_WEEK_START_DAY);
}

// Dia 1 (meia-noite no fuso dado) do mes em que `date` cai.
export function startOfAgendaMonth(date: Date, timeZone: TimeZone): Date {
  return agendaMonthRangeOf(date, timeZone).start;
}

// Dia 1 (meia-noite no fuso dado) do mes SEGUINTE ao de `date` - usado como
// limite exclusivo de range mensal (vira o ano em dezembro).
export function startOfNextAgendaMonth(date: Date, timeZone: TimeZone): Date {
  return agendaMonthRangeOf(date, timeZone).end;
}

export function agendaMonthRangeOf(now: Date, timeZone: TimeZone): DateRange {
  const { year, month } = zonedParts(now, timeZone);
  return monthRange(year, month, timeZone);
}

// Interpreta o valor de um <input type="datetime-local"> ("YYYY-MM-DDTHH:mm",
// sem segundos/fuso) SEMPRE no fuso da empresa - nunca o fuso do
// navegador/servidor.
export function parseAgendaDateTimeInput(value: string, timeZone: TimeZone): Date {
  return parseDateTimeInput(value, timeZone);
}

// "YYYY-MM-DD" do dia no fuso dado - usado tanto para exibicao quanto (Etapa
// 8, incremento 3) como a mesma representacao de string que createSale ja
// recebe para Sale.saleDate.
export function agendaDateKey(date: Date, timeZone: TimeZone): string {
  return toDateKey(date, timeZone);
}

export function formatAgendaDate(date: Date, timeZone: TimeZone): string {
  return formatInstant(date, timeZone, { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatAgendaTime(date: Date, timeZone: TimeZone): string {
  return formatInstant(date, timeZone, { hour: "2-digit", minute: "2-digit", hour12: false });
}

// "2 de outubro de 2026" - usado pelos cabecalhos por extenso do redesign do
// calendario (grade mensal, painel do dia, agrupamento da aba Mes).
export function formatAgendaDateLong(date: Date, timeZone: TimeZone): string {
  return formatInstant(date, timeZone, { day: "numeric", month: "long", year: "numeric" });
}

// "outubro de 2026" (minusculo - quem exibe no cabecalho do calendario
// capitaliza a primeira letra na hora de montar o texto, nao aqui).
export function formatAgendaMonthYear(date: Date, timeZone: TimeZone): string {
  return formatInstant(date, timeZone, { month: "long", year: "numeric" });
}

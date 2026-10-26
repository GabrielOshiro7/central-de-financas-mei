// Redesign do calendario mensal da Agenda - funcoes puras (sem React), todas
// resolvidas no FUSO DA EMPRESA (parametro `timeZone`, Etapa F3c - antes fixo
// em Asia/Tokyo) via src/lib/time/zoned.ts. Mesma regra estatica de
// tests/unit/agenda/noLocalTimeUsage.test.ts se aplica aqui (este arquivo
// tambem vive em src/lib/agenda): nunca getHours/getDate/getDay/getMonth/
// getFullYear/setHours.
import type { AppointmentStatus } from "@prisma/client";
import { agendaDateKey, type DateRange } from "@/lib/agenda/time";
import { lastDayOfMonth, monthRange, weekdayOf, zonedInstant, type TimeZone } from "@/lib/time/zoned";

// Range [00:00 do dia 1, 00:00 do dia 1 do mes seguinte), no fuso dado -
// limite exclusivo, nunca mais que um mes. `month` e 1-indexado
// (janeiro=1), igual ao resto de src/lib/agenda.
export function agendaMonthRange(year: number, month: number, timeZone: TimeZone): DateRange {
  return monthRange(year, month, timeZone);
}

// Range [00:00 do dia, 00:00 do dia seguinte), no fuso dado, a partir de uma
// chave "YYYY-MM-DD" - usado pela aba Dia (que navega dia a dia, nao so
// "hoje" como todayRange em time.ts). Usa shiftDateKey pra calcular o dia
// seguinte (correto em viradas de mes/ano), nunca aritmetica local. Nao usa
// dayRange (zoned.ts) de proposito: ?day= aceita "2026-02-31" (o schema so
// checa o formato), que aqui normaliza para 03/03 como sempre - dayRange
// lancaria erro e derrubaria a pagina.
export function agendaDayRange(dateKey: string, timeZone: TimeZone): DateRange {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = zonedInstant(timeZone, year, month, day);
  const [nextYear, nextMonth, nextDay] = shiftDateKey(dateKey, 1).split("-").map(Number);
  const end = zonedInstant(timeZone, nextYear, nextMonth, nextDay);
  return { start, end };
}

export type MonthGridCell = { date: Date; dateKey: string };

// Grade domingo->sabado cobrindo o mes inteiro - celulas antes do dia 1 ou
// depois do ultimo dia do mes vem como `null` (dias de outros meses nunca sao
// mostrados, por decisao explicita do redesign). Numero de semanas varia (4 a
// 6 linhas) conforme o mes. A grade em si e calendario puro; o fuso so define
// o instante (`date`, 00:00 no fuso da empresa) de cada celula.
export function buildMonthGrid(year: number, month: number, timeZone: TimeZone): (MonthGridCell | null)[][] {
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  const firstWeekday = weekdayOf(`${pad(year, 4)}-${pad(month, 2)}-01`); // 0 = domingo
  const daysInMonth = lastDayOfMonth(year, month);

  const cells: (MonthGridCell | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = zonedInstant(timeZone, year, month, day);
    cells.push({ date, dateKey: agendaDateKey(date, timeZone) });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (MonthGridCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Agrupa qualquer lista com `startAt` pelo dia-calendario no fuso dado
// ("YYYY-MM-DD") - usado tanto pelo painel do dia no Calendario quanto pela
// lista por dia da aba Mes. Generico (nao amarra no shape de
// AppointmentListItem) para servir tanto a lista ja mapeada pra UI quanto o
// resultado cru do Prisma.
export function groupAppointmentsByDay<T extends { startAt: Date }>(appointments: T[], timeZone: TimeZone): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const appointment of appointments) {
    const key = agendaDateKey(appointment.startAt, timeZone);
    const group = map.get(key);
    if (group) group.push(appointment);
    else map.set(key, [appointment]);
  }
  return map;
}

// Soma/subtrai dias a uma chave "YYYY-MM-DD" - aritmetica pura sobre a
// propria chave (meio-dia UTC fixo, sem relacao com o instante real de
// nenhum agendamento). Usada pra navegacao dia-a-dia (aba Dia) e
// pela navegacao por teclado da grade do Calendario - nunca para gravar/ler
// um agendamento, so para decidir qual dia mostrar/focar a seguir.
export function shiftDateKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day, 12));
  next.setUTCDate(next.getUTCDate() + days);
  const yyyy = String(next.getUTCFullYear()).padStart(4, "0");
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Regra do "pontinho" do calendario (secao 4 do redesign): um dia tem o
// indicador se tiver pelo menos um agendamento NAO cancelado - CANCELADO
// sozinho nao conta, mas FALTOU conta (diferente do filtro de
// detectOverlap em calculations.ts, que ignora tanto CANCELADO quanto
// FALTOU - regras diferentes, nao reaproveitar uma pra outra).
export function hasVisibleAppointment(appointments: { status: AppointmentStatus }[]): boolean {
  return appointments.some((a) => a.status !== "CANCELADO");
}

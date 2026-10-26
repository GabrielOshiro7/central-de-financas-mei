import { addDays, addMonthsClamped, formatInstant, parseDateKey, todayKey } from "../../../src/lib/time/zoned";

// Datas dos E2E no FUSO DA EMPRESA DE TESTE (Etapa F3b). Toda empresa criada
// pelo cadastro/onboarding nasce em Asia/Tokyo (default da F2), e o app
// calcula "hoje"/vencimento nesse fuso - entao os testes tambem precisam.
// Antes, os specs montavam a data com toISOString() (dia UTC) ou com os
// getters locais do processo: o primeiro falhava entre 00:00 e 09:00 de
// Toquio (dia UTC ainda no anterior), o segundo falharia com o Playwright
// rodando em outro fuso.
export const E2E_BUSINESS_TZ = "Asia/Tokyo";

const clock = () => ({ now: new Date(), timeZone: E2E_BUSINESS_TZ });

// "YYYY-MM-DD" de hoje (+/- N dias) no fuso da empresa de teste.
export function businessToday(offsetDays = 0): string {
  return addDays(todayKey(clock()), offsetDays);
}

// Dia do mes (1-31) de hoje no fuso da empresa de teste.
export function businessTodayDayOfMonth(): number {
  return parseDateKey(businessToday()).day;
}

// "YYYY-MM-01" do mes anterior no fuso da empresa de teste.
export function businessFirstOfPreviousMonth(): string {
  const { year, month } = parseDateKey(addMonthsClamped(businessToday(), -1));
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

// Valor de <input type="datetime-local"> ("YYYY-MM-DDTHH:mm") para agora
// (+/- offsetMs) no relogio da empresa de teste.
export function businessDateTimeInput(offsetMs = 0): string {
  const instant = new Date(Date.now() + offsetMs);
  const date = formatInstant(instant, E2E_BUSINESS_TZ, { year: "numeric", month: "2-digit", day: "2-digit" }, "en-CA");
  const time = formatInstant(instant, E2E_BUSINESS_TZ, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, "en-GB");
  return `${date}T${time}`;
}

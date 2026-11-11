// Periodos do financeiro/dashboard (Etapa F3a do plano de fuso): TODAS as
// datas deste arquivo sao resolvidas no FUSO DA EMPRESA, recebido
// explicitamente (BusinessClock / PeriodRange.timeZone) e calculado por
// src/lib/time/zoned.ts - nunca pelos getters locais do Date, que refletiriam
// o fuso do processo Node. Para empresa em Asia/Tokyo com o servidor em
// Asia/Tokyo o resultado e identico ao de antes; com o servidor em UTC (ou
// qualquer outro fuso) o "hoje"/"este mes" continua sendo o da empresa.
//
// Cada PeriodRange carrega o proprio fuso, para que "periodo anterior" e
// "mesmo periodo do ano anterior" desloquem por dias/meses de CALENDARIO
// nesse fuso (seguro para horario de verao), sem o chamador repassar nada.
import {
  addDays,
  addMonthsClamped,
  dateKeyToDbDate,
  isDateKey,
  lastDayOfMonth,
  compareKeys,
  parseDateKey,
  startOfDayInstant,
  toDateKey,
  todayKey,
  zonedInstant,
  zonedParts,
  type BusinessClock,
  type DateKey,
  type TimeZone,
} from "@/lib/time/zoned";

export type PeriodKey =
  | "TODAY"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "LAST_7_DAYS"
  | "LAST_30_DAYS"
  | "LAST_90_DAYS"
  | "LAST_3_MONTHS"
  | "LAST_6_MONTHS"
  | "THIS_YEAR"
  | "LAST_YEAR"
  | "CUSTOM";

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "TODAY", label: "Hoje" },
  { value: "THIS_MONTH", label: "Este mês" },
  { value: "LAST_MONTH", label: "Mês anterior" },
  { value: "LAST_7_DAYS", label: "Últimos 7 dias" },
  { value: "LAST_30_DAYS", label: "Últimos 30 dias" },
  { value: "LAST_90_DAYS", label: "Últimos 90 dias" },
  { value: "LAST_3_MONTHS", label: "Últimos 3 meses" },
  { value: "LAST_6_MONTHS", label: "Últimos 6 meses" },
  { value: "THIS_YEAR", label: "Este ano" },
  { value: "LAST_YEAR", label: "Ano anterior" },
  { value: "CUSTOM", label: "Personalizado" },
];

export const DEFAULT_PERIOD: PeriodKey = "THIS_MONTH";

export type MonthRef = { year: number; month: number }; // month: 0-11

// "month": o range cobre um numero inteiro de meses civis a partir do dia 1
// (THIS_MONTH, LAST_MONTH, LAST_3/6_MONTHS, THIS_YEAR, LAST_YEAR). "day": o
// range e delimitado por dias soltos, mesmo que por coincidencia comece no
// dia 1 (TODAY, LAST_7/30/90_DAYS, CUSTOM). Campo explicito porque inferir
// isso so a partir de "o inicio cai no dia 1" da falso positivo: TODAY caindo
// no dia 1o de um mes, ou LAST_7_DAYS quando "hoje" e dia 7 - ver os testes
// de colisao em period.test.ts.
export type PeriodAlignment = "month" | "day";

export type PeriodRange = {
  start: Date;
  end: Date; // exclusivo
  months: MonthRef[];
  alignment: PeriodAlignment;
  timeZone: TimeZone; // fuso da empresa em que start/end/months foram resolvidos
};

// Datas de calendario escolhidas pelo usuario (end inclusivo).
export type CustomRange = { start: DateKey; end: DateKey };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Mes com overflow normalizado (month0 -1 = dezembro do ano anterior etc.).
function normalizeMonth(year: number, month0: number): MonthRef {
  const total = year * 12 + month0;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

// 00:00 do dia 1 de (year, month0) no fuso, com overflow normalizado.
function startOfMonth(year: number, month0: number, timeZone: TimeZone): Date {
  const { year: y, month } = normalizeMonth(year, month0);
  return zonedInstant(timeZone, y, month + 1, 1);
}

// Exportado porque o servico do dashboard (Etapa 4) precisa dos mesmos meses
// civis cobertos por um range arbitrario (ex.: o range de comparacao) para
// buscar a serie mensal equivalente - ver getMonthlySeriesForRange em
// queries.ts. Usa o ultimo instante realmente incluido no range
// (endExclusive - 1ms) para achar o mes final - se comparassemos direto com
// endExclusive, um fim de range que cai no meio de um mes (ex.: dia 6)
// excluiria esse mes inteiro por engano.
export function monthsBetween(start: Date, endExclusive: Date, timeZone: TimeZone): MonthRef[] {
  const first = zonedParts(start, timeZone);
  const last = zonedParts(new Date(endExclusive.getTime() - 1), timeZone);
  const months: MonthRef[] = [];
  for (let index = first.year * 12 + first.month - 1; index <= last.year * 12 + last.month - 1; index += 1) {
    months.push(normalizeMonth(0, index));
  }
  return months;
}

function monthsBack(year: number, month0: number, count: number, timeZone: TimeZone): PeriodRange {
  const start = startOfMonth(year, month0 - (count - 1), timeZone);
  const end = startOfMonth(year, month0 + 1, timeZone);
  const months = Array.from({ length: count }, (_, i) => normalizeMonth(year, month0 - (count - 1) + i));
  return { start, end, months, alignment: "month", timeZone };
}

// Range por dias de calendario [startKey, endKeyExclusive) no fuso.
function dayKeysRange(startKey: DateKey, endKeyExclusive: DateKey, timeZone: TimeZone): PeriodRange {
  const start = startOfDayInstant(startKey, timeZone);
  const end = startOfDayInstant(endKeyExclusive, timeZone);
  return { start, end, months: monthsBetween(start, end, timeZone), alignment: "day", timeZone };
}

// Range de N dias terminando hoje (inclusive) - usado por LAST_7/30/90_DAYS.
// `end` e sempre "inicio de amanha" (meia-noite do dia seguinte a hoje), ou
// seja, cobre o dia de hoje inteiro. Sempre alignment "day", mesmo quando
// `start` cai por coincidencia no dia 1 de um mes.
function lastNDaysRange(today: DateKey, days: number, timeZone: TimeZone): PeriodRange {
  return dayKeysRange(addDays(today, -(days - 1)), addDays(today, 1), timeZone);
}

// `customRange` so e usado (e obrigatorio) quando period === "CUSTOM". O `end`
// do range custom e tratado como inclusivo (o usuario escolhe "ate" um dia),
// entao internamente somamos 1 dia para virar o limite exclusivo usado nas
// queries.
//
// `options.throughToday` (so a Visao Geral usa): THIS_MONTH e THIS_YEAR vao do
// 1o dia ATE HOJE (inclusive; fim exclusivo = inicio de amanha, no fuso da
// empresa) em vez do mes/ano inteiro - lancamentos com data futura nao entram
// nos numeros ate chegar o dia. Os demais periodos nao mudam, e sem a opcao
// (todas as outras paginas) THIS_MONTH/THIS_YEAR continuam sendo o mes/ano inteiro.
export function resolvePeriodRange(
  period: PeriodKey,
  clock: BusinessClock,
  customRange?: CustomRange,
  options: { throughToday?: boolean } = {}
): PeriodRange {
  const { timeZone } = clock;
  const today = todayKey(clock);
  const { year, month: month1 } = zonedParts(clock.now, timeZone);
  const month = month1 - 1;

  switch (period) {
    case "TODAY":
      return dayKeysRange(today, addDays(today, 1), timeZone);
    case "THIS_MONTH":
      return {
        start: startOfMonth(year, month, timeZone),
        end: options.throughToday ? startOfDayInstant(addDays(today, 1), timeZone) : startOfMonth(year, month + 1, timeZone),
        months: [{ year, month }],
        alignment: "month",
        timeZone,
      };
    case "LAST_MONTH":
      return {
        start: startOfMonth(year, month - 1, timeZone),
        end: startOfMonth(year, month, timeZone),
        months: [normalizeMonth(year, month - 1)],
        alignment: "month",
        timeZone,
      };
    case "LAST_7_DAYS":
      return lastNDaysRange(today, 7, timeZone);
    case "LAST_30_DAYS":
      return lastNDaysRange(today, 30, timeZone);
    case "LAST_90_DAYS":
      return lastNDaysRange(today, 90, timeZone);
    case "LAST_3_MONTHS":
      return monthsBack(year, month, 3, timeZone);
    case "LAST_6_MONTHS":
      return monthsBack(year, month, 6, timeZone);
    case "THIS_YEAR": {
      const months: MonthRef[] = Array.from({ length: month + 1 }, (_, i) => ({ year, month: i }));
      return {
        start: startOfMonth(year, 0, timeZone),
        end: options.throughToday ? startOfDayInstant(addDays(today, 1), timeZone) : startOfMonth(year + 1, 0, timeZone),
        months,
        alignment: "month",
        timeZone,
      };
    }
    case "LAST_YEAR": {
      const months: MonthRef[] = Array.from({ length: 12 }, (_, i) => ({ year: year - 1, month: i }));
      return { start: startOfMonth(year - 1, 0, timeZone), end: startOfMonth(year, 0, timeZone), months, alignment: "month", timeZone };
    }
    case "CUSTOM": {
      if (!customRange) {
        throw new Error("customRange é obrigatório quando period é CUSTOM.");
      }
      // "day" sempre, mesmo quando o intervalo escolhido comeca no dia 1 e
      // cobre meses inteiros - e um range arbitrario do usuario, nao um mes
      // civil, entao "periodo anterior"/"mesmo periodo ano anterior" devem
      // deslocar por dias, nao por mes.
      return dayKeysRange(customRange.start, addDays(customRange.end, 1), timeZone);
    }
    default: {
      // Checagem de exaustividade em tempo de compilacao: se um novo
      // PeriodKey for adicionado sem um case aqui, o TypeScript acusa erro
      // nesta linha (period deixa de ser atribuivel a `never`).
      const exhaustiveCheck: never = period;
      throw new Error(`Período não tratado: ${exhaustiveCheck}`);
    }
  }
}

// Le start/end (yyyy-mm-dd) vindos de searchParams. Retorna undefined se
// nao forem duas datas de calendario validas, ou se o inicio vier depois do
// fim - o chamador deve tratar isso como "sem range custom valido" (ex.:
// cair de volta pro DEFAULT_PERIOD). Datas de calendario nao dependem de
// fuso: o fuso so entra ao resolver o range (resolvePeriodRange).
export function parseCustomRangeParams(start: string | null, end: string | null): CustomRange | undefined {
  if (!start || !end) return undefined;
  if (!isDateKey(start) || !isDateKey(end)) return undefined;
  if (compareKeys(start, end) > 0) return undefined;
  return { start, end };
}

// Numero de dias de calendario entre duas DateKey (b - a).
function daysBetweenKeys(a: DateKey, b: DateKey): number {
  return Math.round((dateKeyToDbDate(b).getTime() - dateKeyToDbDate(a).getTime()) / MS_PER_DAY);
}

// Periodo anterior = intervalo imediatamente anterior, de mesma duracao
// (secao 16 do prompt da Etapa 3). Para os periodos com alignment "month"
// (THIS_MONTH, LAST_MONTH, LAST_3/6_MONTHS, THIS_YEAR, LAST_YEAR), "mesma
// duracao" significa o mesmo NUMERO DE MESES civis: meses tem tamanhos
// diferentes (28-31 dias), entao subtrair milissegundos faria "mes anterior"
// cair no dia errado. Para alignment "day" (TODAY, LAST_7/30/90_DAYS, CUSTOM)
// a duracao e o mesmo NUMERO DE DIAS de calendario no fuso da empresa (e nao
// de milissegundos, que num dia de troca de horario de verao teria 23h/25h) -
// inclusive quando esses ranges comecam, por coincidencia, no dia 1 de um mes
// (por isso a checagem usa `range.alignment`).
export function getPreviousPeriodRange(range: PeriodRange): { start: Date; end: Date } {
  const { timeZone } = range;
  if (range.alignment === "month" && range.months.length > 0) {
    const { year, month } = zonedParts(range.start, timeZone);
    return { start: startOfMonth(year, month - 1 - range.months.length, timeZone), end: range.start };
  }

  const startKey = toDateKey(range.start, timeZone);
  const dayCount = daysBetweenKeys(startKey, toDateKey(range.end, timeZone));
  return { start: startOfDayInstant(addDays(startKey, -dayCount), timeZone), end: range.start };
}

// Opcoes de periodo da VISAO GERAL (Dashboard) - lista propria, mais curta que
// PERIOD_OPTIONS (que as demais paginas continuam usando). Rotulos proprios
// ("Mes passado"/"Ano passado"). Periodos antigos do Dashboard (TODAY,
// LAST_7/30/90_DAYS, LAST_6_MONTHS) nao sao mais oferecidos: a pagina os trata
// como o padrao (THIS_MONTH).
export const DASHBOARD_PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "THIS_MONTH", label: "Este mês" },
  { value: "LAST_MONTH", label: "Mês passado" },
  { value: "LAST_3_MONTHS", label: "Últimos 3 meses" },
  { value: "THIS_YEAR", label: "Este ano" },
  { value: "LAST_YEAR", label: "Ano passado" },
  { value: "CUSTOM", label: "Personalizado" },
];

// Recorta o range do mes anterior ate o MESMO dia-do-mes do periodo atual em
// andamento, para nunca comparar N dias do mes atual contra o mes anterior
// inteiro (o que inflaria uma queda/alta artificial so por o mes atual ainda
// nao ter terminado).
//
// Tratamento explicito do dia inexistente: montar uma data com um dia que
// nao existe naquele mes ROLA SILENCIOSAMENTE para o mes seguinte (ex.:
// 31/02 vira 2 ou 3 de marco, nao um erro) - por isso o dia de referencia e
// sempre clampado ao ultimo dia real do mes anterior antes de montar a data.
// "Dia 31" comparado a um fevereiro de 28 dias vira "fevereiro inteiro" (o
// melhor recorte possivel), nunca um vazamento para marco. Mes e dias
// resolvidos no fuso da empresa (Etapa F3a). (Movida de insights/snapshot.ts,
// que a reexporta - uma unica implementacao, usada tambem pela Visao Geral.)
export function clipToSameDayOfMonth(
  range: { start: Date; end: Date },
  referenceDay: number,
  timeZone: TimeZone
): { start: Date; end: Date } {
  const { year, month } = zonedParts(range.start, timeZone);
  const clampedDay = Math.min(referenceDay, lastDayOfMonth(year, month));
  return { start: range.start, end: zonedInstant(timeZone, year, month, clampedDay + 1) };
}

// Intervalo de COMPARACAO da Visao Geral: sempre o "periodo anterior
// equivalente", no fuso da empresa (DateKey, sem fuso do navegador):
// - Este mes: o mes anterior do dia 1 ate o MESMO dia de hoje (clampado ao ultimo
//   dia dele - 31/03 -> 28/02 ou 29/02);
// - Este ano: 1/jan do ano anterior ate o mesmo dia do ano (29/02 -> 28/02);
// - Mes passado / Ultimos 3 meses / Ano passado: os meses (ou o ano) civis
//   imediatamente anteriores, completos (getPreviousPeriodRange, alignment month);
// - Personalizado: o intervalo de mesma quantidade de dias imediatamente anterior.
// Quem pede so precisa do range e do relogio; o numero do periodo ATUAL nao
// depende disto.
export function resolveDashboardComparisonRange(
  period: PeriodKey,
  range: PeriodRange,
  clock: BusinessClock
): { start: Date; end: Date } {
  const { timeZone } = clock;
  const today = todayKey(clock);
  if (period === "THIS_MONTH") {
    return clipToSameDayOfMonth(getPreviousPeriodRange(range), parseDateKey(today).day, timeZone);
  }
  if (period === "THIS_YEAR") {
    const sameDayLastYear = addMonthsClamped(today, -12);
    return {
      start: startOfMonth(parseDateKey(today).year - 1, 0, timeZone),
      end: startOfDayInstant(addDays(sameDayLastYear, 1), timeZone),
    };
  }
  return getPreviousPeriodRange(range);
}

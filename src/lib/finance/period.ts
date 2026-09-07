export type PeriodKey =
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "LAST_3_MONTHS"
  | "LAST_6_MONTHS"
  | "THIS_YEAR"
  | "CUSTOM";

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "THIS_MONTH", label: "Este mês" },
  { value: "LAST_MONTH", label: "Mês anterior" },
  { value: "LAST_3_MONTHS", label: "Últimos 3 meses" },
  { value: "LAST_6_MONTHS", label: "Últimos 6 meses" },
  { value: "THIS_YEAR", label: "Este ano" },
  { value: "CUSTOM", label: "Personalizado" },
];

export const DEFAULT_PERIOD: PeriodKey = "THIS_MONTH";

export type MonthRef = { year: number; month: number }; // month: 0-11

export type PeriodRange = {
  start: Date;
  end: Date; // exclusivo
  months: MonthRef[];
};

export type CustomRange = { start: Date; end: Date }; // end inclusivo (data escolhida pelo usuario)

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1, 0, 0, 0, 0);
}

function monthsBetween(start: Date, endExclusive: Date): MonthRef[] {
  const months: MonthRef[] = [];
  let year = start.getFullYear();
  let month = start.getMonth();
  // Usa o ultimo instante realmente incluido no range (endExclusive - 1ms)
  // para achar o mes final - se comparassemos direto com endExclusive, um
  // fim de range que cai no meio de um mes (ex.: dia 6) excluiria esse mes
  // inteiro por engano.
  const inclusiveEnd = new Date(endExclusive.getTime() - 1);
  const endIndex = inclusiveEnd.getFullYear() * 12 + inclusiveEnd.getMonth();

  while (year * 12 + month <= endIndex) {
    months.push({ year, month });
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return months;
}

function monthsBack(year: number, month: number, count: number): PeriodRange {
  const start = startOfMonth(year, month - (count - 1));
  const end = startOfMonth(year, month + 1);
  const months: MonthRef[] = Array.from({ length: count }, (_, i) => {
    const d = new Date(year, month - (count - 1) + i, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  return { start, end, months };
}

// `customRange` so e usado (e obrigatorio) quando period === "CUSTOM". O `end`
// do range custom e tratado como inclusivo (o usuario escolhe "ate" um dia),
// entao internamente somamos 1 dia para virar o limite exclusivo usado nas
// queries.
export function resolvePeriodRange(
  period: PeriodKey,
  now: Date = new Date(),
  customRange?: CustomRange
): PeriodRange {
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (period) {
    case "THIS_MONTH": {
      const start = startOfMonth(year, month);
      const end = startOfMonth(year, month + 1);
      return { start, end, months: [{ year, month }] };
    }
    case "LAST_MONTH": {
      const start = startOfMonth(year, month - 1);
      const end = startOfMonth(year, month);
      return { start, end, months: [{ year: start.getFullYear(), month: start.getMonth() }] };
    }
    case "LAST_3_MONTHS":
      return monthsBack(year, month, 3);
    case "LAST_6_MONTHS":
      return monthsBack(year, month, 6);
    case "THIS_YEAR": {
      const start = new Date(year, 0, 1);
      const end = new Date(year + 1, 0, 1);
      const months: MonthRef[] = Array.from({ length: month + 1 }, (_, i) => ({ year, month: i }));
      return { start, end, months };
    }
    case "CUSTOM": {
      if (!customRange) {
        throw new Error("customRange é obrigatório quando period é CUSTOM.");
      }
      const start = new Date(
        customRange.start.getFullYear(),
        customRange.start.getMonth(),
        customRange.start.getDate()
      );
      const endExclusive = new Date(
        customRange.end.getFullYear(),
        customRange.end.getMonth(),
        customRange.end.getDate() + 1
      );
      return { start, end: endExclusive, months: monthsBetween(start, endExclusive) };
    }
  }
}

// Le start/end (yyyy-mm-dd) vindos de searchParams. Retorna undefined se
// nao forem duas datas validas - o chamador deve tratar isso como "sem
// range custom valido" (ex.: cair de volta pro DEFAULT_PERIOD).
export function parseCustomRangeParams(start: string | null, end: string | null): CustomRange | undefined {
  if (!start || !end) return undefined;
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return undefined;
  if (startDate.getTime() > endDate.getTime()) return undefined;
  return { start: startDate, end: endDate };
}

// Periodo anterior = intervalo imediatamente anterior, de mesma duracao
// (secao 16 do prompt da Etapa 3). Para os periodos alinhados a mes
// (THIS_MONTH, LAST_MONTH, LAST_3/6_MONTHS, THIS_YEAR - todos comecam no dia
// 1), "mesma duracao" significa o mesmo NUMERO DE MESES civis, nao os mesmos
// milissegundos: meses tem tamanhos diferentes (28-31 dias), entao subtrair
// milissegundos faria "mes anterior" cair no dia errado (ex.: fevereiro tem
// menos dias que marco). Só usamos subtracao por duracao em milissegundos
// para CUSTOM, onde nao ha um mes civil para alinhar.
export function getPreviousPeriodRange(range: PeriodRange): { start: Date; end: Date } {
  const isMonthAligned = range.start.getDate() === 1 && range.months.length > 0;

  if (isMonthAligned) {
    const monthCount = range.months.length;
    const start = new Date(range.start.getFullYear(), range.start.getMonth() - monthCount, 1);
    return { start, end: range.start };
  }

  const durationMs = range.end.getTime() - range.start.getTime();
  return {
    start: new Date(range.start.getTime() - durationMs),
    end: range.start,
  };
}

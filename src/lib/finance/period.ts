export type PeriodKey = "THIS_MONTH" | "LAST_MONTH" | "LAST_3_MONTHS" | "LAST_6_MONTHS" | "THIS_YEAR";

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "THIS_MONTH", label: "Este mês" },
  { value: "LAST_MONTH", label: "Mês anterior" },
  { value: "LAST_3_MONTHS", label: "Últimos 3 meses" },
  { value: "LAST_6_MONTHS", label: "Últimos 6 meses" },
  { value: "THIS_YEAR", label: "Este ano" },
];

export const DEFAULT_PERIOD: PeriodKey = "THIS_MONTH";

export type MonthRef = { year: number; month: number }; // month: 0-11

export type PeriodRange = {
  start: Date;
  end: Date; // exclusivo
  months: MonthRef[];
};

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1, 0, 0, 0, 0);
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

export function resolvePeriodRange(period: PeriodKey, now: Date = new Date()): PeriodRange {
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
  }
}

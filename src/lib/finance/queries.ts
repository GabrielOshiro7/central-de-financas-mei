import { prisma } from "@/lib/db";
import { summarizeEntries, type FinancialSummary } from "@/lib/finance/calculations";
import { resolvePeriodRange, type PeriodKey } from "@/lib/finance/period";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Sempre recebe o businessId ja resolvido a partir da sessao autenticada no
// server component/route handler chamador - nunca aceita um id vindo do
// cliente aqui, para nao abrir brecha de acesso cruzado entre usuarios.
export async function getFinancialSummary(
  businessId: string,
  period: PeriodKey,
  now: Date = new Date()
): Promise<FinancialSummary> {
  const { start, end } = resolvePeriodRange(period, now);

  const entries = await prisma.financialEntry.findMany({
    where: { businessId, occurredAt: { gte: start, lt: end } },
    select: { type: true, amount: true },
  });

  return summarizeEntries(entries);
}

export type MonthlyPoint = FinancialSummary & {
  year: number;
  month: number;
  label: string;
};

export async function getMonthlySeries(
  businessId: string,
  period: PeriodKey,
  now: Date = new Date()
): Promise<MonthlyPoint[]> {
  const { months } = resolvePeriodRange(period, now);
  const first = months[0];
  const last = months[months.length - 1];

  const entries = await prisma.financialEntry.findMany({
    where: {
      businessId,
      occurredAt: {
        gte: new Date(first.year, first.month, 1),
        lt: new Date(last.year, last.month + 1, 1),
      },
    },
    select: { type: true, amount: true, occurredAt: true },
  });

  return months.map(({ year, month }) => {
    const monthEntries = entries.filter(
      (e) => e.occurredAt.getFullYear() === year && e.occurredAt.getMonth() === month
    );
    return {
      year,
      month,
      label: MONTH_LABELS[month],
      ...summarizeEntries(monthEntries),
    };
  });
}

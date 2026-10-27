import { requireOnboardedUser } from "@/lib/auth/guards";
import { listVisibleCategories } from "@/lib/finance/categories";
import { resolvePeriodRange } from "@/lib/finance/period";
import { materializeRecurringBills } from "@/lib/finance/bills/materialize";
import { listBills, getBillSummary, hasAnyBillsEver, type BillFilters as BillQueryFilters, startOfBusinessToday } from "@/lib/finance/bills/queries";
import { listRecurringBills } from "@/lib/finance/bills/mutations";
import { deriveBillStatus, type BillDirection, type BillDisplayStatus } from "@/lib/finance/bills/status";
import { formatRecurringBillFrequencyLabel } from "@/lib/finance/bills/format";
import { DUE_SOON_OPTIONS } from "@/lib/finance/bills/options";
import { BillFilters as BillFiltersBar } from "@/components/financeiro/BillFilters";
import { BillTable, type BillRow } from "@/components/financeiro/BillTable";
import { BillSummaryCards } from "@/components/financeiro/BillSummaryCards";
import { RecurringBillTable, type RecurringBillRow } from "@/components/financeiro/RecurringBillTable";
import { NewBillButton } from "@/components/financeiro/NewBillButton";
import { InfoTooltip } from "@/components/InfoTooltip";
import { addDays, clockFor, formatZonedDate, startOfDayInstant, toDateKey, todayKey } from "@/lib/time/zoned";

const VALID_STATUSES = new Set<string>(["PENDING", "OVERDUE", "PAID", "CANCELLED"]);
const VALID_DUE = new Set<string>(DUE_SOON_OPTIONS.map((o) => o.value));

type SearchParams = { [key: string]: string | string[] | undefined };

function paramString(searchParams: SearchParams, key: string): string | undefined {
  const value = searchParams[key];
  return typeof value === "string" ? value : undefined;
}

// Helper compartilhado pelas paginas Contas a pagar/Contas a receber (mesmo
// espirito de TransactionListPage) - so pre-filtrado por direcao (derivada
// de category.type, nunca um campo redundante na Bill).
export async function BillListPage({
  direction,
  title,
  helpText,
  searchParams,
}: {
  direction: BillDirection;
  title: string;
  helpText: string;
  searchParams: SearchParams;
}) {
  const { business } = await requireOnboardedUser();
  // Relogio da empresa (fuso + agora): "hoje", vencimento e "vencendo em N
  // dias" sao dias de calendario no fuso dela (Etapa F3b).
  const clock = clockFor(business);
  await materializeRecurringBills(business.id, clock);

  const statusParam = paramString(searchParams, "status");
  const displayStatus: BillDisplayStatus | undefined =
    statusParam && VALID_STATUSES.has(statusParam) ? (statusParam as BillDisplayStatus) : undefined;

  const categoryId = paramString(searchParams, "categoryId");
  const search = paramString(searchParams, "q");

  const dueParam = paramString(searchParams, "due");
  const dueOption = dueParam && VALID_DUE.has(dueParam) ? DUE_SOON_OPTIONS.find((o) => o.value === dueParam) : undefined;
  const dueRange = dueOption
    ? {
        start: startOfBusinessToday(clock),
        end: startOfDayInstant(addDays(todayKey(clock), dueOption.days + 1), clock.timeZone),
      }
    : undefined;

  const filters: BillQueryFilters = {
    direction,
    displayStatus,
    categoryId,
    search,
    dueRange,
    pageSize: 100,
  };

  const categoryType = direction === "PAYABLE" ? undefined : "REVENUE";
  const paidRange = resolvePeriodRange("THIS_MONTH", clock);

  const [{ items }, hasAnyEver, summary, recurringBills, allCategories] = await Promise.all([
    listBills(business.id, filters, clock),
    hasAnyBillsEver(business.id, direction),
    getBillSummary(business.id, direction, paidRange, clock),
    listRecurringBills(business.id, direction),
    direction === "PAYABLE"
      ? Promise.all([listVisibleCategories(business.id, "COST"), listVisibleCategories(business.id, "EXPENSE")]).then(
          ([cost, expense]) => [...cost, ...expense]
        )
      : listVisibleCategories(business.id, categoryType),
  ]);

  const categories = allCategories.map((c) => ({ id: c.id, name: c.name }));

  const rows: BillRow[] = items.map((item) => ({
    id: item.id,
    description: item.description,
    counterpartyName: item.counterpartyName ?? "",
    categoryId: item.categoryId,
    categoryName: item.category.name,
    dueDateDisplay: formatZonedDate(item.dueDate, clock.timeZone),
    dueDateInput: toDateKey(item.dueDate, clock.timeZone),
    issueDateInput: item.issueDate ? toDateKey(item.issueDate, clock.timeZone) : "",
    amount: item.amount.toString(),
    displayStatus: deriveBillStatus(item, clock),
    paidAtDisplay: item.paidAt ? formatZonedDate(item.paidAt, clock.timeZone) : null,
    documentNumber: item.documentNumber ?? "",
    paymentMethod: item.paymentMethod ?? "",
    bankAccount: item.bankAccount ?? "",
    costCenter: item.costCenter ?? "",
    notes: item.notes ?? "",
  }));

  const recurringRows: RecurringBillRow[] = recurringBills.map((entry) => ({
    id: entry.id,
    categoryId: entry.categoryId,
    categoryName: entry.category.name,
    description: entry.description,
    amount: entry.amount.toString(),
    frequencyLabel: formatRecurringBillFrequencyLabel(entry),
    frequency: entry.frequency,
    dayOfWeek: entry.dayOfWeek,
    dayOfMonth: entry.dayOfMonth,
    yearMonth: entry.yearMonth,
    startDateDisplay: formatZonedDate(entry.startDate, clock.timeZone),
    startDateInput: toDateKey(entry.startDate, clock.timeZone),
    endDateDisplay: entry.endDate ? formatZonedDate(entry.endDate, clock.timeZone) : null,
    endDateInput: entry.endDate ? toDateKey(entry.endDate, clock.timeZone) : "",
    documentNumber: entry.documentNumber ?? "",
    counterpartyName: entry.counterpartyName ?? "",
    paymentMethod: entry.paymentMethod ?? "",
    bankAccount: entry.bankAccount ?? "",
    costCenter: entry.costCenter ?? "",
    notes: entry.notes ?? "",
    isActive: entry.isActive,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">{title}</h1>
          <InfoTooltip text={helpText} />
        </div>
        {hasAnyEver && <NewBillButton direction={direction} categories={categories} currency={business.currency} todayKey={todayKey(clock)} />}
      </div>

      {!hasAnyEver ? (
        <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
          <p>{direction === "PAYABLE" ? "Nenhuma conta a pagar cadastrada." : "Nenhuma conta a receber cadastrada."}</p>
          <NewBillButton direction={direction} categories={categories} currency={business.currency} todayKey={todayKey(clock)} />
        </div>
      ) : (
        <>
          <BillSummaryCards direction={direction} summary={summary} currency={business.currency} />
          <BillFiltersBar direction={direction} categories={categories} />
          <BillTable rows={rows} direction={direction} categories={categories} currency={business.currency} todayKey={todayKey(clock)} />
          <RecurringBillTable
            rows={recurringRows}
            direction={direction}
            categories={categories}
            currency={business.currency}
          />
        </>
      )}
    </div>
  );
}

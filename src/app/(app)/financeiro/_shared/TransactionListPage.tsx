import type { EntrySource, FinancialEntryType } from "@prisma/client";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { materializeRecurringEntries } from "@/lib/finance/recurring/materialize";
import { listTransactions } from "@/lib/finance/queries";
import { listVisibleCategories } from "@/lib/finance/categories";
import {
  resolvePeriodRange,
  parseCustomRangeParams,
  PERIOD_OPTIONS,
  DEFAULT_PERIOD,
  type PeriodKey,
} from "@/lib/finance/period";
import { TransactionFilters } from "@/components/financeiro/TransactionFilters";
import { TransactionTable, type TransactionRow } from "@/components/financeiro/TransactionTable";
import { NewTransactionButton } from "@/components/financeiro/NewTransactionButton";
import { NEW_ENTRY_LABELS } from "@/lib/finance/options";
import { InfoTooltip } from "@/components/InfoTooltip";
import { clockFor } from "@/lib/time/zoned";

const VALID_PERIODS = new Set<string>(PERIOD_OPTIONS.map((o) => o.value));
const VALID_SOURCES = new Set<string>(["MANUAL", "IMPORT"]);

function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString("pt-BR");
}

function formatDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type SearchParams = { [key: string]: string | string[] | undefined };

function paramString(searchParams: SearchParams, key: string): string | undefined {
  const value = searchParams[key];
  return typeof value === "string" ? value : undefined;
}

// Helper compartilhado pelas paginas Receitas/Custos/Despesas (secao 2 do
// prompt: mesma listagem, so pre-filtrada por tipo) - evita triplicar a
// logica de filtros/query/mapeamento em cada uma.
export async function TransactionListPage({
  type,
  title,
  helpText,
  searchParams,
}: {
  type: FinancialEntryType;
  title: string;
  helpText: string;
  searchParams: SearchParams;
}) {
  const { user, business } = await requireOnboardedUser();
  await materializeRecurringEntries(business.id, user.id);

  const periodParam = paramString(searchParams, "period");
  const period: PeriodKey =
    periodParam && VALID_PERIODS.has(periodParam) ? (periodParam as PeriodKey) : DEFAULT_PERIOD;

  const customRange =
    period === "CUSTOM"
      ? parseCustomRangeParams(paramString(searchParams, "start") ?? null, paramString(searchParams, "end") ?? null)
      : undefined;
  const effectivePeriod: PeriodKey = period === "CUSTOM" && !customRange ? DEFAULT_PERIOD : period;

  const categoryId = paramString(searchParams, "categoryId");
  const sourceParam = paramString(searchParams, "source");
  const source = sourceParam && VALID_SOURCES.has(sourceParam) ? (sourceParam as EntrySource) : undefined;

  const range = resolvePeriodRange(effectivePeriod, clockFor(business), customRange);

  const [{ items }, categories] = await Promise.all([
    listTransactions(business.id, { type, categoryId, source, range, pageSize: 100 }),
    listVisibleCategories(business.id, type),
  ]);

  // Mesma lista (só do tipo da aba) pro modal de criação e pro de edição.
  const modalCategories = categories.map((c) => ({ id: c.id, name: c.name, type: c.type }));

  const rows: TransactionRow[] = items.map((item) => ({
    id: item.id,
    type: item.type,
    occurredAtDisplay: formatDateDisplay(item.occurredAt),
    occurredAtInput: formatDateInput(item.occurredAt),
    description: item.description,
    categoryId: item.categoryId,
    categoryName: item.category.name,
    amount: item.amount.toString(),
    notes: item.notes ?? "",
    source: item.source,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">{title}</h1>
        <InfoTooltip text={helpText} />
      </div>
      <TransactionFilters
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        action={
          <NewTransactionButton
            label={NEW_ENTRY_LABELS[type]}
            categories={modalCategories}
            currency={business.currency}
            defaultType={type}
            lockType
            className="grow"
          />
        }
      />
      <TransactionTable rows={rows} categories={modalCategories} currency={business.currency} />
    </div>
  );
}

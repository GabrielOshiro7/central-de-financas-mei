import { requireOnboardedUser } from "@/lib/auth/guards";
import { listRecurringEntries } from "@/lib/finance/recurring/mutations";
import { formatFrequencyLabel } from "@/lib/finance/recurring/format";
import { listVisibleCategories } from "@/lib/finance/categories";
import { RecurringEntryTable, type RecurringEntryRow } from "@/components/financeiro/RecurringEntryTable";

function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString("pt-BR");
}

function formatDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function RecurringEntriesPage() {
  const { business } = await requireOnboardedUser();

  const [entries, revenueCategories, costCategories, expenseCategories] = await Promise.all([
    listRecurringEntries(business.id),
    listVisibleCategories(business.id, "REVENUE"),
    listVisibleCategories(business.id, "COST"),
    listVisibleCategories(business.id, "EXPENSE"),
  ]);

  const categories = [...revenueCategories, ...costCategories, ...expenseCategories].map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
  }));

  const rows: RecurringEntryRow[] = entries.map((entry) => ({
    id: entry.id,
    type: entry.type,
    categoryId: entry.categoryId,
    categoryName: entry.category.name,
    description: entry.description,
    amount: entry.amount.toString(),
    frequencyLabel: formatFrequencyLabel(entry),
    frequency: entry.frequency,
    dayOfWeek: entry.dayOfWeek,
    dayOfMonth: entry.dayOfMonth,
    yearMonth: entry.yearMonth,
    startDateDisplay: formatDateDisplay(entry.startDate),
    startDateInput: formatDateInput(entry.startDate),
    endDateDisplay: entry.endDate ? formatDateDisplay(entry.endDate) : null,
    endDateInput: entry.endDate ? formatDateInput(entry.endDate) : "",
    isActive: entry.isActive,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Lançamentos recorrentes</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
          Moldes que geram lançamentos automaticamente. Para criar um novo, marque &quot;Recorrente&quot; ao
          adicionar um lançamento em Receitas, Custos ou Despesas.
        </p>
      </div>
      <RecurringEntryTable rows={rows} categories={categories} currency={business.currency} />
    </div>
  );
}

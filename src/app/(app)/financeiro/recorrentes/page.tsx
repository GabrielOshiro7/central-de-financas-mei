import { requireOnboardedUser } from "@/lib/auth/guards";
import { listRecurringEntries } from "@/lib/finance/recurring/mutations";
import { formatFrequencyLabel } from "@/lib/finance/recurring/format";
import { listVisibleCategories } from "@/lib/finance/categories";
import { RecurringEntryTable, type RecurringEntryRow } from "@/components/financeiro/RecurringEntryTable";
import { InfoTooltip } from "@/components/InfoTooltip";
import { NewTransactionButton } from "@/components/financeiro/NewTransactionButton";
import { clockFor, formatZonedDate, toDateKey, todayKey } from "@/lib/time/zoned";

export default async function RecurringEntriesPage() {
  const { business } = await requireOnboardedUser();
  // Datas exibidas e "hoje" dos formularios no fuso da empresa (Etapa F4).
  const clock = clockFor(business);
  const timeZone = clock.timeZone;

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
    startDateDisplay: formatZonedDate(entry.startDate, timeZone),
    startDateInput: toDateKey(entry.startDate, timeZone),
    endDateDisplay: entry.endDate ? formatZonedDate(entry.endDate, timeZone) : null,
    endDateInput: entry.endDate ? toDateKey(entry.endDate, timeZone) : "",
    isActive: entry.isActive,
  }));

  // Seletor de tipo visível (a aba mistura os três tipos) e recorrência
  // travada. Com itens, fica à direita acima da tabela; sem itens, só como
  // CTA do estado vazio - nunca os dois ao mesmo tempo.
  const newButton = (
    <NewTransactionButton
      label="Novo lançamento recorrente"
      categories={categories}
      currency={business.currency}
      lockRecurring
      className="max-sm:w-full"
      todayKey={todayKey(clock)}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Lançamentos recorrentes</h1>
          <InfoTooltip text="Lançamentos que se repetem automaticamente a cada período (ex.: todo mês), sem você precisar cadastrar de novo toda vez." />
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
          Para criar um, use o botão &quot;Novo lançamento recorrente&quot; - ou marque &quot;Recorrente&quot; ao adicionar
          um lançamento em Receitas, Custos ou Despesas.
        </p>
      </div>
      {rows.length > 0 && <div className="flex justify-end">{newButton}</div>}
      <RecurringEntryTable
        rows={rows}
        categories={categories}
        currency={business.currency}
        emptyAction={newButton}
      />
    </div>
  );
}

"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Currency, FinancialEntryType, RecurrenceFrequency } from "@prisma/client";
import { FormField } from "@/components/FormField";
import { MoneyField } from "@/components/MoneyInput";
import { SubmitButton } from "@/components/SubmitButton";
import { ENTRY_TYPE_OPTIONS } from "@/lib/finance/options";
import { FREQUENCY_OPTIONS, WEEKDAY_OPTIONS, MONTH_OPTIONS } from "@/lib/finance/recurring/options";
import type { CategoryOption } from "@/components/financeiro/TransactionFormModal";

export type RecurringEntryFormInitial = {
  id: string;
  type: FinancialEntryType;
  categoryId: string;
  description: string;
  amount: string;
  frequency: RecurrenceFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  yearMonth: number | null;
  startDate: string; // yyyy-mm-dd
  endDate: string; // yyyy-mm-dd ou ""
};

// Edicao de um molde ja existente (Etapa 4.1) - formulario separado do
// TransactionFormModal porque os campos sao outros (frequencia, dia da
// semana/mes, data de fim) em vez de data/observacao de uma unica ocorrencia.
// Editar aqui NUNCA altera FinancialEntry ja materializados - so os dados do
// molde, que passam a valer pras proximas materializacoes (ver
// updateRecurringEntry).
export function RecurringEntryFormModal({
  open,
  onClose,
  categories,
  currency,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryOption[];
  currency: Currency | null;
  initial: RecurringEntryFormInitial;
}) {
  const router = useRouter();

  const [type, setType] = useState<FinancialEntryType>(initial.type);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [description, setDescription] = useState(initial.description);
  const [amount, setAmount] = useState(initial.amount);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(initial.frequency);
  const [dayOfWeek, setDayOfWeek] = useState(initial.dayOfWeek ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(initial.dayOfMonth ?? 1);
  const [yearMonth, setYearMonth] = useState(initial.yearMonth ?? 0);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const categoriesForType = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const payload = {
        type,
        categoryId,
        description,
        amount,
        frequency,
        dayOfWeek: frequency === "WEEKLY" ? dayOfWeek : undefined,
        dayOfMonth: frequency === "MONTHLY" || frequency === "YEARLY" ? dayOfMonth : undefined,
        yearMonth: frequency === "YEARLY" ? yearMonth : undefined,
        startDate,
        endDate: endDate || undefined,
      };
      const res = await fetch(`/api/financeiro/recurring/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Não foi possível salvar a recorrência.");
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto bg-white p-6 shadow-lg dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Editar recorrência</h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
          As alterações valem só para as próximas ocorrências - o que já foi lançado não muda.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4" noValidate>
          <div>
            <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-neutral-300">Tipo</span>
            <div className="flex gap-2">
              {ENTRY_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setType(opt.value);
                    setCategoryId("");
                  }}
                  className={`flex-1 border px-3 py-2 text-sm font-medium transition ${
                    type === opt.value
                      ? "border-gray-900 bg-gray-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                      : "border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <FormField
            id="description"
            label="Descrição"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div>
            <label htmlFor="categoryId" className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300">
              Categoria
            </label>
            <select
              id="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {categoriesForType.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <MoneyField id="amount" label="Valor" currency={currency} value={amount} onChange={setAmount} />

          <div>
            <label htmlFor="frequency" className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300">
              Frequência
            </label>
            <select
              id="frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
              className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {frequency === "WEEKLY" && (
            <div>
              <label htmlFor="dayOfWeek" className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300">
                Dia da semana
              </label>
              <select
                id="dayOfWeek"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              >
                {WEEKDAY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(frequency === "MONTHLY" || frequency === "YEARLY") && (
            <div className="flex gap-3">
              {frequency === "YEARLY" && (
                <div className="flex-1">
                  <label htmlFor="yearMonth" className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300">
                    Mês
                  </label>
                  <select
                    id="yearMonth"
                    value={yearMonth}
                    onChange={(e) => setYearMonth(Number(e.target.value))}
                    className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  >
                    {MONTH_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex-1">
                <FormField
                  id="dayOfMonth"
                  label="Dia do mês"
                  type="number"
                  min={1}
                  max={31}
                  value={String(dayOfMonth)}
                  onChange={(e) => setDayOfMonth(Number(e.target.value))}
                />
              </div>
            </div>
          )}

          <FormField
            id="startDate"
            label="Data de início"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />

          <FormField
            id="endDate"
            label="Data de fim (opcional)"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Cancelar
            </button>
            <div className="flex-1">
              <SubmitButton pending={pending} pendingText="Salvando...">
                Salvar
              </SubmitButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

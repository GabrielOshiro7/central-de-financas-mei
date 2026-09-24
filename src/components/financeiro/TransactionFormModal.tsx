"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Currency, FinancialEntryType, RecurrenceFrequency } from "@prisma/client";
import { FormField } from "@/components/FormField";
import { MoneyField } from "@/components/MoneyInput";
import { SubmitButton } from "@/components/SubmitButton";
import { ENTRY_TYPE_OPTIONS } from "@/lib/finance/options";
import { FREQUENCY_OPTIONS, WEEKDAY_OPTIONS, MONTH_OPTIONS } from "@/lib/finance/recurring/options";

export type CategoryOption = { id: string; name: string; type: FinancialEntryType };

export type TransactionFormInitial = {
  id: string;
  type: FinancialEntryType;
  occurredAt: string; // yyyy-mm-dd
  description: string;
  categoryId: string;
  amount: string;
  notes: string;
};

const NEW_CATEGORY_VALUE = "__new__";

function todayInputValue(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function TransactionFormModal({
  open,
  onClose,
  categories,
  currency,
  defaultType,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryOption[];
  currency: Currency | null;
  defaultType?: FinancialEntryType;
  initial?: TransactionFormInitial | null;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const isEditing = Boolean(initial);

  const [type, setType] = useState<FinancialEntryType>(initial?.type ?? defaultType ?? "REVENUE");
  const [occurredAt, setOccurredAt] = useState(initial?.occurredAt ?? todayInputValue());
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [localCategories, setLocalCategories] = useState<CategoryOption[]>(categories);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);

  // Recorrencia (Etapa 4.1) - so faz sentido ao CRIAR um lancamento novo,
  // nunca ao editar uma ocorrencia ja materializada (isso nao deve afetar o
  // molde nem virar uma recorrencia nova - ver "CANCELAMENTO / EXCLUSAO" e
  // "MUDANCA DE VALOR" do prompt da Etapa 4.1).
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("MONTHLY");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [yearMonth, setYearMonth] = useState(0);
  const [endDate, setEndDate] = useState("");

  const categoriesForType = useMemo(
    () => localCategories.filter((c) => c.type === type),
    [localCategories, type]
  );

  if (!open) return null;

  const showPastStartDateWarning = isRecurring && occurredAt < todayInputValue();

  function reset() {
    setType(defaultType ?? "REVENUE");
    setOccurredAt(todayInputValue());
    setDescription("");
    setCategoryId("");
    setAmount("");
    setNotes("");
    setNewCategoryName("");
    setError(null);
    setIsRecurring(false);
    setFrequency("MONTHLY");
    setDayOfWeek(1);
    setDayOfMonth(1);
    setYearMonth(0);
    setEndDate("");
  }

  function handleClose() {
    if (!isEditing) reset();
    onClose();
  }

  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    setCreatingCategory(true);
    setError(null);
    try {
      const res = await fetch("/api/financeiro/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, name }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Não foi possível criar a categoria.");
        return;
      }
      const created: CategoryOption = result.category;
      setLocalCategories((prev) => [...prev, created]);
      setCategoryId(created.id);
      setNewCategoryName("");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setCreatingCategory(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!categoryId || categoryId === NEW_CATEGORY_VALUE) {
      setError("Selecione ou crie uma categoria.");
      return;
    }

    setPending(true);
    try {
      const url =
        isRecurring && !isEditing
          ? "/api/financeiro/recurring"
          : isEditing
            ? `/api/financeiro/transactions/${initial!.id}`
            : "/api/financeiro/transactions";

      const payload =
        isRecurring && !isEditing
          ? {
              type,
              categoryId,
              description,
              amount,
              frequency,
              dayOfWeek: frequency === "WEEKLY" ? dayOfWeek : undefined,
              dayOfMonth: frequency === "MONTHLY" || frequency === "YEARLY" ? dayOfMonth : undefined,
              yearMonth: frequency === "YEARLY" ? yearMonth : undefined,
              startDate: occurredAt,
              endDate: endDate || undefined,
            }
          : { type, occurredAt, description, categoryId, amount, notes: notes || undefined };

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Não foi possível salvar o lançamento.");
        return;
      }
      if (!isEditing) reset();
      onSaved?.();
      router.refresh();
      onClose();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={handleClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-lg dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
          {isEditing ? "Editar lançamento" : "Novo lançamento"}
        </h2>

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
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
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
            id="occurredAt"
            label={isRecurring ? "Data de início" : "Data"}
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />

          <FormField
            id="description"
            label="Descrição"
            placeholder="Ex.: Venda de produto"
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <option value="">Selecione...</option>
              {categoriesForType.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NEW_CATEGORY_VALUE}>+ Nova categoria</option>
            </select>

            {categoryId === NEW_CATEGORY_VALUE && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Nome da nova categoria"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  disabled={creatingCategory || !newCategoryName.trim()}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  {creatingCategory ? "Criando..." : "Criar"}
                </button>
              </div>
            )}
          </div>

          <MoneyField id="amount" label="Valor" currency={currency} value={amount} onChange={setAmount} />

          {!isEditing && (
            <div className="rounded-lg border border-gray-200 p-3 dark:border-neutral-700">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 dark:border-neutral-600"
                />
                Recorrente
              </label>

              {isRecurring && (
                <div className="mt-3 flex flex-col gap-3">
                  <div>
                    <label htmlFor="frequency" className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300">
                      Frequência
                    </label>
                    <select
                      id="frequency"
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
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
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
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
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
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
                        <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
                          Em meses/anos sem esse dia, usa o último dia disponível.
                        </p>
                      </div>
                    </div>
                  )}

                  <FormField
                    id="endDate"
                    label="Data de fim (opcional)"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />

                  {showPastStartDateWarning && (
                    <p role="alert" className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      Isso pode gerar lançamentos duplicados se você já tiver registrado esses meses
                      manualmente. Revise antes de confirmar.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="notes" className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300">
              Observação (opcional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
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

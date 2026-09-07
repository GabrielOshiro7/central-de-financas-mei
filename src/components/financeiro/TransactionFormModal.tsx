"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Currency, FinancialEntryType } from "@prisma/client";
import { FormField } from "@/components/FormField";
import { SubmitButton } from "@/components/SubmitButton";
import { ENTRY_TYPE_OPTIONS } from "@/lib/finance/options";

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

  const categoriesForType = useMemo(
    () => localCategories.filter((c) => c.type === type),
    [localCategories, type]
  );

  if (!open) return null;

  function reset() {
    setType(defaultType ?? "REVENUE");
    setOccurredAt(todayInputValue());
    setDescription("");
    setCategoryId("");
    setAmount("");
    setNotes("");
    setNewCategoryName("");
    setError(null);
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
      const payload = { type, occurredAt, description, categoryId, amount, notes: notes || undefined };
      const res = await fetch(
        isEditing ? `/api/financeiro/transactions/${initial!.id}` : "/api/financeiro/transactions",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
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
            label="Data"
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

          <FormField
            id="amount"
            label="Valor"
            type="number"
            min={0}
            step={currency === "JPY" ? 1 : 0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />

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

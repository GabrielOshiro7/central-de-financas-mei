"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Currency, EntrySource, FinancialEntryType } from "@prisma/client";
import { ENTRY_TYPE_LABELS, SOURCE_LABELS } from "@/lib/finance/options";
import { formatMoney } from "@/lib/money";
import { ConfirmDialog } from "@/components/financeiro/ConfirmDialog";
import { TransactionFormModal, type CategoryOption } from "@/components/financeiro/TransactionFormModal";

export type TransactionRow = {
  id: string;
  type: FinancialEntryType;
  occurredAtDisplay: string;
  occurredAtInput: string;
  description: string;
  categoryId: string;
  categoryName: string;
  amount: string;
  notes: string;
  source: EntrySource;
};

const TYPE_BADGE_STYLE: Record<FinancialEntryType, string> = {
  REVENUE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  COST: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  EXPENSE: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

export function TransactionTable({
  rows,
  categories,
  currency,
}: {
  rows: TransactionRow[];
  categories: CategoryOption[];
  currency: Currency | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [deleting, setDeleting] = useState<TransactionRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/financeiro/transactions/${deleting.id}`, { method: "DELETE" });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(result.error ?? "Não foi possível excluir o lançamento.");
        return;
      }
      setDeleting(null);
      router.refresh();
    } catch {
      setDeleteError("Erro de conexão. Tente novamente.");
    } finally {
      setDeletePending(false);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
        Nenhum lançamento encontrado para os filtros selecionados.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-neutral-800 dark:text-neutral-400">
            <th className="px-4 py-3 font-medium">Data</th>
            <th className="px-4 py-3 font-medium">Tipo</th>
            <th className="px-4 py-3 font-medium">Categoria</th>
            <th className="px-4 py-3 font-medium">Descrição</th>
            <th className="px-4 py-3 text-right font-medium">Valor</th>
            <th className="px-4 py-3 font-medium">Origem</th>
            <th className="px-4 py-3 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-100 last:border-0 dark:border-neutral-800">
              <td className="px-4 py-3 text-gray-700 dark:text-neutral-300">{row.occurredAtDisplay}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE_STYLE[row.type]}`}>
                  {ENTRY_TYPE_LABELS[row.type]}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-700 dark:text-neutral-300">{row.categoryName}</td>
              <td className="px-4 py-3 text-gray-900 dark:text-neutral-100">{row.description}</td>
              <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-neutral-100">
                {currency ? formatMoney(row.amount, currency) : row.amount}
              </td>
              <td className="px-4 py-3 text-gray-500 dark:text-neutral-400">{SOURCE_LABELS[row.source]}</td>
              <td className="px-4 py-3">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleting(row);
                      setDeleteError(null);
                    }}
                    className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
                  >
                    Excluir
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <TransactionFormModal
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          categories={categories}
          currency={currency}
          initial={{
            id: editing.id,
            type: editing.type,
            occurredAt: editing.occurredAtInput,
            description: editing.description,
            categoryId: editing.categoryId,
            amount: editing.amount,
            notes: editing.notes,
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir lançamento"
        message="Tem certeza que deseja excluir este lançamento?"
        confirmLabel="Excluir"
        pending={deletePending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleting(null)}
      />
      {deleteError && (
        <p role="alert" className="px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {deleteError}
        </p>
      )}
    </div>
  );
}

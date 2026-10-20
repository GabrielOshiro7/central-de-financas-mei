"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Currency, FinancialEntryType, RecurrenceFrequency } from "@prisma/client";
import { ENTRY_TYPE_BADGE_STYLE, ENTRY_TYPE_LABELS } from "@/lib/finance/options";
import { formatMoney } from "@/lib/money";
import { ConfirmDialog } from "@/components/financeiro/ConfirmDialog";
import {
  RecurringEntryFormModal,
  type RecurringEntryFormInitial,
} from "@/components/financeiro/RecurringEntryFormModal";
import type { CategoryOption } from "@/components/financeiro/TransactionFormModal";

export type RecurringEntryRow = {
  id: string;
  type: FinancialEntryType;
  categoryId: string;
  categoryName: string;
  description: string;
  amount: string;
  frequencyLabel: string;
  frequency: RecurrenceFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  yearMonth: number | null;
  startDateDisplay: string;
  startDateInput: string;
  endDateDisplay: string | null;
  endDateInput: string;
  isActive: boolean;
};

export function RecurringEntryTable({
  rows,
  categories,
  currency,
}: {
  rows: RecurringEntryRow[];
  categories: CategoryOption[];
  currency: Currency | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<RecurringEntryRow | null>(null);
  const [deleting, setDeleting] = useState<RecurringEntryRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  async function handleToggleActive(row: RecurringEntryRow) {
    setTogglingId(row.id);
    setToggleError(null);
    try {
      const res = await fetch(`/api/financeiro/recurring/${row.id}/active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToggleError(result.error ?? "Não foi possível atualizar a recorrência.");
        return;
      }
      router.refresh();
    } catch {
      setToggleError("Erro de conexão. Tente novamente.");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/financeiro/recurring/${deleting.id}`, { method: "DELETE" });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(result.error ?? "Não foi possível excluir a recorrência.");
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
        Nenhum lançamento recorrente cadastrado.
      </div>
    );
  }

  return (
    <div className="rtable-wrap overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <table role="table" className="rtable w-full min-w-[820px] text-sm">
        <thead role="rowgroup">
          <tr role="row" className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-neutral-800 dark:text-neutral-400">
            <th role="columnheader" className="px-4 py-3 font-medium">Descrição</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Tipo</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Categoria</th>
            <th role="columnheader" className="px-4 py-3 text-right font-medium">Valor</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Frequência</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Início</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Status</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => (
            <tr role="row" key={row.id} className="border-b border-gray-100 last:border-0 dark:border-neutral-800">
              <td role="cell" className="px-4 py-3 text-gray-900 dark:text-neutral-100 rt-title"><span className="rt-sr">Descrição: </span>{row.description}</td>
              <td role="cell" data-label="Tipo" className="px-4 py-3 rt-key"><span className="rt-sr">Tipo: </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ENTRY_TYPE_BADGE_STYLE[row.type]}`}>
                  {ENTRY_TYPE_LABELS[row.type]}
                </span>
              </td>
              <td role="cell" data-label="Categoria" className="px-4 py-3 text-gray-700 dark:text-neutral-300 rt-sub"><span className="rt-sr">Categoria: </span>{row.categoryName}</td>
              <td role="cell" data-label="Valor" className="px-4 py-3 text-right font-medium text-gray-900 dark:text-neutral-100 rt-key"><span className="rt-sr">Valor: </span>
                {currency ? formatMoney(row.amount, currency) : row.amount}
              </td>
              <td role="cell" data-label="Frequência" className="px-4 py-3 text-gray-700 dark:text-neutral-300 rt-key"><span className="rt-sr">Frequência: </span>{row.frequencyLabel}</td>
              <td role="cell" data-label="Início" className="px-4 py-3 text-gray-700 dark:text-neutral-300 rt-sub"><span className="rt-sr">Início: </span>
                {row.startDateDisplay}
                {row.endDateDisplay && ` até ${row.endDateDisplay}`}
              </td>
              <td role="cell" data-label="Status" className="px-4 py-3 rt-sub"><span className="rt-sr">Status: </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    row.isActive
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  {row.isActive ? "Ativa" : "Pausada"}
                </span>
              </td>
              <td role="cell" className="px-4 py-3 rt-actions">
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(row)}
                    disabled={togglingId === row.id}
                    className="text-sm font-medium text-gray-600 hover:underline disabled:opacity-60 dark:text-neutral-400"
                  >
                    {togglingId === row.id ? "..." : row.isActive ? "Pausar" : "Retomar"}
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

      {toggleError && (
        <p role="alert" className="px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {toggleError}
        </p>
      )}

      {editing && (
        <RecurringEntryFormModal
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          categories={categories}
          currency={currency}
          initial={
            {
              id: editing.id,
              type: editing.type,
              categoryId: editing.categoryId,
              description: editing.description,
              amount: editing.amount,
              frequency: editing.frequency,
              dayOfWeek: editing.dayOfWeek,
              dayOfMonth: editing.dayOfMonth,
              yearMonth: editing.yearMonth,
              startDate: editing.startDateInput,
              endDate: editing.endDateInput,
            } satisfies RecurringEntryFormInitial
          }
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir recorrência"
        message='Tem certeza que deseja excluir esta recorrência? Os lançamentos já gerados por ela permanecem no histórico (viram lançamentos avulsos), só a geração de novas ocorrências é interrompida.'
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

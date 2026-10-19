"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";
import type { Currency, EntrySource, FinancialEntryType } from "@prisma/client";
import { ENTRY_TYPE_LABELS, SOURCE_LABELS } from "@/lib/finance/options";
import { formatMoney } from "@/lib/money";
import { ConfirmDialog } from "@/components/financeiro/ConfirmDialog";
import { TransactionFormModal, type CategoryOption } from "@/components/financeiro/TransactionFormModal";
import { ReauthModal } from "@/components/ReauthModal";

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
  // Fica true quando o servidor recusa a exclusao por falta de sessao
  // elevada (403 REAUTH_REQUIRED) - abre o modal de reauth em vez de so
  // mostrar um erro; ao confirmar a senha, a exclusao e refeita sozinha.
  const [needsReauth, setNeedsReauth] = useState(false);

  async function runDelete(id: string) {
    const res = await fetch(`/api/financeiro/transactions/${id}`, { method: "DELETE" });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 403 && result.error === "REAUTH_REQUIRED") {
        setNeedsReauth(true);
        return false;
      }
      setDeleteError(result.error ?? "Não foi possível excluir o lançamento.");
      return false;
    }
    return true;
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const ok = await runDelete(deleting.id);
      if (ok) {
        setDeleting(null);
        router.refresh();
      }
    } catch {
      setDeleteError("Erro de conexão. Tente novamente.");
    } finally {
      setDeletePending(false);
    }
  }

  async function handleReauthConfirmed() {
    setNeedsReauth(false);
    if (!deleting) return;
    setDeletePending(true);
    try {
      const ok = await runDelete(deleting.id);
      if (ok) {
        setDeleting(null);
        router.refresh();
      }
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
    <div className="rtable-wrap overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <table role="table" className="rtable w-full min-w-[720px] text-sm">
        <thead role="rowgroup">
          <tr role="row" className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-neutral-800 dark:text-neutral-400">
            <th role="columnheader" className="px-4 py-3 font-medium">Data</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Tipo</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Categoria</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Descrição</th>
            <th role="columnheader" className="px-4 py-3 text-right font-medium">Valor</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Origem</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => (
            <tr role="row" key={row.id} className="border-b border-gray-100 last:border-0 dark:border-neutral-800">
              <td role="cell" data-label="Data" className="px-4 py-3 text-gray-700 dark:text-neutral-300 rt-key"><span className="rt-sr">Data: </span>{row.occurredAtDisplay}</td>
              <td role="cell" className="px-4 py-3 rt-hide-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE_STYLE[row.type]}`}>
                  {ENTRY_TYPE_LABELS[row.type]}
                </span>
              </td>
              <td role="cell" data-label="Categoria" className="px-4 py-3 text-gray-700 dark:text-neutral-300 rt-sub"><span className="rt-sr">Categoria: </span>{row.categoryName}</td>
              <td role="cell" className="px-4 py-3 text-gray-900 dark:text-neutral-100 rt-title"><span className="rt-sr">Descrição: </span>{row.description}</td>
              <td role="cell" data-label="Valor" className="px-4 py-3 text-right font-medium text-gray-900 dark:text-neutral-100 rt-key"><span className="rt-sr">Valor: </span>
                {currency ? formatMoney(row.amount, currency) : row.amount}
              </td>
              <td role="cell" data-label="Origem" className="px-4 py-3 text-gray-500 dark:text-neutral-400 rt-sub"><span className="rt-sr">Origem: </span>
                {row.source === "RECURRING" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    <Repeat size={12} strokeWidth={1.75} aria-hidden="true" />
                    {SOURCE_LABELS.RECURRING}
                  </span>
                ) : (
                  SOURCE_LABELS[row.source]
                )}
              </td>
              <td role="cell" className="px-4 py-3 rt-actions">
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
        open={Boolean(deleting) && !needsReauth}
        title="Excluir lançamento"
        message="Tem certeza que deseja excluir este lançamento?"
        confirmLabel="Excluir"
        pending={deletePending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleting(null)}
      />
      <ReauthModal
        open={needsReauth}
        actionLabel="excluir este lançamento"
        onConfirmed={handleReauthConfirmed}
        onCancel={() => setNeedsReauth(false)}
      />
      {deleteError && (
        <p role="alert" className="px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {deleteError}
        </p>
      )}
    </div>
  );
}

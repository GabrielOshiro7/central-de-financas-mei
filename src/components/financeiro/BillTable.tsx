"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Currency } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import { ConfirmDialog } from "@/components/financeiro/ConfirmDialog";
import { BillFormModal, type BillCategoryOption, type BillFormInitial } from "@/components/financeiro/BillFormModal";
import { billStatusLabel, type BillDirection, type BillDisplayStatus } from "@/lib/finance/bills/status";
import { BILL_DIRECTION_LABELS } from "@/lib/finance/bills/options";

export type BillRow = {
  id: string;
  description: string;
  counterpartyName: string;
  categoryId: string;
  categoryName: string;
  dueDateDisplay: string;
  dueDateInput: string;
  issueDateInput: string;
  amount: string;
  displayStatus: BillDisplayStatus;
  paidAtDisplay: string | null;
  documentNumber: string;
  paymentMethod: string;
  bankAccount: string;
  costCenter: string;
  notes: string;
};

// Musgo/Âmbar/Terracota: paleta de status do app (positivo/atenção/crítico).
// Cancelado fica fora do trio - é um estado neutro/administrativo, não um
// alerta, então mantém o cinza igual ao resto do app.
const STATUS_BADGE_STYLE: Record<BillDisplayStatus, string> = {
  PENDING: "bg-[#FBEDD9] text-[#8a570c] dark:bg-[#332510] dark:text-[#F0B24A]",
  OVERDUE: "bg-[#FBE4DE] text-[#a8402a] dark:bg-[#33201B] dark:text-[#F0917C]",
  PAID: "bg-[#E3EEE6] text-[#3f6b4a] dark:bg-[#1C2E21] dark:text-[#8FD4A0]",
  CANCELLED: "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400",
};

export function BillTable({
  rows,
  direction,
  categories,
  currency,
  todayKey,
}: {
  rows: BillRow[];
  direction: BillDirection;
  categories: BillCategoryOption[];
  currency: Currency | null;
  // "Hoje" da EMPRESA (DateKey "YYYY-MM-DD"), calculado no servidor com o fuso
  // dela e recebido por prop (Etapa F4) - nunca o relogio/fuso do navegador.
  todayKey: string;
}) {
  const router = useRouter();
  const directionLabels = BILL_DIRECTION_LABELS[direction];
  const counterpartyHeader = direction === "PAYABLE" ? "Fornecedor" : "Cliente";

  const [editing, setEditing] = useState<BillRow | null>(null);
  const [settling, setSettling] = useState<BillRow | null>(null);
  const [settleDate, setSettleDate] = useState(todayKey);
  const [settlePending, setSettlePending] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [reverting, setReverting] = useState<BillRow | null>(null);
  const [revertPending, setRevertPending] = useState(false);
  const [cancelling, setCancelling] = useState<BillRow | null>(null);
  const [cancelPending, setCancelPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleConfirmSettle() {
    if (!settling) return;
    setSettlePending(true);
    setSettleError(null);
    try {
      const res = await fetch(`/api/financeiro/bills/${settling.id}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAt: settleDate }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSettleError(result.error ?? "Não foi possível confirmar.");
        return;
      }
      setSettling(null);
      router.refresh();
    } catch {
      setSettleError("Erro de conexão. Tente novamente.");
    } finally {
      setSettlePending(false);
    }
  }

  async function handleConfirmRevert() {
    if (!reverting) return;
    setRevertPending(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/financeiro/bills/${reverting.id}/revert`, { method: "POST" });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(result.error ?? "Não foi possível reverter.");
        return;
      }
      setReverting(null);
      router.refresh();
    } catch {
      setActionError("Erro de conexão. Tente novamente.");
    } finally {
      setRevertPending(false);
    }
  }

  async function handleConfirmCancel() {
    if (!cancelling) return;
    setCancelPending(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/financeiro/bills/${cancelling.id}/cancel`, { method: "POST" });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(result.error ?? "Não foi possível cancelar.");
        return;
      }
      setCancelling(null);
      router.refresh();
    } catch {
      setActionError("Erro de conexão. Tente novamente.");
    } finally {
      setCancelPending(false);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
        <p>Nenhuma conta encontrada para os filtros selecionados.</p>
      </div>
    );
  }

  return (
    <div className="rtable-wrap overflow-x-auto border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <table role="table" className="rtable w-full min-w-[860px] text-sm">
        <thead role="rowgroup">
          <tr role="row" className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-neutral-800 dark:text-neutral-400">
            <th role="columnheader" className="px-4 py-3 font-medium">Descrição</th>
            <th role="columnheader" className="px-4 py-3 font-medium">{counterpartyHeader}</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Categoria</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Vencimento</th>
            <th role="columnheader" className="px-4 py-3 text-right font-medium">Valor</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Status</th>
            <th role="columnheader" className="px-4 py-3 font-medium">{direction === "PAYABLE" ? "Pagamento" : "Recebimento"}</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => (
            <tr role="row" key={row.id} className="border-b border-gray-100 last:border-0 dark:border-neutral-800">
              <td role="cell" className="px-4 py-3 text-gray-900 dark:text-neutral-100 rt-title"><span className="rt-sr">Descrição: </span>{row.description}</td>
              <td role="cell" data-label={counterpartyHeader} className="px-4 py-3 text-gray-700 dark:text-neutral-300 rt-sub"><span className="rt-sr">{counterpartyHeader}: </span>{row.counterpartyName || "—"}</td>
              <td role="cell" data-label="Categoria" className="px-4 py-3 text-gray-700 dark:text-neutral-300 rt-sub"><span className="rt-sr">Categoria: </span>{row.categoryName}</td>
              <td role="cell" data-label="Vencimento" className="px-4 py-3 text-gray-700 dark:text-neutral-300 rt-key"><span className="rt-sr">Vencimento: </span>{row.dueDateDisplay}</td>
              <td role="cell" data-label="Valor" className="px-4 py-3 text-right font-medium text-gray-900 dark:text-neutral-100 rt-key"><span className="rt-sr">Valor: </span>
                {currency ? formatMoney(row.amount, currency) : row.amount}
              </td>
              <td role="cell" data-label="Status" className="px-4 py-3 rt-key"><span className="rt-sr">Status: </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_STYLE[row.displayStatus]}`}>
                  {billStatusLabel(direction, row.displayStatus)}
                </span>
              </td>
              <td role="cell" data-label={direction === "PAYABLE" ? "Pagamento" : "Recebimento"} className="px-4 py-3 text-gray-700 dark:text-neutral-300 rt-sub"><span className="rt-sr">{direction === "PAYABLE" ? "Pagamento" : "Recebimento"}: </span>{row.paidAtDisplay ?? "—"}</td>
              <td role="cell" className="px-4 py-3 rt-actions">
                <div className="flex flex-wrap gap-3">
                  {(row.displayStatus === "PENDING" || row.displayStatus === "OVERDUE") && (
                    <>
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
                          setSettling(row);
                          setSettleDate(todayKey);
                          setSettleError(null);
                        }}
                        className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        {directionLabels.action}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCancelling(row);
                          setActionError(null);
                        }}
                        className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
                      >
                        Cancelar
                      </button>
                    </>
                  )}
                  {row.displayStatus === "PAID" && (
                    <button
                      type="button"
                      onClick={() => {
                        setReverting(row);
                        setActionError(null);
                      }}
                      className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400"
                    >
                      Reverter
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {actionError && (
        <p role="alert" className="px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {actionError}
        </p>
      )}

      {editing && (
        <BillFormModal
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          direction={direction}
          categories={categories}
          currency={currency}
          todayKey={todayKey}
          initial={
            {
              id: editing.id,
              categoryId: editing.categoryId,
              description: editing.description,
              amount: editing.amount,
              issueDate: editing.issueDateInput,
              dueDate: editing.dueDateInput,
              documentNumber: editing.documentNumber,
              counterpartyName: editing.counterpartyName,
              paymentMethod: editing.paymentMethod,
              bankAccount: editing.bankAccount,
              costCenter: editing.costCenter,
              notes: editing.notes,
            } satisfies BillFormInitial
          }
        />
      )}

      {settling && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !settlePending && setSettling(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-sm bg-white p-6 shadow-lg dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{directionLabels.action}</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-neutral-400">
              Confirme a data em que o {directionLabels.singular} foi{" "}
              {direction === "PAYABLE" ? "efetivamente pago" : "efetivamente recebido"}. Isso gera um lançamento no
              financeiro nessa data.
            </p>
            <div className="mt-4">
              <label htmlFor="settleDate" className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300">
                Data
              </label>
              <input
                id="settleDate"
                type="date"
                value={settleDate}
                onChange={(e) => setSettleDate(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>
            {settleError && (
              <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
                {settleError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSettling(null)}
                disabled={settlePending}
                className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSettle}
                disabled={settlePending}
                className="bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {settlePending ? "Confirmando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(reverting)}
        title="Reverter confirmação"
        message={
          reverting
            ? `A conta volta a ficar pendente e o ${direction === "PAYABLE" ? "pagamento" : "recebimento"} de ${
                currency ? formatMoney(reverting.amount, currency) : reverting.amount
              } é desfeito: o valor sai do Caixa e do Dashboard.`
            : ""
        }
        confirmLabel="Reverter"
        pending={revertPending}
        onConfirm={handleConfirmRevert}
        onCancel={() => setReverting(null)}
      />

      <ConfirmDialog
        open={Boolean(cancelling)}
        title="Cancelar conta"
        message="Tem certeza que deseja cancelar esta conta? Ela deixa de contar nos totais em aberto, mas continua no histórico."
        confirmLabel="Cancelar conta"
        pending={cancelPending}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelling(null)}
      />
    </div>
  );
}

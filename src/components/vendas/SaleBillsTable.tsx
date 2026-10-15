"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Currency } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import { ConfirmDialog } from "@/components/financeiro/ConfirmDialog";
import { billStatusLabel, type BillDisplayStatus } from "@/lib/finance/bills/status";

export type SaleBillRow = {
  id: string;
  dueDateDisplay: string;
  amount: string;
  displayStatus: BillDisplayStatus;
  paidAtDisplay: string | null;
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

function todayInputValue(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Reaproveita EXATAMENTE os endpoints de settle/revert/cancel de Bill ja
// existentes (Etapa 5) - nao ha nenhuma logica de negocio nova aqui, so uma
// tabela mais enxuta (sem edicao de categoria/descricao, que nao fazem
// sentido para uma parcela de venda) chamando os mesmos /api/financeiro/
// bills/[id]/settle|revert|cancel que a tela de Contas a Receber usa.
export function SaleBillsTable({ bills, currency }: { bills: SaleBillRow[]; currency: Currency }) {
  const router = useRouter();
  const [settling, setSettling] = useState<SaleBillRow | null>(null);
  const [settleDate, setSettleDate] = useState(todayInputValue());
  const [settlePending, setSettlePending] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [reverting, setReverting] = useState<SaleBillRow | null>(null);
  const [revertPending, setRevertPending] = useState(false);
  const [cancelling, setCancelling] = useState<SaleBillRow | null>(null);
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

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-neutral-800 dark:text-neutral-400">
            <th className="px-4 py-3 font-medium">Vencimento</th>
            <th className="px-4 py-3 text-right font-medium">Valor</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Recebimento</th>
            <th className="px-4 py-3 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {bills.map((bill) => (
            <tr key={bill.id} className="border-b border-gray-100 last:border-0 dark:border-neutral-800">
              <td className="px-4 py-3 text-gray-700 dark:text-neutral-300">{bill.dueDateDisplay}</td>
              <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-neutral-100">
                {formatMoney(bill.amount, currency)}
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_STYLE[bill.displayStatus]}`}>
                  {billStatusLabel("RECEIVABLE", bill.displayStatus)}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-700 dark:text-neutral-300">{bill.paidAtDisplay ?? "—"}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-3">
                  {(bill.displayStatus === "PENDING" || bill.displayStatus === "OVERDUE") && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setSettling(bill);
                          setSettleDate(todayInputValue());
                          setSettleError(null);
                        }}
                        className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        Registrar recebimento
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCancelling(bill);
                          setActionError(null);
                        }}
                        className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
                      >
                        Cancelar parcela
                      </button>
                    </>
                  )}
                  {bill.displayStatus === "PAID" && (
                    <button
                      type="button"
                      onClick={() => {
                        setReverting(bill);
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

      {settling && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !settlePending && setSettling(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Registrar recebimento</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-neutral-400">
              Confirme a data em que o valor foi efetivamente recebido. Isso gera um lançamento no financeiro nessa data.
            </p>
            <div className="mt-4">
              <label htmlFor="saleSettleDate" className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300">
                Data
              </label>
              <input
                id="saleSettleDate"
                type="date"
                value={settleDate}
                onChange={(e) => setSettleDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
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
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSettle}
                disabled={settlePending}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {settlePending ? "Confirmando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(reverting)}
        title="Reverter recebimento"
        message="A parcela volta a ficar pendente e o lançamento financeiro gerado é desvinculado do histórico (não é apagado)."
        confirmLabel="Reverter"
        pendingLabel="Revertendo..."
        pending={revertPending}
        onConfirm={handleConfirmRevert}
        onCancel={() => setReverting(null)}
      />

      <ConfirmDialog
        open={Boolean(cancelling)}
        title="Cancelar parcela"
        message="Tem certeza que deseja cancelar esta parcela? Ela deixa de contar nos totais em aberto, mas continua no histórico."
        confirmLabel="Cancelar parcela"
        pendingLabel="Cancelando..."
        pending={cancelPending}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelling(null)}
      />
    </div>
  );
}

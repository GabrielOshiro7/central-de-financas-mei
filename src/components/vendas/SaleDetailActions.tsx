"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Currency, SaleStatus } from "@prisma/client";
import { ConfirmDialog } from "@/components/financeiro/ConfirmDialog";
import { MoneyInput } from "@/components/MoneyInput";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/sales/options";
import { isIntegerCurrency } from "@/lib/money";

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Acoes de nivel de VENDA (nao de parcela - ver SaleBillsTable para
// settle/revert/cancel de Bill). "Confirmar venda" so aparece para DRAFT
// (materializa os Bills, ver confirmSale). "Cancelar venda" e bloqueado
// inteiramente se ja houver alguma parcela PAID (a propria API retorna erro
// nesse caso - o dialog so exibe a mensagem que veio do backend).
export function SaleDetailActions({
  saleId,
  status,
  saleDateInput,
  total,
  currency,
  editable,
}: {
  saleId: string;
  status: SaleStatus;
  saleDateInput: string;
  total: string;
  currency: Currency;
  editable: boolean;
}) {
  const router = useRouter();
  const decimals = isIntegerCurrency(currency) ? 0 : 2;

  const [confirming, setConfirming] = useState(false);
  const [paymentTiming, setPaymentTiming] = useState<"AVISTA" | "APRAZO">("AVISTA");
  const [paymentMethod, setPaymentMethod] = useState("");
  // Indice do array, nunca um contador global/random gerado no render - ver
  // o comentario equivalente em SaleForm.tsx sobre o risco de mismatch de
  // hidratacao (aqui e inofensivo hoje porque o modal so renderiza quando
  // `confirming` é true, mas mantido consistente para não ser um exemplo a
  // copiar de novo em outro lugar).
  const [installments, setInstallments] = useState<{ dueDateInput: string; amount: string }[]>([
    { dueDateInput: saleDateInput, amount: total },
  ]);
  const [confirmPending, setConfirmPending] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [cancelling, setCancelling] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [completePending, setCompletePending] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const installmentsSum = useMemo(
    () => round(installments.reduce((t, i) => t + (Number(i.amount) || 0), 0), decimals),
    [installments, decimals]
  );
  const totalNumber = round(Number(total) || 0, decimals);

  function openConfirmModal() {
    setPaymentTiming("AVISTA");
    setInstallments([{ dueDateInput: saleDateInput, amount: total }]);
    setConfirmError(null);
    setConfirming(true);
  }

  function setInstallmentCount(count: number) {
    const safeCount = Math.max(1, count);
    const base = round(totalNumber / safeCount, decimals);
    const rows = Array.from({ length: safeCount }, () => ({
      dueDateInput: saleDateInput,
      amount: base.toString(),
    }));
    const remainder = round(totalNumber - base * safeCount, decimals);
    rows[rows.length - 1].amount = round(base + remainder, decimals).toString();
    setInstallments(rows);
  }

  async function handleConfirmSale() {
    setConfirmError(null);
    if (installments.some((i) => !i.dueDateInput || !i.amount)) {
      setConfirmError("Preencha vencimento e valor de todas as parcelas.");
      return;
    }
    if (installmentsSum !== totalNumber) {
      setConfirmError(`A soma das parcelas (${installmentsSum}) não bate com o total da venda (${totalNumber}).`);
      return;
    }

    setConfirmPending(true);
    try {
      const res = await fetch(`/api/vendas/${saleId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: paymentMethod || undefined,
          installments: installments.map((i, index) => ({
            dueDate: i.dueDateInput,
            amount: i.amount,
            paidNow: paymentTiming === "AVISTA" && installments.length === 1 && index === 0,
          })),
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setConfirmError(result.error ?? "Não foi possível confirmar a venda.");
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setConfirmError("Erro de conexão. Tente novamente.");
    } finally {
      setConfirmPending(false);
    }
  }

  async function handleCancelSale() {
    setCancelPending(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/vendas/${saleId}/cancel`, { method: "POST" });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCancelError(result.error ?? "Não foi possível cancelar.");
        return;
      }
      setCancelling(false);
      router.refresh();
    } catch {
      setCancelError("Erro de conexão. Tente novamente.");
    } finally {
      setCancelPending(false);
    }
  }

  // Marcador comercial manual (ex.: entrega/serviço concluído) - sem
  // nenhum efeito financeiro, ver setSaleCompleted em sales/mutations.ts.
  async function handleMarkCompleted() {
    setCompletePending(true);
    setCompleteError(null);
    try {
      const res = await fetch(`/api/vendas/${saleId}/complete`, { method: "POST" });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCompleteError(result.error ?? "Não foi possível concluir a venda.");
        return;
      }
      router.refresh();
    } catch {
      setCompleteError("Erro de conexão. Tente novamente.");
    } finally {
      setCompletePending(false);
    }
  }

  const inputClass =
    "w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

  return (
    <div className="flex flex-wrap gap-3">
      {editable && (
        <Link
          href={`/vendas/${saleId}/editar`}
          className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Editar
        </Link>
      )}

      {status === "DRAFT" && (
        <button
          type="button"
          onClick={openConfirmModal}
          className="bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Confirmar venda
        </button>
      )}

      {status === "CONFIRMED" && (
        <>
          <button
            type="button"
            onClick={handleMarkCompleted}
            disabled={completePending}
            className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {completePending ? "Concluindo..." : "Marcar como concluída"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCancelling(true);
              setCancelError(null);
            }}
            className="border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Cancelar venda
          </button>
        </>
      )}
      {completeError && (
        <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">
          {completeError}
        </p>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !confirmPending && setConfirming(false)}>
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-6 shadow-lg dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Confirmar venda</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-neutral-400">
              Informe a forma de pagamento e as parcelas. Isso gera as contas a receber correspondentes.
            </p>

            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300">Forma de pagamento (opcional)</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputClass}>
                <option value="">Não informado</option>
                {PAYMENT_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPaymentTiming("AVISTA");
                  setInstallments([{ dueDateInput: saleDateInput, amount: total }]);
                }}
                className={`flex-1 px-3 py-2 text-sm font-medium transition ${
                  paymentTiming === "AVISTA"
                    ? "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-400"
                }`}
              >
                À vista
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentTiming("APRAZO");
                  setInstallmentCount(2);
                }}
                className={`flex-1 px-3 py-2 text-sm font-medium transition ${
                  paymentTiming === "APRAZO"
                    ? "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-400"
                }`}
              >
                A prazo
              </button>
            </div>

            {paymentTiming === "APRAZO" && (
              <div className="mt-3">
                <label htmlFor="confirmInstallmentCount" className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300">
                  Nº de parcelas
                </label>
                <input
                  id="confirmInstallmentCount"
                  type="number"
                  min={1}
                  defaultValue={2}
                  onChange={(e) => setInstallmentCount(Number(e.target.value))}
                  className={`${inputClass} w-24`}
                />
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2">
              {installments.map((installment, index) => (
                <div key={index} className="grid grid-cols-2 gap-2">
                  <label htmlFor={`confirm-due-${index}`} className="sr-only">
                    Vencimento da parcela {index + 1}
                  </label>
                  <input
                    id={`confirm-due-${index}`}
                    type="date"
                    value={installment.dueDateInput}
                    onChange={(e) =>
                      setInstallments((prev) => prev.map((i, idx) => (idx === index ? { ...i, dueDateInput: e.target.value } : i)))
                    }
                    className={inputClass}
                  />
                  <label htmlFor={`confirm-amount-${index}`} className="sr-only">
                    Valor da parcela {index + 1}
                  </label>
                  <MoneyInput
                    id={`confirm-amount-${index}`}
                    currency={currency}
                    value={installment.amount}
                    onChange={(value) => setInstallments((prev) => prev.map((i, idx) => (idx === index ? { ...i, amount: value } : i)))}
                  />
                </div>
              ))}
            </div>

            <p
              className={`mt-2 text-xs ${
                installmentsSum === totalNumber ? "text-gray-500 dark:text-neutral-400" : "font-semibold text-rose-600 dark:text-rose-400"
              }`}
            >
              Soma das parcelas: {installmentsSum} / {totalNumber}
            </p>

            {confirmError && (
              <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
                {confirmError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={confirmPending}
                className="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSale}
                disabled={confirmPending}
                className="bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {confirmPending ? "Confirmando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={cancelling}
        title="Cancelar venda"
        message={cancelError ?? "Tem certeza que deseja cancelar esta venda? As parcelas pendentes relacionadas também serão canceladas."}
        confirmLabel="Cancelar venda"
        pendingLabel="Cancelando..."
        pending={cancelPending}
        onConfirm={handleCancelSale}
        onCancel={() => setCancelling(false)}
      />
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Currency } from "@prisma/client";
import { MoneyInput } from "@/components/MoneyInput";
import { isIntegerCurrency } from "@/lib/money";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/sales/options";

function todayInputValue(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export type CompleteDialogItem = { productId: string | null; description: string; quantity: number; unitPrice: number };

// Botao com cantos retos (regra de design da Etapa 8 - nao arredondar
// botoes, mesmo o resto do app usando rounded-lg).
const primaryButtonClass =
  "bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200";
const secondaryButtonClass =
  "border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";
const inputClass =
  "w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
const labelClass = "mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300";

// O backend SEMPRE recalcula o total a partir de items/installments (ver
// completeAppointment) - o total mostrado aqui e so uma previa pro usuario
// conferir antes de enviar, nunca o valor que de fato e persistido.
export function CompleteAppointmentDialog({
  appointmentId,
  currency,
  revenueCategories,
  defaultCategoryId,
  initialItems,
  onClose,
  onCompleted,
}: {
  appointmentId: string;
  currency: Currency;
  revenueCategories: { id: string; name: string }[];
  defaultCategoryId: string | null;
  initialItems: CompleteDialogItem[];
  onClose: () => void;
  onCompleted: (result: { saleId: string; saleNumber: number }) => void;
}) {
  const router = useRouter();
  const decimals = isIntegerCurrency(currency) ? 0 : 2;

  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? "");
  const [items, setItems] = useState(
    initialItems.map((item) => ({ ...item, quantityInput: String(item.quantity), unitPriceInput: String(item.unitPrice) }))
  );
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentTiming, setPaymentTiming] = useState<"AVISTA" | "APRAZO">("AVISTA");
  const [installments, setInstallments] = useState<{ dueDateInput: string; amount: string }[]>([
    { dueDateInput: todayInputValue(), amount: "" },
  ]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(
    () => round(items.reduce((sum, item) => sum + (Number(item.quantityInput) || 0) * (Number(item.unitPriceInput) || 0), 0), decimals),
    [items, decimals]
  );

  // Mesmo principio de SaleForm.effectiveInstallments: em modo a vista a
  // parcela unica nunca vem do estado `installments` (que nao acompanharia
  // o total recem-editado) - e sempre recalculada aqui a partir do total
  // atual. A data dessa parcela e ignorada pelo backend em paidNow=true
  // (ele sempre usa o dia do atendimento, nunca essa data) - por isso nem
  // exibimos um seletor de data no modo a vista.
  function effectiveInstallments(): { dueDateInput: string; amount: string }[] {
    if (paymentTiming === "AVISTA") {
      return [{ dueDateInput: todayInputValue(), amount: total.toString() }];
    }
    return installments;
  }

  function setInstallmentCount(count: number) {
    const safeCount = Math.max(1, count);
    const base = round(total / safeCount, decimals);
    const rows = Array.from({ length: safeCount }, () => ({ dueDateInput: todayInputValue(), amount: base.toString() }));
    const remainder = round(total - base * safeCount, decimals);
    rows[rows.length - 1].amount = round(base + remainder, decimals).toString();
    setInstallments(rows);
  }

  function updateItem(index: number, patch: Partial<{ quantityInput: string; unitPriceInput: string }>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function handleSubmit() {
    setError(null);
    if (!categoryId) return setError("Selecione uma categoria de receita.");
    if (items.some((item) => !item.quantityInput || !item.unitPriceInput)) {
      return setError("Preencha quantidade e preço de todos os itens.");
    }

    const finalInstallments = effectiveInstallments();
    if (finalInstallments.some((i) => !i.dueDateInput || !i.amount)) {
      return setError("Preencha vencimento e valor de todas as parcelas.");
    }
    const installmentsSum = round(finalInstallments.reduce((t, i) => t + (Number(i.amount) || 0), 0), decimals);
    if (installmentsSum !== total) {
      return setError(`A soma das parcelas (${installmentsSum}) não bate com o total (${total}).`);
    }

    setPending(true);
    try {
      const res = await fetch(`/api/agenda/${appointmentId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          items: items.map((item) => ({
            productId: item.productId || undefined,
            description: item.description,
            quantity: item.quantityInput,
            unitPrice: item.unitPriceInput,
          })),
          paymentMethod: paymentMethod || undefined,
          installments: finalInstallments.map((installment, index) => ({
            dueDate: installment.dueDateInput,
            amount: installment.amount,
            paidNow: paymentTiming === "AVISTA" && finalInstallments.length === 1 && index === 0,
          })),
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(result.error ?? "Não foi possível concluir o atendimento.");
        return;
      }
      router.refresh();
      onCompleted({ saleId: result.saleId, saleNumber: result.saleNumber });
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !pending && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-6 shadow-lg dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Concluir atendimento</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-neutral-400">
          Confira os itens e informe a forma de pagamento. Isso gera a venda e as contas a receber correspondentes.
        </p>

        <div className="mt-4">
          <label htmlFor="completeCategoryId" className={labelClass}>
            Categoria de receita
          </label>
          <select id="completeCategoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
            <option value="">Selecione...</option>
            {revenueCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-[1fr_5rem_9rem] items-end gap-2">
              <div>
                <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300">{item.description}</span>
              </div>
              <div>
                <label htmlFor={`complete-qty-${index}`} className="sr-only">
                  Quantidade de {item.description}
                </label>
                <input
                  id={`complete-qty-${index}`}
                  type="number"
                  min={1}
                  step={1}
                  value={item.quantityInput}
                  onChange={(e) => updateItem(index, { quantityInput: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor={`complete-price-${index}`} className="sr-only">
                  Preço de {item.description}
                </label>
                <MoneyInput
                  id={`complete-price-${index}`}
                  currency={currency}
                  value={item.unitPriceInput}
                  onChange={(value) => updateItem(index, { unitPriceInput: value })}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <label htmlFor="completePaymentMethod" className={labelClass}>
            Forma de pagamento (opcional)
          </label>
          <select id="completePaymentMethod" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputClass}>
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
            onClick={() => setPaymentTiming("AVISTA")}
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
              setInstallmentCount(installments.length > 1 ? installments.length : 2);
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
          <>
            <div className="mt-3">
              <label htmlFor="completeInstallmentCount" className={labelClass}>
                Nº de parcelas
              </label>
              <input
                id="completeInstallmentCount"
                type="number"
                min={1}
                defaultValue={installments.length}
                onChange={(e) => setInstallmentCount(Number(e.target.value))}
                className={`${inputClass} w-24`}
              />
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {installments.map((installment, index) => (
                <div key={index} className="grid grid-cols-2 gap-2">
                  <label htmlFor={`complete-due-${index}`} className="sr-only">
                    Vencimento da parcela {index + 1}
                  </label>
                  <input
                    id={`complete-due-${index}`}
                    type="date"
                    value={installment.dueDateInput}
                    onChange={(e) =>
                      setInstallments((prev) => prev.map((i, idx) => (idx === index ? { ...i, dueDateInput: e.target.value } : i)))
                    }
                    className={inputClass}
                  />
                  <label htmlFor={`complete-amount-${index}`} className="sr-only">
                    Valor da parcela {index + 1}
                  </label>
                  <MoneyInput
                    id={`complete-amount-${index}`}
                    currency={currency}
                    value={installment.amount}
                    onChange={(value) =>
                      setInstallments((prev) => prev.map((i, idx) => (idx === index ? { ...i, amount: value } : i)))
                    }
                  />
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mt-3 text-xs text-gray-500 dark:text-neutral-400">Total: {total}</p>

        {error && (
          <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryButtonClass}>
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={pending} className={primaryButtonClass}>
            {pending ? "Concluindo..." : "Concluir atendimento"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Currency, RecurringBillFrequency } from "@prisma/client";
import { FormField } from "@/components/FormField";
import { MoneyField } from "@/components/MoneyInput";
import { SubmitButton } from "@/components/SubmitButton";
import type { BillDirection } from "@/lib/finance/bills/status";
import {
  RECURRING_BILL_FREQUENCY_OPTIONS,
  WEEKDAY_OPTIONS,
  MONTH_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
} from "@/lib/finance/bills/options";
import type { BillCategoryOption } from "@/components/financeiro/BillFormModal";

export type RecurringBillFormInitial = {
  id: string;
  categoryId: string;
  description: string;
  amount: string;
  frequency: RecurringBillFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  yearMonth: number | null;
  startDate: string; // yyyy-mm-dd
  endDate: string; // yyyy-mm-dd ou ""
  documentNumber: string;
  counterpartyName: string;
  paymentMethod: string;
  bankAccount: string;
  costCenter: string;
  notes: string;
};

// Edicao de um molde de conta recorrente ja existente (Etapa 5) - mesmo
// espirito de RecurringEntryFormModal: nunca altera as Bill ja
// materializadas, so os dados que valem pras proximas (ver
// updateRecurringBill).
export function RecurringBillFormModal({
  open,
  onClose,
  direction,
  categories,
  currency,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  direction: BillDirection;
  categories: BillCategoryOption[];
  currency: Currency | null;
  initial: RecurringBillFormInitial;
}) {
  const router = useRouter();

  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [description, setDescription] = useState(initial.description);
  const [amount, setAmount] = useState(initial.amount);
  const [frequency, setFrequency] = useState<RecurringBillFrequency>(initial.frequency);
  const [dayOfWeek, setDayOfWeek] = useState(initial.dayOfWeek ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(initial.dayOfMonth ?? 1);
  const [yearMonth, setYearMonth] = useState(initial.yearMonth ?? 0);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [documentNumber, setDocumentNumber] = useState(initial.documentNumber);
  const [counterpartyName, setCounterpartyName] = useState(initial.counterpartyName);
  const [paymentMethod, setPaymentMethod] = useState(initial.paymentMethod);
  const [bankAccount, setBankAccount] = useState(initial.bankAccount);
  const [costCenter, setCostCenter] = useState(initial.costCenter);
  const [notes, setNotes] = useState(initial.notes);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) return null;

  const usesWeekday = frequency === "WEEKLY" || frequency === "BIWEEKLY";
  const usesMonthday = frequency === "MONTHLY" || frequency === "QUARTERLY" || frequency === "SEMIANNUAL";
  const usesYearly = frequency === "YEARLY";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const payload = {
        direction,
        categoryId,
        description,
        amount,
        frequency,
        dayOfWeek: usesWeekday ? dayOfWeek : undefined,
        dayOfMonth: usesMonthday || usesYearly ? dayOfMonth : undefined,
        yearMonth: usesYearly ? yearMonth : undefined,
        startDate,
        endDate: endDate || undefined,
        documentNumber: documentNumber || undefined,
        counterpartyName: counterpartyName || undefined,
        paymentMethod: paymentMethod || undefined,
        bankAccount: bankAccount || undefined,
        costCenter: costCenter || undefined,
        notes: notes || undefined,
      };
      const res = await fetch(`/api/financeiro/bills/recurring/${initial.id}`, {
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
        <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Editar conta recorrente</h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
          As alterações valem só para as próximas ocorrências - o que já foi gerado não muda.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4" noValidate>
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
              {categories.map((c) => (
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
              onChange={(e) => setFrequency(e.target.value as RecurringBillFrequency)}
              className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {RECURRING_BILL_FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {usesWeekday && (
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

          {(usesMonthday || usesYearly) && (
            <div className="flex gap-3">
              {usesYearly && (
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

          <FormField
            id="counterpartyName"
            label={direction === "PAYABLE" ? "Fornecedor (opcional)" : "Cliente (opcional)"}
            value={counterpartyName}
            onChange={(e) => setCounterpartyName(e.target.value)}
          />

          <div>
            <label htmlFor="paymentMethod" className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300">
              Método de pagamento (opcional)
            </label>
            <select
              id="paymentMethod"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <option value="">Não informado</option>
              {PAYMENT_METHOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <FormField
            id="bankAccount"
            label="Conta bancária/caixa (opcional)"
            value={bankAccount}
            onChange={(e) => setBankAccount(e.target.value)}
          />

          <FormField
            id="costCenter"
            label="Centro de custo (opcional)"
            value={costCenter}
            onChange={(e) => setCostCenter(e.target.value)}
          />

          <FormField
            id="documentNumber"
            label="Número/documento (opcional)"
            value={documentNumber}
            onChange={(e) => setDocumentNumber(e.target.value)}
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
              className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
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

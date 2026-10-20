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

export type BillCategoryOption = { id: string; name: string };

export type BillFormInitial = {
  id: string;
  categoryId: string;
  description: string;
  amount: string;
  issueDate: string; // yyyy-mm-dd ou ""
  dueDate: string; // yyyy-mm-dd
  documentNumber: string;
  counterpartyName: string;
  paymentMethod: string;
  bankAccount: string;
  costCenter: string;
  notes: string;
};

function todayInputValue(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const COUNTERPARTY_LABEL: Record<BillDirection, string> = {
  PAYABLE: "Fornecedor",
  RECEIVABLE: "Cliente",
};

// Criacao/edicao de uma unica conta (Etapa 5). A "Recorrente" (checkbox +
// sub-formulario) so aparece ao CRIAR, mesmo padrao de TransactionFormModal:
// editar uma ocorrencia isolada nunca deve afetar um molde nem virar uma
// recorrencia nova.
export function BillFormModal({
  open,
  onClose,
  direction,
  categories,
  currency,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  direction: BillDirection;
  categories: BillCategoryOption[];
  currency: Currency | null;
  initial?: BillFormInitial | null;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const isEditing = Boolean(initial);
  const counterpartyLabel = COUNTERPARTY_LABEL[direction];

  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? todayInputValue());
  const [documentNumber, setDocumentNumber] = useState(initial?.documentNumber ?? "");
  const [counterpartyName, setCounterpartyName] = useState(initial?.counterpartyName ?? "");
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? "");
  const [bankAccount, setBankAccount] = useState(initial?.bankAccount ?? "");
  const [costCenter, setCostCenter] = useState(initial?.costCenter ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Recorrencia (Etapa 5) - so faz sentido ao CRIAR uma conta nova.
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurringBillFrequency>("MONTHLY");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [yearMonth, setYearMonth] = useState(0);
  const [endDate, setEndDate] = useState("");

  if (!open) return null;

  const usesWeekday = frequency === "WEEKLY" || frequency === "BIWEEKLY";
  const usesMonthday = frequency === "MONTHLY" || frequency === "QUARTERLY" || frequency === "SEMIANNUAL";
  const usesYearly = frequency === "YEARLY";

  function reset() {
    setCategoryId("");
    setDescription("");
    setAmount("");
    setIssueDate("");
    setDueDate(todayInputValue());
    setDocumentNumber("");
    setCounterpartyName("");
    setPaymentMethod("");
    setBankAccount("");
    setCostCenter("");
    setNotes("");
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!categoryId) {
      setError("Selecione uma categoria.");
      return;
    }

    setPending(true);
    try {
      const url =
        isRecurring && !isEditing
          ? "/api/financeiro/bills/recurring"
          : isEditing
            ? `/api/financeiro/bills/${initial!.id}`
            : "/api/financeiro/bills";

      const commonFields = {
        direction,
        categoryId,
        description,
        amount,
        documentNumber: documentNumber || undefined,
        counterpartyName: counterpartyName || undefined,
        paymentMethod: paymentMethod || undefined,
        bankAccount: bankAccount || undefined,
        costCenter: costCenter || undefined,
        notes: notes || undefined,
      };

      const payload =
        isRecurring && !isEditing
          ? {
              ...commonFields,
              frequency,
              dayOfWeek: usesWeekday ? dayOfWeek : undefined,
              dayOfMonth: usesMonthday || usesYearly ? dayOfMonth : undefined,
              yearMonth: usesYearly ? yearMonth : undefined,
              startDate: dueDate,
              endDate: endDate || undefined,
            }
          : { ...commonFields, issueDate: issueDate || undefined, dueDate };

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Não foi possível salvar a conta.");
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
          {isEditing ? "Editar conta" : direction === "PAYABLE" ? "Nova conta a pagar" : "Nova conta a receber"}
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4" noValidate>
          <FormField
            id="description"
            label="Descrição"
            placeholder={direction === "PAYABLE" ? "Ex.: Aluguel do escritório" : "Ex.: Venda a prazo"}
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
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <MoneyField id="amount" label="Valor" currency={currency} value={amount} onChange={setAmount} />

          <FormField
            id="counterpartyName"
            label={`${counterpartyLabel} (opcional)`}
            value={counterpartyName}
            onChange={(e) => setCounterpartyName(e.target.value)}
          />

          {!isRecurring && (
            <FormField
              id="issueDate"
              label="Data de emissão (opcional)"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          )}

          <FormField
            id="dueDate"
            label={isRecurring ? "Primeiro vencimento" : "Data de vencimento"}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />

          <FormField
            id="documentNumber"
            label="Número/documento (opcional)"
            value={documentNumber}
            onChange={(e) => setDocumentNumber(e.target.value)}
          />

          <div>
            <label htmlFor="paymentMethod" className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300">
              Método de pagamento (opcional)
            </label>
            <select
              id="paymentMethod"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
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

          {!isEditing && (
            <div className="rounded-lg border border-gray-200 p-3 dark:border-neutral-700">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 dark:border-neutral-600"
                />
                Conta recorrente (aluguel, mensalidade, assinatura...)
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
                      onChange={(e) => setFrequency(e.target.value as RecurringBillFrequency)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
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
                          label="Dia do mês (vencimento)"
                          type="number"
                          min={1}
                          max={31}
                          value={String(dayOfMonth)}
                          onChange={(e) => setDayOfMonth(Number(e.target.value))}
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
                          Em meses sem esse dia, usa o último dia disponível.
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
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
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

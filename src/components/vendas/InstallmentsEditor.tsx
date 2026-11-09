"use client";

import { useState } from "react";
import type { Currency } from "@prisma/client";
import { MoneyInput } from "@/components/MoneyInput";
import { formatMoney, isIntegerCurrency } from "@/lib/money";
import { addDays, isDateKey } from "@/lib/time/zoned";

// Editor de parcelas "a prazo" - extraido do SaleForm (Agenda A3) para ser o
// MESMO componente na venda e no agendamento por dia (vencimento + valor por
// linha, "Dividir igualmente" e a soma das parcelas x total). Previa em
// ponto flutuante so para UX; o backend sempre revalida a soma (Decimal na
// venda, centavos inteiros no agendamento).

export type InstallmentRow = { dueDateInput: string; amount: string };

// Soma de dias pura de calendario (zoned.ts), sem fuso nenhum (Etapa F4).
function addDaysInput(dateInput: string, days: number): string {
  return isDateKey(dateInput) ? addDays(dateInput, days) : dateInput;
}

export function roundMoney(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function sumInstallmentRows(rows: InstallmentRow[], decimals: number): number {
  return roundMoney(
    rows.reduce((t, i) => t + (Number(i.amount) || 0), 0),
    decimals
  );
}

export function InstallmentsEditor({
  installments,
  onChange,
  currency,
  total,
  baseDate,
  todayKey,
  showSplit,
  mismatchClassName = "font-semibold text-rose-600 dark:text-rose-400",
}: {
  installments: InstallmentRow[];
  onChange: (rows: InstallmentRow[]) => void;
  currency: Currency;
  total: number;
  // Dia a partir do qual "Dividir igualmente" distribui os vencimentos.
  baseDate: string;
  // "Hoje" da EMPRESA (DateKey) - vencimento inicial de uma parcela nova.
  todayKey: string;
  showSplit: boolean;
  // Destaque da soma quando nao bate com o total (a Agenda usa um destaque
  // neutro: a paleta de status fica so nos selos de pagamento).
  mismatchClassName?: string;
}) {
  const decimals = isIntegerCurrency(currency) ? 0 : 2;
  const [installmentCount, setInstallmentCount] = useState(2);
  const [installmentIntervalDays, setInstallmentIntervalDays] = useState(30);
  const installmentsSum = sumInstallmentRows(installments, decimals);

  const inputClass =
    "w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
  const labelClass = "mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300";

  function applyEqualSplit() {
    const count = Math.max(1, installmentCount);
    const base = roundMoney(total / count, decimals);
    const rows: InstallmentRow[] = Array.from({ length: count }, (_, index) => ({
      dueDateInput: addDaysInput(baseDate, installmentIntervalDays * index),
      amount: base.toString(),
    }));
    const allocated = roundMoney(base * count, decimals);
    const remainder = roundMoney(total - allocated, decimals);
    rows[rows.length - 1].amount = roundMoney(base + remainder, decimals).toString();
    onChange(rows);
  }

  function updateInstallment(index: number, patch: Partial<InstallmentRow>) {
    onChange(installments.map((i, idx) => (idx === index ? { ...i, ...patch } : i)));
  }

  function addInstallment() {
    onChange([...installments, { dueDateInput: todayKey, amount: "" }]);
  }

  function removeInstallment(index: number) {
    if (installments.length > 1) onChange(installments.filter((_, i) => i !== index));
  }

  return (
    <div className="mt-4">
      {showSplit && (
        <div className="mb-3 flex flex-wrap items-end gap-3 bg-gray-50 p-3 dark:bg-neutral-800">
          <div>
            <label htmlFor="installmentCount" className={labelClass}>
              Nº de parcelas
            </label>
            <input
              id="installmentCount"
              type="number"
              min={1}
              value={installmentCount}
              onChange={(e) => setInstallmentCount(Number(e.target.value))}
              className={`${inputClass} w-24`}
            />
          </div>
          <div>
            <label htmlFor="installmentIntervalDays" className={labelClass}>
              Intervalo (dias)
            </label>
            <input
              id="installmentIntervalDays"
              type="number"
              min={1}
              value={installmentIntervalDays}
              onChange={(e) => setInstallmentIntervalDays(Number(e.target.value))}
              className={`${inputClass} w-24`}
            />
          </div>
          <button
            type="button"
            onClick={applyEqualSplit}
            className="border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            Dividir igualmente
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {installments.map((installment, index) => (
          <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-end">
            <div className="sm:col-span-5">
              <label htmlFor={`due-${index}`} className={labelClass}>
                Vencimento
              </label>
              <input
                id={`due-${index}`}
                type="date"
                value={installment.dueDateInput}
                onChange={(e) => updateInstallment(index, { dueDateInput: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-5">
              <label htmlFor={`amount-${index}`} className={labelClass}>
                Valor
              </label>
              <MoneyInput
                id={`amount-${index}`}
                currency={currency}
                value={installment.amount}
                onChange={(value) => updateInstallment(index, { amount: value })}
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={() => removeInstallment(index)}
                disabled={installments.length === 1}
                className="text-sm font-medium text-red-600 hover:underline disabled:opacity-40 dark:text-red-400"
              >
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <button type="button" onClick={addInstallment} className="font-medium text-gray-600 hover:underline dark:text-neutral-400">
          + Adicionar parcela
        </button>
        <span className={installmentsSum === total ? "text-gray-500 dark:text-neutral-400" : mismatchClassName}>
          Soma das parcelas: {formatMoney(installmentsSum, currency)} / {formatMoney(total, currency)}
        </span>
      </div>
    </div>
  );
}

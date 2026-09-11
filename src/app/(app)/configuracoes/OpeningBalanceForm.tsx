"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Currency } from "@prisma/client";
import { FormField } from "@/components/FormField";
import { SubmitButton } from "@/components/SubmitButton";

export type OpeningBalanceData = {
  openingBalance: string;
  openingBalanceDate: string; // yyyy-mm-dd ou ""
};

// Formulario UNICO de saldo inicial (Etapa 5.1) - a aba Caixa so tem um
// atalho de link pra cá, nunca uma copia deste formulario (ver ADENDO
// "evite duplicar o formulário em dois lugares").
export function OpeningBalanceForm({ data, currency }: { data: OpeningBalanceData; currency: Currency | null }) {
  const router = useRouter();
  const [openingBalance, setOpeningBalance] = useState(data.openingBalance);
  const [openingBalanceDate, setOpeningBalanceDate] = useState(data.openingBalanceDate);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!openingBalanceDate) {
      setError("Informe a data do saldo inicial.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/business/opening-balance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingBalance, openingBalanceDate }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Não foi possível salvar.");
        return;
      }
      setMessage("Saldo inicial atualizado com sucesso.");
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Saldo inicial do caixa</h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
          Usado para calcular a posição de caixa acumulada (aba Caixa) a partir desta data. Lançamentos
          anteriores ou nesta mesma data não entram na soma — já estão embutidos no valor informado aqui.
        </p>
      </div>

      <FormField
        id="openingBalance"
        label="Saldo inicial"
        type="number"
        step={currency === "JPY" ? 1 : 0.01}
        value={openingBalance}
        onChange={(e) => setOpeningBalance(e.target.value)}
      />

      <FormField
        id="openingBalanceDate"
        label="Data do saldo inicial"
        type="date"
        value={openingBalanceDate}
        onChange={(e) => setOpeningBalanceDate(e.target.value)}
      />

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}

      <SubmitButton pending={pending} pendingText="Salvando...">
        Salvar saldo inicial
      </SubmitButton>
    </form>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Currency, YearsInBusiness } from "@prisma/client";
import { FormField } from "@/components/FormField";
import { SubmitButton } from "@/components/SubmitButton";
import { ChoiceButton } from "@/components/onboarding/ChoiceButton";
import { CURRENCY_OPTIONS, YEARS_IN_BUSINESS_OPTIONS } from "@/lib/onboarding/options";
import { businessEditSchema } from "@/lib/onboarding/schema";

// Props em forma serializavel - nunca o objeto Business do Prisma direto,
// que carrega um Decimal (nao suportado ao cruzar a fronteira server/client).
export type EmpresaFormData = {
  name: string;
  yearsInBusiness: YearsInBusiness | null;
  employeeCount: number | null;
  currency: Currency | null;
  averageMonthlyRevenue: string;
};

export function EmpresaForm({ business }: { business: EmpresaFormData }) {
  const router = useRouter();
  const [name, setName] = useState(business.name ?? "");
  const [yearsInBusiness, setYearsInBusiness] = useState(business.yearsInBusiness);
  const [employeeCount, setEmployeeCount] = useState(String(business.employeeCount ?? ""));
  const [currency, setCurrency] = useState(business.currency);
  const [averageMonthlyRevenue, setAverageMonthlyRevenue] = useState(
    business.averageMonthlyRevenue
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const payload = {
      name,
      yearsInBusiness,
      employeeCount: Number(employeeCount),
      currency,
      averageMonthlyRevenue: Number(averageMonthlyRevenue),
    };

    const parsed = businessEditSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Não foi possível salvar.");
        return;
      }
      setMessage("Dados atualizados com sucesso.");
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
      <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Editar dados</h2>

      <FormField id="name" label="Nome da empresa" value={name} onChange={(e) => setName(e.target.value)} />

      <div>
        <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-neutral-300">
          Há quanto tempo sua empresa existe?
        </span>
        <div className="flex flex-col gap-2">
          {YEARS_IN_BUSINESS_OPTIONS.map((opt) => (
            <ChoiceButton
              key={opt.value}
              selected={yearsInBusiness === opt.value}
              onClick={() => setYearsInBusiness(opt.value)}
            >
              {opt.label}
            </ChoiceButton>
          ))}
        </div>
      </div>

      <FormField
        id="employeeCount"
        label="Número de pessoas"
        type="number"
        min={1}
        step={1}
        value={employeeCount}
        onChange={(e) => setEmployeeCount(e.target.value)}
      />

      <div>
        <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-neutral-300">Moeda</span>
        <div className="flex gap-2">
          {CURRENCY_OPTIONS.map((opt) => (
            <div key={opt.value} className="flex-1">
              <ChoiceButton selected={currency === opt.value} onClick={() => setCurrency(opt.value)}>
                <span className="block text-center">
                  {opt.symbol} {opt.value}
                </span>
              </ChoiceButton>
            </div>
          ))}
        </div>
      </div>

      <FormField
        id="averageMonthlyRevenue"
        label="Faturamento médio mensal"
        type="number"
        min={0}
        step={currency === "JPY" ? 1 : 0.01}
        value={averageMonthlyRevenue}
        onChange={(e) => setAverageMonthlyRevenue(e.target.value)}
      />

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}

      <SubmitButton pending={pending} pendingText="Salvando...">
        Salvar alterações
      </SubmitButton>
    </form>
  );
}

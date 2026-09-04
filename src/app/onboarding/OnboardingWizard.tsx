"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BusinessType, Currency, YearsInBusiness } from "@prisma/client";
import { AuthCard } from "@/components/AuthCard";
import { FormField } from "@/components/FormField";
import { LogoutButton } from "@/components/LogoutButton";
import { ChoiceButton } from "@/components/onboarding/ChoiceButton";
import { ProgressIndicator } from "@/components/onboarding/ProgressIndicator";
import {
  BUSINESS_TYPE_OPTIONS,
  CURRENCY_OPTIONS,
  OUTROS_VALUE,
  REVENUE_MODEL_OPTIONS,
  YEARS_IN_BUSINESS_OPTIONS,
  TOTAL_ONBOARDING_STEPS,
  type RevenueBusinessType,
} from "@/lib/onboarding/options";

type OnboardingData = {
  businessType: BusinessType | null;
  revenueModel: string[];
  revenueModelOther: string;
  name: string;
  yearsInBusiness: YearsInBusiness | null;
  employeeCount: string;
  currency: Currency | null;
  averageMonthlyRevenue: string;
};

const FINALIZE_STEP = TOTAL_ONBOARDING_STEPS + 1;

export function OnboardingWizard({
  initialStep,
  initialData,
}: {
  initialStep: number;
  initialData: OnboardingData;
}) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), FINALIZE_STEP));
  const [data, setData] = useState<OnboardingData>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function update<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function toggleRevenueModel(value: string) {
    setData((prev) => ({
      ...prev,
      revenueModel: prev.revenueModel.includes(value)
        ? prev.revenueModel.filter((v) => v !== value)
        : [...prev.revenueModel, value],
    }));
  }

  function buildPayload(): unknown {
    switch (step) {
      case 1:
        return { businessType: data.businessType };
      case 2:
        return data.businessType === "OUTRO"
          ? { revenueModelOther: data.revenueModelOther }
          : { revenueModel: data.revenueModel, revenueModelOther: data.revenueModelOther || undefined };
      case 3:
        return { name: data.name };
      case 4:
        return { yearsInBusiness: data.yearsInBusiness };
      case 5:
        return { employeeCount: Number(data.employeeCount) };
      case 6:
        return { currency: data.currency, averageMonthlyRevenue: Number(data.averageMonthlyRevenue) };
      default:
        return {};
    }
  }

  function canContinue(): boolean {
    switch (step) {
      case 1:
        return data.businessType !== null;
      case 2:
        if (data.businessType === "OUTRO") {
          return data.revenueModelOther.trim().length > 0;
        }
        if (data.revenueModel.length === 0) return false;
        if (data.revenueModel.includes(OUTROS_VALUE) && !data.revenueModelOther.trim()) return false;
        return true;
      case 3:
        return data.name.trim().length > 0;
      case 4:
        return data.yearsInBusiness !== null;
      case 5: {
        const n = Number(data.employeeCount);
        return Number.isInteger(n) && n >= 1;
      }
      case 6: {
        const n = Number(data.averageMonthlyRevenue);
        if (!data.currency || !(n > 0)) return false;
        if (data.currency === "JPY" && !Number.isInteger(n)) return false;
        return true;
      }
      default:
        return true;
    }
  }

  async function handleContinue() {
    if (!canContinue()) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/onboarding/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, data: buildPayload() }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Não foi possível salvar sua resposta.");
        return;
      }
      setStep(Math.min(result.onboardingStep ?? step + 1, FINALIZE_STEP));
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  function handleBack() {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  async function handleFinish() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Não foi possível concluir o cadastro.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative">
      <div className="fixed right-4 top-4 z-10">
        <LogoutButton />
      </div>

      <AuthCard title={stepTitle(step)}>
        {step <= TOTAL_ONBOARDING_STEPS && (
          <ProgressIndicator current={step} total={TOTAL_ONBOARDING_STEPS} />
        )}

        <div className="flex flex-col gap-4">
          {renderStepContent()}

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {step === FINALIZE_STEP ? (
            <SubmitButtonLike pending={pending} onClick={handleFinish}>
              Ir para o dashboard
            </SubmitButtonLike>
          ) : (
            <div className="flex gap-3">
              {step > 1 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Voltar
                </button>
              )}
              <div className="flex-1">
                <SubmitButtonLike pending={pending} disabled={!canContinue()} onClick={handleContinue}>
                  Continuar
                </SubmitButtonLike>
              </div>
            </div>
          )}
        </div>
      </AuthCard>
    </div>
  );

  function renderStepContent() {
    switch (step) {
      case 1:
        return (
          <div className="flex flex-col gap-2">
            {BUSINESS_TYPE_OPTIONS.map((opt) => (
              <ChoiceButton
                key={opt.value}
                selected={data.businessType === opt.value}
                onClick={() => update("businessType", opt.value)}
              >
                {opt.label}
              </ChoiceButton>
            ))}
          </div>
        );
      case 2:
        if (data.businessType === "OUTRO") {
          return (
            <textarea
              value={data.revenueModelOther}
              onChange={(e) => update("revenueModelOther", e.target.value)}
              rows={4}
              placeholder="Conte brevemente como sua empresa ganha dinheiro."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          );
        }
        if (!data.businessType) return null;
        return (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {REVENUE_MODEL_OPTIONS[data.businessType as RevenueBusinessType].map((opt) => (
                <ChoiceButton
                  key={opt.value}
                  selected={data.revenueModel.includes(opt.value)}
                  onClick={() => toggleRevenueModel(opt.value)}
                >
                  {opt.label}
                </ChoiceButton>
              ))}
            </div>
            {data.revenueModel.includes(OUTROS_VALUE) && (
              <FormField
                id="revenueModelOther"
                label='Detalhe a opção "Outros"'
                value={data.revenueModelOther}
                onChange={(e) => update("revenueModelOther", e.target.value)}
              />
            )}
          </div>
        );
      case 3:
        return (
          <FormField
            id="name"
            label="Nome da empresa"
            value={data.name}
            onChange={(e) => update("name", e.target.value)}
          />
        );
      case 4:
        return (
          <div className="flex flex-col gap-2">
            {YEARS_IN_BUSINESS_OPTIONS.map((opt) => (
              <ChoiceButton
                key={opt.value}
                selected={data.yearsInBusiness === opt.value}
                onClick={() => update("yearsInBusiness", opt.value)}
              >
                {opt.label}
              </ChoiceButton>
            ))}
          </div>
        );
      case 5:
        return (
          <FormField
            id="employeeCount"
            label="Número de pessoas"
            type="number"
            min={1}
            step={1}
            value={data.employeeCount}
            onChange={(e) => update("employeeCount", e.target.value)}
          />
        );
      case 6:
        return (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              {CURRENCY_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex-1">
                  <ChoiceButton
                    selected={data.currency === opt.value}
                    onClick={() => update("currency", opt.value)}
                  >
                    <span className="block text-center">
                      {opt.symbol} {opt.value}
                    </span>
                  </ChoiceButton>
                </div>
              ))}
            </div>
            <FormField
              id="averageMonthlyRevenue"
              label="Valor médio mensal"
              type="number"
              min={0}
              step={data.currency === "JPY" ? 1 : 0.01}
              value={data.averageMonthlyRevenue}
              onChange={(e) => update("averageMonthlyRevenue", e.target.value)}
            />
          </div>
        );
      case FINALIZE_STEP:
        return (
          <p className="text-sm text-gray-600 dark:text-neutral-400">
            Sua empresa foi cadastrada. Você já pode acessar o dashboard.
          </p>
        );
      default:
        return null;
    }
  }
}

function stepTitle(step: number): string {
  switch (step) {
    case 1:
      return "Qual é o tipo do seu negócio?";
    case 2:
      return "Como sua empresa ganha dinheiro?";
    case 3:
      return "Qual é o nome da sua empresa?";
    case 4:
      return "Há quanto tempo sua empresa existe?";
    case 5:
      return "Quantas pessoas trabalham na empresa?";
    case 6:
      return "Qual é o faturamento médio mensal?";
    default:
      return "Tudo pronto!";
  }
}

function SubmitButtonLike({
  pending,
  disabled,
  onClick,
  children,
}: {
  pending: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      disabled={pending || disabled}
      onClick={onClick}
      className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
    >
      {pending ? "Salvando..." : children}
    </button>
  );
}

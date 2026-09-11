import type { Business } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  BUSINESS_TYPE_LABELS,
  REVENUE_MODEL_OPTIONS,
  OUTROS_VALUE,
  type RevenueBusinessType,
} from "@/lib/onboarding/options";
import { formatMoney } from "@/lib/money";
import { EmpresaForm } from "./EmpresaForm";
import { OpeningBalanceForm } from "./OpeningBalanceForm";

function formatDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Secao "Empresa" dentro de Configuracoes (Etapa 5.1) - antes era a pagina
// de nivel principal /empresa; movida pra ca, mesmo formulario/comportamento,
// so a localizacao na navegacao mudou (ver redirect em app/(app)/empresa/page.tsx).
// id="empresa" e o alvo do redirect (/configuracoes#empresa) e do atalho
// vindo da aba Caixa.
export async function EmpresaSection({ business }: { business: Business }) {
  const entryCount = await prisma.financialEntry.count({ where: { businessId: business.id } });

  const revenueLabels =
    business.businessType && business.businessType !== "OUTRO"
      ? REVENUE_MODEL_OPTIONS[business.businessType as RevenueBusinessType]
          .filter((o) => business.revenueModel.includes(o.value))
          .map((o) => (o.value === OUTROS_VALUE && business.revenueModelOther
            ? `Outros (${business.revenueModelOther})`
            : o.label))
      : business.revenueModelOther
        ? [business.revenueModelOther]
        : [];

  return (
    <div id="empresa" className="flex scroll-mt-6 flex-col gap-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-neutral-100">Empresa</h2>

      <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-gray-500 dark:text-neutral-400">Tipo de negócio</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-neutral-100">
              {business.businessType ? BUSINESS_TYPE_LABELS[business.businessType] : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500 dark:text-neutral-400">Como ganha dinheiro</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-neutral-100">
              {revenueLabels.length > 0 ? revenueLabels.join(", ") : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500 dark:text-neutral-400">
              Faturamento médio informado no cadastro
            </dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-neutral-100">
              {business.averageMonthlyRevenue && business.currency
                ? formatMoney(business.averageMonthlyRevenue, business.currency)
                : "—"}
            </dd>
            <p className="mt-1 text-xs text-gray-400 dark:text-neutral-500">
              Esse valor é só informação de perfil — não entra nos cálculos do dashboard.
            </p>
          </div>
        </dl>
      </section>

      <EmpresaForm
        business={{
          name: business.name ?? "",
          yearsInBusiness: business.yearsInBusiness,
          employeeCount: business.employeeCount,
          currency: business.currency,
          averageMonthlyRevenue: business.averageMonthlyRevenue?.toString() ?? "",
        }}
        currencyLocked={entryCount > 0}
      />

      <OpeningBalanceForm
        data={{
          openingBalance: business.openingBalance.toString(),
          openingBalanceDate: business.openingBalanceDate ? formatDateInput(business.openingBalanceDate) : "",
        }}
        currency={business.currency}
      />
    </div>
  );
}

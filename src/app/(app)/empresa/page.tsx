import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import {
  BUSINESS_TYPE_LABELS,
  REVENUE_MODEL_OPTIONS,
  OUTROS_VALUE,
  type RevenueBusinessType,
} from "@/lib/onboarding/options";
import { formatMoney } from "@/lib/money";
import { EmpresaForm } from "./EmpresaForm";

export default async function EmpresaPage() {
  const { business } = await requireOnboardedUser();
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
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Minha empresa</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          Dados cadastrados no onboarding. Você pode atualizá-los quando quiser.
        </p>
      </div>

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
    </div>
  );
}

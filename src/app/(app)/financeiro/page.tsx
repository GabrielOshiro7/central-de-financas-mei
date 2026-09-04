import { requireOnboardedUser } from "@/lib/auth/guards";

export default async function FinanceiroPage() {
  await requireOnboardedUser();

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-6 py-24 text-center dark:border-neutral-700 dark:bg-neutral-900">
      <span className="text-3xl">💰</span>
      <h1 className="mt-4 text-lg font-semibold text-gray-900 dark:text-neutral-100">Financeiro</h1>
      <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-neutral-400">
        O lançamento de receitas, custos e despesas será implementado na próxima etapa.
      </p>
    </div>
  );
}

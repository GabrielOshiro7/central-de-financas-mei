import { requireOnboardedUser } from "@/lib/auth/guards";
import { listVisibleCategories } from "@/lib/finance/categories";
import { ImportWizard } from "./ImportWizard";

export default async function ImportarPage() {
  const { business } = await requireOnboardedUser();
  const categories = await listVisibleCategories(business.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Importar dados</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          Importe seus lançamentos financeiros através de Excel ou CSV.
        </p>
      </div>

      <ImportWizard
        currency={business.currency}
        categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
      />
    </div>
  );
}

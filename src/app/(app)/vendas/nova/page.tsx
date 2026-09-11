import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { listVisibleClients } from "@/lib/clients/queries";
import { listVisibleCategories } from "@/lib/finance/categories";
import { listVisibleProducts } from "@/lib/products/queries";
import { SaleForm } from "@/components/vendas/SaleForm";

export default async function NovaVendaPage() {
  const { business } = await requireOnboardedUser();

  const [clients, categories, products] = await Promise.all([
    listVisibleClients(business.id),
    listVisibleCategories(business.id, "REVENUE"),
    listVisibleProducts(business.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Nova venda</h1>
        <Link href="/vendas" className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400">
          ← Voltar para vendas
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
          <p>Cadastre um cliente antes de registrar uma venda.</p>
          <Link
            href="/clientes"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Ir para Clientes
          </Link>
        </div>
      ) : (
        <SaleForm
          mode="create"
          clients={clients.map((c) => ({ id: c.id, name: c.name, tradeName: c.tradeName ?? "" }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          products={products.map((p) => ({ id: p.id, name: p.name, defaultPrice: p.defaultPrice?.toString() ?? "" }))}
          currency={business.currency}
        />
      )}
    </div>
  );
}

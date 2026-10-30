import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { getSaleById } from "@/lib/sales/queries";
import { listVisibleClients } from "@/lib/clients/queries";
import { listVisibleCategories } from "@/lib/finance/categories";
import { listVisibleProducts } from "@/lib/products/queries";
import { SaleForm } from "@/components/vendas/SaleForm";
import { SaleNotesForm } from "@/components/vendas/SaleNotesForm";
import { clockFor, dbDateToKey, toDateKey, todayKey } from "@/lib/time/zoned";

export default async function EditarVendaPage(props: PageProps<"/vendas/[id]/editar">) {
  const { id } = await props.params;
  const { business } = await requireOnboardedUser();
  // Datas iniciais dos campos no fuso da empresa (Etapa F4).
  const clock = clockFor(business);
  const timeZone = clock.timeZone;

  const sale = await getSaleById(business.id, id);
  if (!sale) notFound();

  const locked = sale.bills.some((b) => b.status === "PAID");
  const editable = sale.status !== "CANCELLED" && !locked;

  // Buscados sempre (custo baixo) para evitar um IIFE assíncrono dentro do
  // JSX abaixo - um Server Component não consegue "esperar" uma Promise
  // criada inline no meio da árvore retornada, só no topo da função.
  const [clients, categories, products] = editable
    ? await Promise.all([
        listVisibleClients(business.id),
        listVisibleCategories(business.id, "REVENUE"),
        listVisibleProducts(business.id),
      ])
    : [[], [], []];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Editar venda #{sale.saleNumber}</h1>
        <Link href={`/vendas/${sale.id}`} className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400">
          ← Voltar para a venda
        </Link>
      </div>

      {sale.status === "CANCELLED" ? (
        <div className="border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
          Uma venda cancelada não pode ser editada.
        </div>
      ) : locked ? (
        <div className="border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <SaleNotesForm saleId={sale.id} initialNotes={sale.notes ?? ""} />
        </div>
      ) : (
        <SaleForm
          mode="edit"
          initial={{
            id: sale.id,
            clientId: sale.clientId,
            categoryId: sale.categoryId,
            saleDateInput: toDateKey(sale.saleDate, timeZone),
            items: sale.items.map((item) => ({
              productId: item.productId ?? "",
              description: item.description,
              quantity: item.quantity.toString(),
              unitPrice: item.unitPrice.toString(),
            })),
            discountType: sale.discountType ?? "",
            discountValue: sale.discountValue?.toString() ?? "",
            paymentMethod: sale.paymentMethod ?? "",
            notes: sale.notes ?? "",
            status: sale.status === "DRAFT" ? "DRAFT" : "CONFIRMED",
            installments: sale.bills.map((bill) => ({
              dueDateInput: dbDateToKey(bill.dueOn), // dia gravado (F6b-2)
              amount: bill.amount.toString(),
            })),
          }}
          clients={clients.map((c) => ({ id: c.id, name: c.name, tradeName: c.tradeName ?? "" }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          products={products.map((p) => ({ id: p.id, name: p.name, defaultPrice: p.defaultPrice?.toString() ?? "" }))}
          currency={business.currency}
          todayKey={todayKey(clock)}
        />
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { getSaleById } from "@/lib/sales/queries";
import { formatMoney } from "@/lib/money";
import { SALE_STATUS_BADGE_STYLE, SALE_STATUS_LABELS } from "@/lib/sales/options";
import { deriveSalePaymentStatus, SALE_PAYMENT_STATUS_LABELS } from "@/lib/sales/calculations";
import { deriveBillStatus } from "@/lib/finance/bills/status";
import { SaleBillsTable, type SaleBillRow } from "@/components/vendas/SaleBillsTable";
import { SaleDetailActions } from "@/components/vendas/SaleDetailActions";
import { PAYMENT_STATUS_BADGE_STYLE } from "@/components/vendas/SaleTable";

function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString("pt-BR");
}

function formatDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function SaleDetailPage(props: PageProps<"/vendas/[id]">) {
  const { id } = await props.params;
  const { business } = await requireOnboardedUser();

  const sale = await getSaleById(business.id, id);
  if (!sale) notFound();

  const now = new Date();
  const currency = business.currency;
  const paymentStatus = deriveSalePaymentStatus(sale.bills, now);

  const billRows: SaleBillRow[] = sale.bills.map((bill) => ({
    id: bill.id,
    dueDateDisplay: formatDateDisplay(bill.dueDate),
    amount: bill.amount.toString(),
    displayStatus: deriveBillStatus(bill, now),
    paidAtDisplay: bill.paidAt ? formatDateDisplay(bill.paidAt) : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Venda #{sale.saleNumber}</h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400">{formatDateDisplay(sale.saleDate)}</p>
        </div>
        <Link href="/vendas" className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400">
          ← Voltar para vendas
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SALE_STATUS_BADGE_STYLE[sale.status]}`}>
          {SALE_STATUS_LABELS[sale.status]}
        </span>
        {sale.status !== "DRAFT" && sale.status !== "CANCELLED" && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_STATUS_BADGE_STYLE[paymentStatus]}`}>
            {SALE_PAYMENT_STATUS_LABELS[paymentStatus]}
          </span>
        )}
      </div>

      <SaleDetailActions
        saleId={sale.id}
        status={sale.status}
        saleDateInput={formatDateInput(sale.saleDate)}
        total={sale.total.toString()}
        currency={currency}
        editable={sale.status !== "CANCELLED"}
      />

      <section className="border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-neutral-100">Informações</h2>
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500 dark:text-neutral-400">Cliente</dt>
            <dd className="text-gray-900 dark:text-neutral-100">
              <Link href={`/clientes/${sale.clientId}`} className="hover:underline">
                {sale.client.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-neutral-400">Categoria</dt>
            <dd className="text-gray-900 dark:text-neutral-100">{sale.category.name}</dd>
          </div>
        </dl>
      </section>

      <section className="border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-neutral-100">Itens</h2>
        <div className="rtable-wrap overflow-x-auto">
          <table role="table" className="rtable w-full min-w-[480px] text-sm">
            <thead role="rowgroup">
              <tr role="row" className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-neutral-800 dark:text-neutral-400">
                <th role="columnheader" className="py-2 font-medium">Descrição</th>
                <th role="columnheader" className="py-2 text-right font-medium">Quantidade</th>
                <th role="columnheader" className="py-2 text-right font-medium">Preço unitário</th>
                <th role="columnheader" className="py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {sale.items.map((item) => (
                <tr role="row" key={item.id} className="border-b border-gray-100 last:border-0 dark:border-neutral-800">
                  <td role="cell" className="py-2 text-gray-900 dark:text-neutral-100 rt-title"><span className="rt-sr">Descrição: </span>{item.description}</td>
                  <td role="cell" data-label="Quantidade" className="py-2 text-right text-gray-700 dark:text-neutral-300 rt-sub"><span className="rt-sr">Quantidade: </span>{item.quantity.toString()}</td>
                  <td role="cell" data-label="Preço unitário" className="py-2 text-right text-gray-700 dark:text-neutral-300 rt-sub"><span className="rt-sr">Preço unitário: </span>{formatMoney(item.unitPrice, currency)}</td>
                  <td role="cell" data-label="Subtotal" className="py-2 text-right font-medium text-gray-900 dark:text-neutral-100 rt-key"><span className="rt-sr">Subtotal: </span>
                    {formatMoney(item.lineTotal, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 ml-auto flex max-w-xs flex-col gap-1 bg-gray-50 p-4 text-sm dark:bg-neutral-800">
          <div className="flex justify-between text-gray-600 dark:text-neutral-400">
            <span>Subtotal</span>
            <span>{formatMoney(sale.subtotal, currency)}</span>
          </div>
          <div className="flex justify-between text-gray-600 dark:text-neutral-400">
            <span>Desconto</span>
            <span>{formatMoney(sale.discountAmount, currency)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold text-gray-900 dark:text-neutral-100">
            <span>Total</span>
            <span>{formatMoney(sale.total, currency)}</span>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
          Pagamento{sale.paymentMethod ? ` — ${sale.paymentMethod}` : ""}
        </h2>
        {sale.status === "DRAFT" ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400">
            Esta venda ainda é um rascunho - confirme a venda para gerar as contas a receber.
          </p>
        ) : billRows.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400">Nenhuma parcela registrada.</p>
        ) : (
          <SaleBillsTable bills={billRows} currency={currency} />
        )}
      </section>

      {sale.notes && (
        <section className="border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-neutral-100">Observações</h2>
          <p className="text-sm text-gray-700 dark:text-neutral-300">{sale.notes}</p>
        </section>
      )}
    </div>
  );
}

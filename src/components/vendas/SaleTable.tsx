import Link from "next/link";
import type { Currency, SaleStatus } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import { SALE_STATUS_LABELS } from "@/lib/sales/options";
import { SALE_PAYMENT_STATUS_LABELS, type SalePaymentStatus } from "@/lib/sales/calculations";

export type SaleRow = {
  id: string;
  saleNumber: number;
  clientName: string;
  saleDateDisplay: string;
  total: string;
  paymentMethod: string;
  status: SaleStatus;
  paymentStatus: SalePaymentStatus;
};

export const SALE_STATUS_BADGE_STYLE: Record<SaleStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400",
  CONFIRMED: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  CANCELLED: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

export const PAYMENT_STATUS_BADGE_STYLE: Record<SalePaymentStatus, string> = {
  NAO_PAGA: "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400",
  PARCIAL: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  PAGA: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  ATRASADA: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

// Este componente e um Server Component comum (sem "use client") - so
// renderiza linhas/links, sem interatividade propria. Acoes (editar,
// cancelar, confirmar, registrar recebimento) vivem na pagina de detalhe da
// venda (/vendas/[id]), nunca duplicadas aqui.
export function SaleTable({ rows, currency }: { rows: SaleRow[]; currency: Currency }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
        <p>Nenhuma venda encontrada para os filtros selecionados.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-neutral-800 dark:text-neutral-400">
            <th className="px-4 py-3 font-medium">Número</th>
            <th className="px-4 py-3 font-medium">Cliente</th>
            <th className="px-4 py-3 font-medium">Data</th>
            <th className="px-4 py-3 text-right font-medium">Valor</th>
            <th className="px-4 py-3 font-medium">Pagamento</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-100 last:border-0 dark:border-neutral-800">
              <td className="px-4 py-3 font-medium text-gray-900 dark:text-neutral-100">#{row.saleNumber}</td>
              <td className="px-4 py-3 text-gray-700 dark:text-neutral-300">{row.clientName}</td>
              <td className="px-4 py-3 text-gray-700 dark:text-neutral-300">{row.saleDateDisplay}</td>
              <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-neutral-100">
                {formatMoney(row.total, currency)}
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_STATUS_BADGE_STYLE[row.paymentStatus]}`}>
                  {SALE_PAYMENT_STATUS_LABELS[row.paymentStatus]}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SALE_STATUS_BADGE_STYLE[row.status]}`}>
                  {SALE_STATUS_LABELS[row.status]}
                </span>
              </td>
              <td className="px-4 py-3">
                <Link href={`/vendas/${row.id}`} className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400">
                  Ver
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

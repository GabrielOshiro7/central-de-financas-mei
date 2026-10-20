import Link from "next/link";
import type { Currency, SaleStatus } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import { SALE_STATUS_BADGE_STYLE, SALE_STATUS_LABELS } from "@/lib/sales/options";
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

// Musgo/Âmbar/Terracota: paleta de status de PAGAMENTO (positivo/atenção/
// crítico). "Não paga" fica fora do trio - estado neutro, não alerta. O selo
// de status da VENDA é neutro e mora em SALE_STATUS_BADGE_STYLE
// (src/lib/sales/options.ts).
export const PAYMENT_STATUS_BADGE_STYLE: Record<SalePaymentStatus, string> = {
  NAO_PAGA: "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400",
  PARCIAL: "bg-[#FBEDD9] text-[#8a570c] dark:bg-[#332510] dark:text-[#F0B24A]",
  PAGA: "bg-[#E3EEE6] text-[#3f6b4a] dark:bg-[#1C2E21] dark:text-[#8FD4A0]",
  ATRASADA: "bg-[#FBE4DE] text-[#a8402a] dark:bg-[#33201B] dark:text-[#F0917C]",
};

// Este componente e um Server Component comum (sem "use client") - so
// renderiza linhas/links, sem interatividade propria. Acoes (editar,
// cancelar, confirmar, registrar recebimento) vivem na pagina de detalhe da
// venda (/vendas/[id]), nunca duplicadas aqui.
export function SaleTable({ rows, currency }: { rows: SaleRow[]; currency: Currency }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
        <p>Nenhuma venda encontrada para os filtros selecionados.</p>
      </div>
    );
  }

  return (
    <div className="rtable-wrap overflow-x-auto border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <table role="table" className="rtable w-full min-w-[860px] text-sm">
        <thead role="rowgroup">
          <tr role="row" className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-neutral-800 dark:text-neutral-400">
            <th role="columnheader" className="px-4 py-3 font-medium">Número</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Cliente</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Data</th>
            <th role="columnheader" className="px-4 py-3 text-right font-medium">Valor</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Pagamento</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Status</th>
            <th role="columnheader" className="px-4 py-3 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => (
            <tr role="row" key={row.id} className="border-b border-gray-100 last:border-0 dark:border-neutral-800">
              <td role="cell" data-label="Número" className="px-4 py-3 font-medium text-gray-900 dark:text-neutral-100 rt-sub"><span className="rt-sr">Número: </span>#{row.saleNumber}</td>
              <td role="cell" data-label="Cliente" className="px-4 py-3 text-gray-700 dark:text-neutral-300 rt-key"><span className="rt-sr">Cliente: </span>{row.clientName}</td>
              <td role="cell" data-label="Data" className="px-4 py-3 text-gray-700 dark:text-neutral-300 rt-sub"><span className="rt-sr">Data: </span>{row.saleDateDisplay}</td>
              <td role="cell" data-label="Valor" className="px-4 py-3 text-right font-medium text-gray-900 dark:text-neutral-100 rt-key"><span className="rt-sr">Valor: </span>
                {formatMoney(row.total, currency)}
              </td>
              <td role="cell" data-label="Pagamento" className="px-4 py-3 rt-key"><span className="rt-sr">Pagamento: </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_STATUS_BADGE_STYLE[row.paymentStatus]}`}>
                  {SALE_PAYMENT_STATUS_LABELS[row.paymentStatus]}
                </span>
              </td>
              <td role="cell" data-label="Status" className="px-4 py-3 rt-sub"><span className="rt-sr">Status: </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SALE_STATUS_BADGE_STYLE[row.status]}`}>
                  {SALE_STATUS_LABELS[row.status]}
                </span>
              </td>
              <td role="cell" className="px-4 py-3 rt-actions">
                <Link href={`/vendas/${row.id}`} className="rt-stretch text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400">
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

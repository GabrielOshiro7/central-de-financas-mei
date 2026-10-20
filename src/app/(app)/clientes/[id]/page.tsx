import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { getClientById, getClientCommercialSummary, getClientFinancialSummary, getClientHistory } from "@/lib/clients/queries";
import { CLIENT_TYPE_LABELS } from "@/lib/clients/options";
import { formatMoney } from "@/lib/money";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { SALE_STATUS_LABELS } from "@/lib/sales/options";
import { BILL_DISPLAY_STATUS_LABELS, deriveBillStatus } from "@/lib/finance/bills/status";
import { getClientAppointmentHistory } from "@/lib/agenda/queries";
import { formatTokyoDate, formatTokyoTime } from "@/lib/agenda/time";
import { AppointmentStatusBadge } from "@/components/agenda/AppointmentStatusBadge";

export default async function ClientProfilePage(props: PageProps<"/clientes/[id]">) {
  const { id } = await props.params;
  const { business } = await requireOnboardedUser();

  const client = await getClientById(business.id, id);
  if (!client) notFound();

  const [commercial, financial, history, appointmentHistory] = await Promise.all([
    getClientCommercialSummary(business.id, id),
    getClientFinancialSummary(business.id, id),
    getClientHistory(business.id, id),
    getClientAppointmentHistory(business.id, id),
  ]);

  const currency = business.currency;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">{client.name}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                client.active
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400"
              }`}
            >
              {client.active ? "Ativo" : "Inativo"}
            </span>
          </div>
          {client.tradeName && <p className="text-sm text-gray-500 dark:text-neutral-400">{client.tradeName}</p>}
        </div>
        <Link href="/clientes" className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400">
          ← Voltar para clientes
        </Link>
      </div>

      <section className="border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Dados</h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500 dark:text-neutral-400">Tipo</dt>
            <dd className="text-gray-900 dark:text-neutral-100">{CLIENT_TYPE_LABELS[client.clientType]}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-neutral-400">Documento</dt>
            <dd className="text-gray-900 dark:text-neutral-100">{client.document || "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-neutral-400">Telefone</dt>
            <dd className="text-gray-900 dark:text-neutral-100">{client.phone || "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-neutral-400">WhatsApp</dt>
            <dd className="text-gray-900 dark:text-neutral-100">{client.whatsapp || "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-neutral-400">E-mail</dt>
            <dd className="text-gray-900 dark:text-neutral-100">{client.email || "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-neutral-400">Endereço</dt>
            <dd className="text-gray-900 dark:text-neutral-100">
              {[client.addressLine, client.city, client.state, client.country].filter(Boolean).join(", ") || "—"}
            </dd>
          </div>
          {client.notes && (
            <div className="sm:col-span-2">
              <dt className="text-gray-500 dark:text-neutral-400">Observações</dt>
              <dd className="text-gray-900 dark:text-neutral-100">{client.notes}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Resumo comercial</h2>
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 sm:grid-cols-4">
          <MetricCard label="Total comprado" value={formatMoney(commercial.totalPurchased, currency)} />
          <MetricCard label="Vendas" value={String(commercial.salesCount)} />
          <MetricCard
            label="Ticket médio"
            value={commercial.averageTicket ? formatMoney(commercial.averageTicket, currency) : null}
          />
          <MetricCard
            label="Última compra"
            value={commercial.lastPurchaseAt ? commercial.lastPurchaseAt.toLocaleDateString("pt-BR") : null}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Resumo financeiro</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard label="Em aberto" value={formatMoney(financial.totalOpenAmount, currency)} />
          <MetricCard label="Vencido" value={formatMoney(financial.totalOverdueAmount, currency)} />
          <MetricCard label="Recebido" value={formatMoney(financial.totalReceivedAmount, currency)} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Histórico</h2>
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
            <p>Nenhuma venda registrada para este cliente ainda.</p>
          </div>
        ) : (
          <div className="rtable-wrap overflow-x-auto border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <table role="table" className="rtable w-full min-w-[640px] text-sm">
              <thead role="rowgroup">
                <tr role="row" className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-neutral-800 dark:text-neutral-400">
                  <th role="columnheader" className="px-4 py-3 font-medium">Venda</th>
                  <th role="columnheader" className="px-4 py-3 font-medium">Data</th>
                  <th role="columnheader" className="px-4 py-3 font-medium">Status</th>
                  <th role="columnheader" className="px-4 py-3 text-right font-medium">Total</th>
                  <th role="columnheader" className="px-4 py-3 font-medium">Parcelas</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {history.map((sale) => (
                  <tr role="row" key={sale.saleId} className="border-b border-gray-100 last:border-0 dark:border-neutral-800">
                    <td role="cell" className="px-4 py-3 text-gray-900 dark:text-neutral-100 rt-title">
                      <Link href={`/vendas/${sale.saleId}`} className="rt-stretch font-medium hover:underline">
                        Venda #{sale.saleNumber}
                      </Link>
                    </td>
                    <td role="cell" data-label="Data" className="px-4 py-3 text-gray-700 dark:text-neutral-300 rt-sub"><span className="rt-sr">Data: </span>
                      {sale.saleDate.toLocaleDateString("pt-BR")}
                    </td>
                    <td role="cell" data-label="Status" className="px-4 py-3 text-gray-700 dark:text-neutral-300 rt-sub"><span className="rt-sr">Status: </span>{SALE_STATUS_LABELS[sale.status]}</td>
                    <td role="cell" data-label="Total" className="px-4 py-3 text-right font-medium text-gray-900 dark:text-neutral-100 rt-key"><span className="rt-sr">Total: </span>
                      {formatMoney(sale.total, currency)}
                    </td>
                    <td role="cell" data-label="Parcelas" className="px-4 py-3 text-gray-700 dark:text-neutral-300 rt-wide rt-sub"><span className="rt-sr">Parcelas: </span>
                      <ul className="flex flex-col gap-1">
                        {sale.bills.map((bill) => {
                          const displayStatus = deriveBillStatus(bill);
                          return (
                            <li key={bill.id} className="flex items-center gap-2">
                              <span>{bill.dueDate.toLocaleDateString("pt-BR")}</span>
                              <span>{formatMoney(bill.amount, currency)}</span>
                              <span className="text-xs text-gray-500 dark:text-neutral-400">
                                {BILL_DISPLAY_STATUS_LABELS.RECEIVABLE[displayStatus]}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Histórico de agendamentos</h2>
        {appointmentHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
            <p>Nenhum agendamento registrado para este cliente ainda.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {appointmentHistory.map((appointment) => (
              <li
                key={appointment.id}
                className="flex flex-col gap-1 border border-gray-200 p-4 text-sm dark:border-neutral-800 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-neutral-100">
                      {formatTokyoDate(appointment.startAt)} às {formatTokyoTime(appointment.startAt)}
                    </span>
                    <AppointmentStatusBadge status={appointment.status} />
                  </div>
                  <span className="text-gray-500 dark:text-neutral-400">
                    {appointment.services.map((s) => s.nameSnapshot).join(", ")}
                  </span>
                </div>
                {appointment.sale && (
                  <Link href={`/vendas/${appointment.sale.id}`} className="text-gray-600 hover:underline dark:text-neutral-400">
                    Ver venda #{appointment.sale.saleNumber}
                    {appointment.sale.status === "CANCELLED" ? " (cancelada)" : ""}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

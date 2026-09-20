import type { Currency } from "@prisma/client";
import { AlertTriangle, Calendar, CheckCircle2, Clock, FileText } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { MetricCard } from "@/components/dashboard/MetricCard";
import type { BillDirection } from "@/lib/finance/bills/status";
import type { BillSummary } from "@/lib/finance/bills/queries";

// Indicadores do topo do modulo de Contas (secao "DASHBOARD DO MODULO" da
// Etapa 5) - calculados pelo sistema (getBillSummary), nunca por IA.
export function BillSummaryCards({
  direction,
  summary,
  currency,
}: {
  direction: BillDirection;
  summary: BillSummary;
  currency: Currency | null;
}) {
  const totalLabel = direction === "PAYABLE" ? "Total a pagar" : "Total a receber";
  const paidLabel = direction === "PAYABLE" ? "Total pago (mês)" : "Total recebido (mês)";
  const dueTodayLabel = direction === "PAYABLE" ? "Vencendo hoje" : "Recebimentos hoje";

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <MetricCard
        label={totalLabel}
        value={formatMoney(summary.totalOpenAmount, currency ?? "BRL")}
        icon={<FileText size={16} strokeWidth={1.75} aria-hidden="true" />}
      />
      <MetricCard
        label="Total vencido"
        value={formatMoney(summary.totalOverdueAmount, currency ?? "BRL")}
        icon={<AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" />}
      />
      <MetricCard
        label="Total pendente"
        value={formatMoney(summary.totalPendingAmount, currency ?? "BRL")}
        icon={<Clock size={16} strokeWidth={1.75} aria-hidden="true" />}
      />
      <MetricCard
        label={paidLabel}
        value={formatMoney(summary.totalPaidAmount, currency ?? "BRL")}
        icon={<CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />}
      />
      <MetricCard
        label={dueTodayLabel}
        value={`${summary.dueTodayCount} · ${formatMoney(summary.dueTodayAmount, currency ?? "BRL")}`}
        icon={<Calendar size={16} strokeWidth={1.75} aria-hidden="true" />}
        tooltip={`${summary.dueNext7Count} nos próximos 7 dias · ${summary.dueNext30Count} nos próximos 30 dias`}
      />
    </div>
  );
}

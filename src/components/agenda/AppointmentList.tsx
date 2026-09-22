import Link from "next/link";
import type { AppointmentStatus, Currency, SaleStatus } from "@prisma/client";
import { formatTokyoDate, formatTokyoDateKey, formatTokyoTime } from "@/lib/agenda/time";
import { AppointmentStatusBadge } from "@/components/agenda/AppointmentStatusBadge";
import { AppointmentActions } from "@/components/agenda/AppointmentActions";
import type { CompleteDialogItem } from "@/components/agenda/CompleteAppointmentDialog";

export type AppointmentListItem = {
  id: string;
  startAt: Date;
  endAt: Date;
  status: AppointmentStatus;
  clientId: string;
  clientName: string;
  serviceNames: string[];
  serviceIds: string[];
  saleId: string | null;
  saleNumber: number | null;
  saleStatus: SaleStatus | null;
  completeItems: CompleteDialogItem[];
};

function nextAppointmentHref(item: AppointmentListItem): string {
  const params = new URLSearchParams();
  params.set("clientId", item.clientId);
  for (const serviceId of item.serviceIds) params.append("serviceId", serviceId);
  return `/agenda/novo?${params.toString()}`;
}

function AppointmentRow({
  item,
  currency,
  revenueCategories,
  defaultCategoryId,
}: {
  item: AppointmentListItem;
  currency: Currency;
  revenueCategories: { id: string; name: string }[];
  defaultCategoryId: string | null;
}) {
  return (
    <li className="flex flex-col gap-3 border border-gray-200 p-4 dark:border-neutral-800 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
            {formatTokyoTime(item.startAt)}–{formatTokyoTime(item.endAt)}
          </span>
          <AppointmentStatusBadge status={item.status} />
        </div>
        <p className="text-sm text-gray-700 dark:text-neutral-300">{item.clientName}</p>
        <p className="text-sm text-gray-500 dark:text-neutral-400">{item.serviceNames.join(", ")}</p>
        {(item.status === "AGENDADO" || item.status === "CONFIRMADO") && (
          <Link href={`/agenda/${item.id}/editar`} className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400">
            Editar / remarcar
          </Link>
        )}
      </div>

      <AppointmentActions
        appointmentId={item.id}
        status={item.status}
        saleId={item.saleId}
        saleNumber={item.saleNumber}
        saleStatus={item.saleStatus}
        currency={currency}
        revenueCategories={revenueCategories}
        defaultCategoryId={defaultCategoryId}
        completeItems={item.completeItems}
        nextAppointmentHref={nextAppointmentHref(item)}
      />
    </li>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
      <p>{message}</p>
    </div>
  );
}

// Vista "Hoje" - lista cronologica simples, sem agrupamento.
export function AppointmentListToday({
  items,
  currency,
  revenueCategories,
  defaultCategoryId,
}: {
  items: AppointmentListItem[];
  currency: Currency;
  revenueCategories: { id: string; name: string }[];
  defaultCategoryId: string | null;
}) {
  if (items.length === 0) {
    return <EmptyState message="Nenhum agendamento para hoje." />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <AppointmentRow key={item.id} item={item} currency={currency} revenueCategories={revenueCategories} defaultCategoryId={defaultCategoryId} />
      ))}
    </ul>
  );
}

// Vista "Semana" - lista agrupada por dia (sem grade, sem arrastar e
// soltar), agrupamento pelo dia calendario de Toquio de cada agendamento.
export function AppointmentListWeek({
  items,
  currency,
  revenueCategories,
  defaultCategoryId,
}: {
  items: AppointmentListItem[];
  currency: Currency;
  revenueCategories: { id: string; name: string }[];
  defaultCategoryId: string | null;
}) {
  if (items.length === 0) {
    return <EmptyState message="Nenhum agendamento nesta semana." />;
  }

  const groups = new Map<string, AppointmentListItem[]>();
  for (const item of items) {
    const key = formatTokyoDateKey(item.startAt);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  const orderedKeys = [...groups.keys()].sort();

  return (
    <div className="flex flex-col gap-6">
      {orderedKeys.map((key) => (
        <div key={key} className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase text-gray-500 dark:text-neutral-400">{formatTokyoDate(groups.get(key)![0].startAt)}</h3>
          <ul className="flex flex-col gap-2">
            {groups.get(key)!.map((item) => (
              <AppointmentRow
                key={item.id}
                item={item}
                currency={currency}
                revenueCategories={revenueCategories}
                defaultCategoryId={defaultCategoryId}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

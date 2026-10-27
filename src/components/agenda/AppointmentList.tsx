import Link from "next/link";
import type { AppointmentStatus, Currency, SaleStatus } from "@prisma/client";
import { formatAgendaDateLong, formatAgendaTime } from "@/lib/agenda/time";
import { groupAppointmentsByDay } from "@/lib/agenda/calendar";
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

// Exportado (redesign do Calendario) - reaproveitado tanto pelo painel do
// dia no Calendario quanto pela lista por dia da aba Mes, sem duplicar
// nenhuma logica de status/acoes (AppointmentActions ja cuida disso).
export function AppointmentRow({
  item,
  currency,
  revenueCategories,
  defaultCategoryId,
  timeZone,
  todayKey,
}: {
  item: AppointmentListItem;
  currency: Currency;
  revenueCategories: { id: string; name: string }[];
  defaultCategoryId: string | null;
  // Fuso da empresa (Etapa F3c) - horarios exibidos nele.
  timeZone: string;
  // "Hoje" da empresa (DateKey, do servidor) - data inicial das parcelas no
  // dialogo de conclusao (Etapa F4).
  todayKey: string;
}) {
  return (
    <li className="flex flex-col gap-3 border border-gray-200 p-4 dark:border-neutral-800 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
            {formatAgendaTime(item.startAt, timeZone)}–{formatAgendaTime(item.endAt, timeZone)}
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
        todayKey={todayKey}
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

// Lista cronologica simples, sem agrupamento - usada pela aba Dia e pelo
// painel do dia selecionado no Calendario (redesign). `emptyMessage` e
// configuravel porque o mesmo componente mostra "hoje" (aba Dia na data
// atual) ou um dia qualquer navegado/selecionado.
export function AppointmentSimpleList({
  items,
  emptyMessage,
  currency,
  revenueCategories,
  defaultCategoryId,
  timeZone,
  todayKey,
}: {
  items: AppointmentListItem[];
  emptyMessage: string;
  currency: Currency;
  revenueCategories: { id: string; name: string }[];
  defaultCategoryId: string | null;
  timeZone: string;
  todayKey: string;
}) {
  if (items.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <AppointmentRow key={item.id} item={item} currency={currency} revenueCategories={revenueCategories} defaultCategoryId={defaultCategoryId} timeZone={timeZone} todayKey={todayKey} />
      ))}
    </ul>
  );
}

// Lista agrupada por dia (sem grade, sem arrastar e soltar) - usada pela aba
// Mes (redesign). Agrupamento pelo dia calendario (no fuso da empresa) de cada
// agendamento (groupAppointmentsByDay, calendar.ts).
export function AppointmentGroupedList({
  items,
  emptyMessage,
  currency,
  revenueCategories,
  defaultCategoryId,
  timeZone,
  todayKey,
}: {
  items: AppointmentListItem[];
  emptyMessage: string;
  currency: Currency;
  revenueCategories: { id: string; name: string }[];
  defaultCategoryId: string | null;
  timeZone: string;
  todayKey: string;
}) {
  if (items.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  const groups = groupAppointmentsByDay(items, timeZone);
  const orderedKeys = [...groups.keys()].sort();

  return (
    <div className="flex flex-col gap-6">
      {orderedKeys.map((key) => (
        <div key={key} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{formatAgendaDateLong(groups.get(key)![0].startAt, timeZone)}</h3>
          <ul className="flex flex-col gap-2">
            {groups.get(key)!.map((item) => (
              <AppointmentRow
                key={item.id}
                item={item}
                currency={currency}
                revenueCategories={revenueCategories}
                defaultCategoryId={defaultCategoryId}
                timeZone={timeZone}
                todayKey={todayKey}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

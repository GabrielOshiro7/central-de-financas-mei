import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { AppointmentKind, AppointmentStatus, Currency, SaleStatus } from "@prisma/client";
import { formatAgendaTime } from "@/lib/agenda/time";
import { formatDateKey } from "@/lib/time/zoned";
import { AppointmentStatusBadge } from "@/components/agenda/AppointmentStatusBadge";
import { NoValueBadge } from "@/components/agenda/NoValueBadge";
import { AppointmentActions } from "@/components/agenda/AppointmentActions";
import { DayAppointmentActions } from "@/components/agenda/DayAppointmentActions";
import type { CompleteDialogItem } from "@/components/agenda/CompleteAppointmentDialog";

// Item da lista nos DOIS fluxos (Agenda A3). `dayKey` e o dia de calendario
// no fuso da empresa (DAY: o proprio dia; TIMED: o dia do inicio). Valores ja
// formatados no servidor.
export type AppointmentListItem = {
  id: string;
  kind: AppointmentKind;
  dayKey: string;
  // So TIMED (legado): horario.
  startAt: Date | null;
  endAt: Date | null;
  status: AppointmentStatus;
  // Nulos so no DAY sem valor (ex.: reuniao), que nao exige cliente.
  clientId: string | null;
  clientName: string | null;
  // So DAY: titulo do agendamento (identificacao principal quando existe).
  title: string | null;
  // So DAY: total zero ("Sem valor") - sem informacao de pagamento.
  noValue: boolean;
  serviceNames: string[];
  serviceIds: string[];
  // Valor do atendimento formatado (DAY: soma dos servicos; TIMED: venda ou
  // precos padrao). So exibido no DAY, que e onde o valor e definido.
  amountLabel: string;
  // So DAY: condicao/meio de pagamento ("À vista · PIX", "A prazo · 2 parcelas").
  paymentLabel: string | null;
  saleId: string | null;
  saleNumber: number | null;
  saleStatus: SaleStatus | null;
  // Soma das parcelas ja recebidas da venda, formatada (null: nada recebido)
  // - o que um Desfazer tira do Caixa e do Dashboard (Agenda A4).
  receivedLabel: string | null;
  // So DAY: dia ja encerrado, ainda AGENDADO e elegivel - a conclusao
  // automatica nao conseguiu concluir (Agenda A5).
  autoCompleteFailed: boolean;
  // So TIMED: itens pre-preenchidos do modal de conclusao.
  completeItems: CompleteDialogItem[];
};

// Total de um dia/mes (agendamentos nao cancelados e sem falta), formatado.
export type AgendaTotalsLabel = { count: number; amountLabel: string };

export function totalsText(totals: AgendaTotalsLabel): string {
  return `${totals.count} ${totals.count === 1 ? "atendimento" : "atendimentos"} · ${totals.amountLabel}`;
}

function nextAppointmentHref(item: AppointmentListItem): string {
  const params = new URLSearchParams();
  if (item.clientId) params.set("clientId", item.clientId);
  for (const serviceId of item.serviceIds) params.append("serviceId", serviceId);
  return `/agenda/novo?${params.toString()}`;
}

type RowContext = {
  currency: Currency;
  revenueCategories: { id: string; name: string }[];
  defaultCategoryId: string | null;
  // Fuso da empresa (Etapa F3c) - horarios TIMED exibidos nele.
  timeZone: string;
  // "Hoje" da empresa (DateKey, do servidor).
  todayKey: string;
};

// Identificacao de um DAY na lista: o titulo, se houver; senao o cliente;
// senao os servicos. A linha de baixo traz o que sobrou (cliente quando o
// titulo e o principal, e os servicos).
function dayIdentity(item: AppointmentListItem): { primary: string; secondary: string } {
  const services = item.serviceNames.join(", ");
  const primary = item.title ?? item.clientName ?? (services || "Agendamento");
  const parts = [item.title ? item.clientName : null, item.title || item.clientName ? services : null];
  return { primary, secondary: parts.filter(Boolean).join(" · ") };
}

// Mesma linha nas tres abas (Calendario, Dia, Mes) - as acoes dependem so do
// fluxo e do status, nunca da aba.
export function AppointmentRow({ item, ...ctx }: { item: AppointmentListItem } & RowContext) {
  if (item.kind === "DAY") {
    const identity = dayIdentity(item);
    return (
      <li
        data-testid="appointment-row"
        className="flex flex-col gap-3 border border-gray-200 p-4 dark:border-neutral-800 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{identity.primary}</span>
            <AppointmentStatusBadge status={item.status} />
            {item.noValue && <NoValueBadge />}
          </div>
          {identity.secondary && <p className="text-sm text-gray-500 dark:text-neutral-400">{identity.secondary}</p>}
          {/* Sem valor: nenhuma informacao de dinheiro/pagamento (o selo ja diz). */}
          {!item.noValue && (
            <p className="text-sm text-gray-700 dark:text-neutral-300">
              <span className="font-medium">{item.amountLabel}</span>
              {item.paymentLabel ? ` · ${item.paymentLabel}` : ""}
            </p>
          )}
          {item.autoCompleteFailed && (
            <p data-testid="auto-complete-failed" className="flex items-center gap-1 text-sm text-gray-700 dark:text-neutral-300">
              <AlertTriangle size={14} aria-hidden="true" />
              Não foi possível concluir automaticamente — verifique.
            </p>
          )}
        </div>
        <DayAppointmentActions
          appointmentId={item.id}
          status={item.status}
          dayKey={item.dayKey}
          todayKey={ctx.todayKey}
          saleId={item.saleId}
          saleNumber={item.saleNumber}
          saleStatus={item.saleStatus}
          receivedLabel={item.receivedLabel}
          noValue={item.noValue}
        />
      </li>
    );
  }

  // TIMED (legado): exatamente como antes da Agenda A3.
  return (
    <li
      data-testid="appointment-row"
      className="flex flex-col gap-3 border border-gray-200 p-4 dark:border-neutral-800 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
            {formatAgendaTime(item.startAt!, ctx.timeZone)}–{formatAgendaTime(item.endAt!, ctx.timeZone)}
          </span>
          <AppointmentStatusBadge status={item.status} />
        </div>
        <p className="text-sm text-gray-700 dark:text-neutral-300">{item.clientName ?? ""}</p>
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
        receivedLabel={item.receivedLabel}
        currency={ctx.currency}
        revenueCategories={ctx.revenueCategories}
        defaultCategoryId={ctx.defaultCategoryId}
        completeItems={item.completeItems}
        nextAppointmentHref={nextAppointmentHref(item)}
        todayKey={ctx.todayKey}
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

// Lista de um dia, na ordem recebida (TIMED pelo horario, depois DAY) - aba
// Dia e painel do dia selecionado no Calendario.
export function AppointmentSimpleList({ items, emptyMessage, ...ctx }: { items: AppointmentListItem[]; emptyMessage: string } & RowContext) {
  if (items.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <AppointmentRow key={item.id} item={item} {...ctx} />
      ))}
    </ul>
  );
}

// Lista agrupada por dia (aba Mes): pelo `dayKey` de cada item, com o total
// do dia no cabecalho. A ordem dentro do dia e a recebida.
export function AppointmentGroupedList({
  items,
  emptyMessage,
  dayTotals,
  ...ctx
}: { items: AppointmentListItem[]; emptyMessage: string; dayTotals: Record<string, AgendaTotalsLabel> } & RowContext) {
  if (items.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  const groups = new Map<string, AppointmentListItem[]>();
  for (const item of items) groups.set(item.dayKey, [...(groups.get(item.dayKey) ?? []), item]);
  const orderedKeys = [...groups.keys()].sort();

  return (
    <div className="flex flex-col gap-6">
      {orderedKeys.map((key) => (
        <div key={key} className="flex flex-col gap-2" data-testid={`agenda-day-${key}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{formatDateKey(key, "long")}</h3>
            {dayTotals[key] && (
              <p className="text-xs text-gray-500 dark:text-neutral-400">Total do dia: {totalsText(dayTotals[key])}</p>
            )}
          </div>
          <ul className="flex flex-col gap-2">
            {groups.get(key)!.map((item) => (
              <AppointmentRow key={item.id} item={item} {...ctx} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

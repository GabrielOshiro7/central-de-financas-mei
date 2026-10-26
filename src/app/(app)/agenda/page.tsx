import type { ReactNode } from "react";
import Link from "next/link";
import type { AppointmentStatus } from "@prisma/client";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { agendaDateKey, formatAgendaDateLong, formatAgendaMonthYear } from "@/lib/agenda/time";
import { listAppointmentsForRange, listAppointmentsForMonth, getLastUsedCompletionCategoryId } from "@/lib/agenda/queries";
import {
  agendaMonthRange,
  agendaDayRange,
  buildMonthGrid,
  groupAppointmentsByDay,
  hasVisibleAppointment,
} from "@/lib/agenda/calendar";
import { parseMonthParam, parseDayParam } from "@/lib/agenda/schema";
import { listVisibleCategories } from "@/lib/finance/categories";
import { AppointmentSimpleList, AppointmentGroupedList, type AppointmentListItem } from "@/components/agenda/AppointmentList";
import { AgendaCalendarGrid, type CalendarDayCell } from "@/components/agenda/AgendaCalendarGrid";
import { MonthSummary } from "@/components/agenda/MonthSummary";
import { CREATE_BUTTON_CLASS, CreateButtonContent } from "@/components/CreateButton";

const tabButtonClass = (active: boolean) =>
  `px-3 py-1.5 text-sm font-medium transition ${
    active
      ? "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
      : "border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
  }`;

type View = "calendar" | "day" | "month";
const EMPTY_COUNTS: Record<AppointmentStatus, number> = {
  AGENDADO: 0,
  CONFIRMADO: 0,
  CONCLUIDO: 0,
  CANCELADO: 0,
  FALTOU: 0,
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function monthParamString(year: number, month: number): string {
  return `${pad(year, 4)}-${pad(month, 2)}`;
}

type RawAppointment = Awaited<ReturnType<typeof listAppointmentsForRange>>[number];

// Mesmo mapeamento ja usado pela pagina antes do redesign (view=today/week) -
// reaproveitado tal como estava, so extraido pra uma funcao porque agora e
// chamado tanto pro range do mes (Calendario/Mes) quanto pro range do dia
// (aba Dia).
function toListItems(appointments: RawAppointment[]): AppointmentListItem[] {
  return appointments.map((appointment) => ({
    id: appointment.id,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    status: appointment.status,
    clientId: appointment.clientId,
    clientName: appointment.client.name,
    serviceNames: appointment.services.map((s) => s.nameSnapshot),
    serviceIds: appointment.services.map((s) => s.productId).filter((id): id is string => Boolean(id)),
    saleId: appointment.saleId,
    saleNumber: appointment.sale?.saleNumber ?? null,
    saleStatus: appointment.sale?.status ?? null,
    completeItems: appointment.services.map((s) => ({
      productId: s.productId,
      description: s.nameSnapshot,
      quantity: 1,
      unitPrice: s.product?.defaultPrice ? Number(s.product.defaultPrice) : 0,
    })),
  }));
}

function NewAppointmentShortcut({ dateKey }: { dateKey: string }) {
  return (
    <Link
      href={`/agenda/novo?date=${dateKey}`}
      className="text-sm font-medium text-gray-900 hover:underline dark:text-neutral-100"
    >
      + Novo agendamento nesta data
    </Link>
  );
}

export default async function AgendaPage(props: PageProps<"/agenda">) {
  const searchParams = await props.searchParams;
  const { business } = await requireOnboardedUser();
  // Fuso da empresa ja carregada (Etapa F3c; antes fixo em Asia/Tokyo).
  const timeZone = business.timezone;

  const now = new Date();
  const todayKey = agendaDateKey(now, timeZone);
  const todayYear = Number(todayKey.slice(0, 4));
  const todayMonth = Number(todayKey.slice(5, 7));

  const parsedDay = parseDayParam(searchParams.day);
  const parsedMonth = parseMonthParam(searchParams.month);
  const rawView = typeof searchParams.view === "string" ? searchParams.view : undefined;

  // Compatibilidade com a navegacao anterior (secao 1 do redesign):
  // view=today vira view=day (com `day` default hoje); view=week vira
  // view=calendar; qualquer valor desconhecido cai em "calendar".
  let view: View;
  if (rawView === "today") view = "day";
  else if (rawView === "week") view = "calendar";
  else if (rawView === "day" || rawView === "month" || rawView === "calendar") view = rawView;
  else view = "calendar";

  // Mes efetivamente exibido pelo Calendario/Mes: `month` da URL: senao o mes
  // do `day` informado (navegar direto pra um dia deve mostrar o mes dele);
  // senao o mes atual.
  const { year, month } = parsedMonth ?? (parsedDay ? { year: Number(parsedDay.slice(0, 4)), month: Number(parsedDay.slice(5, 7)) } : { year: todayYear, month: todayMonth });

  const monthString = monthParamString(year, month);
  const dayIsInDisplayedMonth = parsedDay !== null && parsedDay.slice(0, 7) === monthString;
  // Dia pre-selecionado no painel do Calendario (secao 4): hoje, se o mes
  // exibido for o mes atual; senao nenhuma selecao. `day` da URL so e
  // respeitado quando cai dentro do mes exibido (evita selecionar um dia que
  // nem aparece na grade atual).
  const calendarSelectedKey = dayIsInDisplayedMonth ? parsedDay : year === todayYear && month === todayMonth ? todayKey : null;

  // Dia exibido pela aba Dia - sempre hoje por padrao (independente do mes
  // exibido no Calendario), com setas proprias de navegacao dia-a-dia.
  const dayTabKey = parsedDay ?? todayKey;

  const [revenueCategories, defaultCategoryId] = await Promise.all([
    listVisibleCategories(business.id, "REVENUE"),
    getLastUsedCompletionCategoryId(business.id),
  ]);
  const revenueCategoryOptions = revenueCategories.map((c) => ({ id: c.id, name: c.name }));

  const monthLabel = capitalize(formatAgendaMonthYear(agendaMonthRange(year, month, timeZone).start, timeZone));

  function tabHref(tab: View): string {
    const params = new URLSearchParams();
    params.set("view", tab);
    if (tab === "day") {
      params.set("day", dayTabKey);
    } else {
      params.set("month", monthString);
      if (calendarSelectedKey) params.set("day", calendarSelectedKey);
    }
    return `/agenda?${params.toString()}`;
  }

  let content: ReactNode;

  if (view === "day") {
    const { start, end } = agendaDayRange(dayTabKey, timeZone);
    const appointments = await listAppointmentsForRange(business.id, start, end);
    const items = toListItems(appointments);
    const previousHref = `/agenda?view=day&day=${agendaDateKey(new Date(start.getTime() - 1), timeZone)}`;
    const nextHref = `/agenda?view=day&day=${agendaDateKey(end, timeZone)}`;
    const emptyMessage = dayTabKey === todayKey ? "Nenhum agendamento para hoje." : "Nenhum agendamento neste dia.";

    content = (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <Link href={previousHref} className="border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
            ‹ Anterior
          </Link>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900 dark:text-neutral-100">{formatAgendaDateLong(start, timeZone)}</h2>
            {dayTabKey !== todayKey && (
              <Link href={`/agenda?view=day&day=${todayKey}`} className="border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
                Hoje
              </Link>
            )}
          </div>
          <Link href={nextHref} className="border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
            Próximo ›
          </Link>
        </div>
        <AppointmentSimpleList items={items} emptyMessage={emptyMessage} currency={business.currency} revenueCategories={revenueCategoryOptions} defaultCategoryId={defaultCategoryId} timeZone={timeZone} />
      </div>
    );
  } else {
    // Calendario e Mes compartilham a mesma consulta (o mes inteiro) - a
    // diferenca e so como o resultado e apresentado.
    const monthAppointments = await listAppointmentsForMonth(business.id, year, month, timeZone);
    const grouped = groupAppointmentsByDay(monthAppointments, timeZone);

    if (view === "month") {
      const items = toListItems(monthAppointments);
      const counts: Record<AppointmentStatus, number> = { ...EMPTY_COUNTS };
      for (const appointment of monthAppointments) counts[appointment.status] += 1;

      content = (
        <div className="flex flex-col gap-6">
          <MonthNav year={year} month={month} monthLabel={monthLabel} />
          <MonthSummary counts={counts} />
          <AppointmentGroupedList
            items={items}
            emptyMessage="Nenhum agendamento neste mês."
            currency={business.currency}
            revenueCategories={revenueCategoryOptions}
            defaultCategoryId={defaultCategoryId}
            timeZone={timeZone}
          />
        </div>
      );
    } else {
      const weeks: (CalendarDayCell | null)[][] = buildMonthGrid(year, month, timeZone).map((week) =>
        week.map((cell) => {
          if (!cell) return null;
          const dayAppointments = grouped.get(cell.dateKey) ?? [];
          return {
            dateKey: cell.dateKey,
            dayNumber: Number(cell.dateKey.slice(8, 10)),
            hasAppointment: hasVisibleAppointment(dayAppointments),
            appointmentCount: dayAppointments.length,
            fullDateLabel: formatAgendaDateLong(cell.date, timeZone),
          };
        })
      );

      const selectedItems = calendarSelectedKey ? toListItems(grouped.get(calendarSelectedKey) ?? []) : [];

      content = (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,480px)_1fr]">
          <AgendaCalendarGrid
            // Força remontar (zera foco/seletor locais) sempre que o
            // servidor de fato navegou pra um mes/dia diferente - nunca um
            // efeito de sincronizacao no componente (ver comentario la).
            key={`${monthString}:${calendarSelectedKey ?? ""}`}
            year={year}
            month={month}
            monthLabel={monthLabel}
            weeks={weeks}
            todayKey={todayKey}
            selectedKey={calendarSelectedKey}
          />
          <div className="flex flex-col gap-4">
            {calendarSelectedKey ? (
              <>
                <h2 className="text-base font-semibold text-gray-900 dark:text-neutral-100">{formatAgendaDateLong(agendaDayRange(calendarSelectedKey, timeZone).start, timeZone)}</h2>
                {selectedItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
                    <p>Nenhum agendamento neste dia.</p>
                    <NewAppointmentShortcut dateKey={calendarSelectedKey} />
                  </div>
                ) : (
                  <AppointmentSimpleList
                    items={selectedItems}
                    emptyMessage="Nenhum agendamento neste dia."
                    currency={business.currency}
                    revenueCategories={revenueCategoryOptions}
                    defaultCategoryId={defaultCategoryId}
                    timeZone={timeZone}
                  />
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
                <p>Selecione um dia no calendário para ver os agendamentos.</p>
              </div>
            )}
          </div>
        </div>
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Agenda</h1>
        <Link href="/agenda/novo" className={CREATE_BUTTON_CLASS}>
          <CreateButtonContent label="Novo agendamento" />
        </Link>
      </div>

      <div className="flex gap-2">
        <Link href={tabHref("calendar")} className={tabButtonClass(view === "calendar")}>
          Calendário
        </Link>
        <Link href={tabHref("day")} className={tabButtonClass(view === "day")}>
          Dia
        </Link>
        <Link href={tabHref("month")} className={tabButtonClass(view === "month")}>
          Mês
        </Link>
      </div>

      {content}
    </div>
  );
}

// Cabecalho de navegacao de mes/ano da aba Mes - mesma ideia do cabecalho do
// Calendario, mas so navegacao (Link puro), sem seletor de mes/ano por
// grade nem teclado: a aba Mes e uma lista, nao uma grade clicavel.
function MonthNav({ year, month, monthLabel }: { year: number; month: number; monthLabel: string }) {
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        href={`/agenda?view=month&month=${monthParamString(previousYear, previousMonth)}`}
        className="border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        ‹ Mês anterior
      </Link>
      <h2 className="text-base font-semibold text-gray-900 dark:text-neutral-100">{monthLabel}</h2>
      <Link
        href={`/agenda?view=month&month=${monthParamString(nextYear, nextMonth)}`}
        className="border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        Próximo mês ›
      </Link>
    </div>
  );
}

import type { ReactNode } from "react";
import Link from "next/link";
import { Prisma, type AppointmentStatus } from "@prisma/client";
import { requireOnboardedUser } from "@/lib/auth/guards";
import type { Currency } from "@prisma/client";
import { agendaDateKey, formatAgendaDateLong, formatAgendaMonthYear } from "@/lib/agenda/time";
import {
  getLastUsedCompletionCategoryId,
  listAgendaForDay,
  listAgendaForMonth,
  summarizeAgenda,
  type AgendaEntry,
} from "@/lib/agenda/queries";
import { agendaMonthRange, agendaDayRange, buildMonthGrid, hasVisibleAppointment } from "@/lib/agenda/calendar";
import { parseMonthParam, parseDayParam } from "@/lib/agenda/schema";
import { listVisibleCategories } from "@/lib/finance/categories";
import { formatMoney } from "@/lib/money";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/sales/options";
import {
  AppointmentSimpleList,
  AppointmentGroupedList,
  totalsText,
  type AgendaTotalsLabel,
  type AppointmentListItem,
} from "@/components/agenda/AppointmentList";
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

const PAYMENT_METHOD_LABELS = new Map(PAYMENT_METHOD_OPTIONS.map((o) => [o.value, o.label]));

// Condicao/meio de pagamento de um agendamento DAY ("À vista · Pix",
// "A prazo · 2 parcelas · Boleto").
function paymentLabel(entry: AgendaEntry): string | null {
  if (entry.kind !== "DAY") return null;
  const method = entry.paymentMethod ? (PAYMENT_METHOD_LABELS.get(entry.paymentMethod) ?? entry.paymentMethod) : null;
  const timing =
    entry.paymentTiming === "APRAZO"
      ? `A prazo · ${entry._count.installments} ${entry._count.installments === 1 ? "parcela" : "parcelas"}`
      : "À vista";
  return method ? `${timing} · ${method}` : timing;
}

// Soma das parcelas ja recebidas da venda (Agenda A4) - o que um Desfazer
// estorna. null quando nao ha venda ativa ou nada foi recebido.
function receivedLabel(entry: AgendaEntry, currency: Currency): string | null {
  if (!entry.sale || entry.sale.status === "CANCELLED") return null;
  const received = entry.sale.bills.reduce((sum, b) => sum.plus(b.amount), new Prisma.Decimal(0));
  return received.isZero() ? null : formatMoney(received, currency);
}

// Agendamentos (dos dois fluxos, Agenda A3) -> itens da lista, na ordem da
// consulta (por dia; TIMED pelo horario, depois DAY por createdAt/id). TIMED
// mantem o mapeamento de antes (itens pre-preenchidos do modal de conclusao).
function toListItems(entries: AgendaEntry[], currency: Currency): AppointmentListItem[] {
  return entries.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    dayKey: entry.dayKey,
    startAt: entry.startAt,
    endAt: entry.endAt,
    status: entry.status,
    clientId: entry.clientId,
    clientName: entry.client.name,
    serviceNames: entry.services.map((s) => (entry.kind === "DAY" && s.quantity > 1 ? `${s.nameSnapshot} × ${s.quantity}` : s.nameSnapshot)),
    serviceIds: entry.services.map((s) => s.productId).filter((id): id is string => Boolean(id)),
    amountLabel: formatMoney(entry.amount, currency),
    paymentLabel: paymentLabel(entry),
    saleId: entry.saleId,
    saleNumber: entry.sale?.saleNumber ?? null,
    saleStatus: entry.sale?.status ?? null,
    receivedLabel: receivedLabel(entry, currency),
    completeItems:
      entry.kind === "TIMED"
        ? entry.services.map((s) => ({
            productId: s.productId,
            description: s.nameSnapshot,
            quantity: 1,
            unitPrice: s.product?.defaultPrice ? Number(s.product.defaultPrice) : 0,
          }))
        : [],
  }));
}

function totalsLabel(entries: AgendaEntry[], currency: Currency): AgendaTotalsLabel {
  const totals = summarizeAgenda(entries);
  return { count: totals.count, amountLabel: formatMoney(totals.amount, currency) };
}

function groupByDay(entries: AgendaEntry[]): Map<string, AgendaEntry[]> {
  const groups = new Map<string, AgendaEntry[]>();
  for (const entry of entries) groups.set(entry.dayKey, [...(groups.get(entry.dayKey) ?? []), entry]);
  return groups;
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
  // ?day= aceita "2026-02-31" (o schema so checa o formato): normaliza pelo
  // agendaDayRange, como sempre (vira 03/03), antes de consultar por dia.
  const dayTabKey = parsedDay ? agendaDateKey(agendaDayRange(parsedDay, timeZone).start, timeZone) : todayKey;

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
    const entries = await listAgendaForDay(business.id, dayTabKey, timeZone);
    const items = toListItems(entries, business.currency);
    const dayTotals = totalsLabel(entries, business.currency);
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
        {items.length > 0 && <p className="text-sm text-gray-600 dark:text-neutral-400">Total do dia: {totalsText(dayTotals)}</p>}
        <AppointmentSimpleList items={items} emptyMessage={emptyMessage} currency={business.currency} revenueCategories={revenueCategoryOptions} defaultCategoryId={defaultCategoryId} timeZone={timeZone} todayKey={todayKey} />
      </div>
    );
  } else {
    // Calendario e Mes compartilham a mesma consulta (o mes inteiro) - a
    // diferenca e so como o resultado e apresentado.
    const monthAppointments = await listAgendaForMonth(business.id, year, month, timeZone);
    const grouped = groupByDay(monthAppointments);

    if (view === "month") {
      const items = toListItems(monthAppointments, business.currency);
      const counts: Record<AppointmentStatus, number> = { ...EMPTY_COUNTS };
      for (const appointment of monthAppointments) counts[appointment.status] += 1;
      const dayTotals = Object.fromEntries([...grouped].map(([key, entries]) => [key, totalsLabel(entries, business.currency)]));
      const monthTotals = totalsLabel(monthAppointments, business.currency);

      content = (
        <div className="flex flex-col gap-6">
          <MonthNav year={year} month={month} monthLabel={monthLabel} />
          <MonthSummary counts={counts} />
          <p className="text-sm text-gray-600 dark:text-neutral-400">Total do mês: {totalsText(monthTotals)}</p>
          <AppointmentGroupedList
            items={items}
            dayTotals={dayTotals}
            emptyMessage="Nenhum agendamento neste mês."
            currency={business.currency}
            revenueCategories={revenueCategoryOptions}
            defaultCategoryId={defaultCategoryId}
            timeZone={timeZone}
            todayKey={todayKey}
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

      const selectedItems = calendarSelectedKey ? toListItems(grouped.get(calendarSelectedKey) ?? [], business.currency) : [];

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
                    todayKey={todayKey}
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

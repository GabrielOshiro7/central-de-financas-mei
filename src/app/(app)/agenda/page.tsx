import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { todayRangeTokyo, weekRangeTokyo } from "@/lib/agenda/time";
import { listAppointmentsForRange, getLastUsedCompletionCategoryId } from "@/lib/agenda/queries";
import { listVisibleCategories } from "@/lib/finance/categories";
import { AppointmentListToday, AppointmentListWeek, type AppointmentListItem } from "@/components/agenda/AppointmentList";

const newAppointmentButtonClass =
  "bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200";
const tabButtonClass = (active: boolean) =>
  `px-3 py-1.5 text-sm font-medium transition ${
    active
      ? "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
      : "border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
  }`;

export default async function AgendaPage(props: PageProps<"/agenda">) {
  const searchParams = await props.searchParams;
  const { business } = await requireOnboardedUser();

  const view = searchParams.view === "week" ? "week" : "today";
  const now = new Date();
  const { start, end } = view === "week" ? weekRangeTokyo(now) : todayRangeTokyo(now);

  const [appointments, revenueCategories, defaultCategoryId] = await Promise.all([
    listAppointmentsForRange(business.id, start, end),
    listVisibleCategories(business.id, "REVENUE"),
    getLastUsedCompletionCategoryId(business.id),
  ]);

  const items: AppointmentListItem[] = appointments.map((appointment) => ({
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

  const revenueCategoryOptions = revenueCategories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Agenda</h1>
        <Link href="/agenda/novo" className={newAppointmentButtonClass}>
          + Novo agendamento
        </Link>
      </div>

      <div className="flex gap-2">
        <Link href="/agenda?view=today" className={tabButtonClass(view === "today")}>
          Hoje
        </Link>
        <Link href="/agenda?view=week" className={tabButtonClass(view === "week")}>
          Semana
        </Link>
      </div>

      {view === "today" ? (
        <AppointmentListToday items={items} currency={business.currency} revenueCategories={revenueCategoryOptions} defaultCategoryId={defaultCategoryId} />
      ) : (
        <AppointmentListWeek items={items} currency={business.currency} revenueCategories={revenueCategoryOptions} defaultCategoryId={defaultCategoryId} />
      )}
    </div>
  );
}

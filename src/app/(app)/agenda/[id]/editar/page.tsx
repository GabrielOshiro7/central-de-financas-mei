import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { getAppointmentById } from "@/lib/agenda/queries";
import { listVisibleProducts } from "@/lib/products/queries";
import { listVisibleCategories } from "@/lib/finance/categories";
import { agendaDateKey, formatAgendaTime } from "@/lib/agenda/time";
import { defaultServiceRevenueCategoryId, requireTimed } from "@/lib/agenda/calculations";
import { AppointmentForm } from "@/components/agenda/AppointmentForm";
import { DayAppointmentForm } from "@/components/agenda/DayAppointmentForm";
import { clockFor, dbDateToKey, todayKey } from "@/lib/time/zoned";

function NotEditable() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
      <p>Este agendamento não pode mais ser editado (status atual não permite).</p>
    </div>
  );
}

// Editar: o formulario e o do fluxo do proprio agendamento - por dia (DAY,
// so em AGENDADO) ou com horario (TIMED, legado, em AGENDADO/CONFIRMADO).
export default async function EditarAgendamentoPage(props: PageProps<"/agenda/[id]/editar">) {
  const { id } = await props.params;
  const { business } = await requireOnboardedUser();

  const appointment = await getAppointmentById(business.id, id);
  if (!appointment) notFound();

  const services = await listVisibleProducts(business.id, undefined, "SERVICO");
  // So o cliente do agendamento (ativo ou nao): a busca de clientes e feita no
  // servidor pelo ClientPicker.
  // (DAY sem valor pode nao ter cliente.)
  const clientOption = appointment.client
    ? { id: appointment.client.id, name: appointment.client.name, tradeName: appointment.client.tradeName ?? "" }
    : null;

  let content;
  if (appointment.kind === "DAY") {
    const categories = await listVisibleCategories(business.id, "REVENUE");
    // Servico do agendamento que saiu do catalogo visivel continua na lista
    // (com o nome do snapshot) para a linha nao ficar sem nome.
    const serviceOptions = services.map((s) => ({ id: s.id, name: s.name, defaultPrice: s.defaultPrice?.toString() ?? "" }));
    for (const s of appointment.services) {
      if (s.productId && !serviceOptions.some((o) => o.id === s.productId)) {
        serviceOptions.push({ id: s.productId, name: s.nameSnapshot, defaultPrice: s.unitPrice?.toString() ?? "" });
      }
    }
    content =
      appointment.status !== "AGENDADO" ? (
        <NotEditable />
      ) : (
        <DayAppointmentForm
          mode="edit"
          initial={{
            id: appointment.id,
            clientId: appointment.clientId ?? "",
            title: appointment.title ?? "",
            scheduledOn: dbDateToKey(appointment.scheduledOn!),
            services: appointment.services
              .filter((s): s is typeof s & { productId: string } => Boolean(s.productId))
              .map((s) => ({ productId: s.productId, quantity: String(s.quantity), unitPrice: s.unitPrice?.toString() ?? "0" })),
            categoryId: appointment.categoryId ?? "",
            paymentTiming: appointment.paymentTiming ?? "AVISTA",
            paymentMethod: appointment.paymentMethod ?? "",
            installments: appointment.installments.map((i) => ({ dueDateInput: dbDateToKey(i.dueOn), amount: i.amount.toString() })),
            notes: appointment.notes ?? "",
          }}
          initialClient={clientOption}
          services={serviceOptions}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          // Sem valor nao tem categoria gravada: ao adicionar valor, pre-seleciona a
          // padrao como na criacao.
          defaultCategoryId={appointment.categoryId ?? defaultServiceRevenueCategoryId(categories)}
          currency={business.currency}
          todayKey={todayKey(clockFor(business))}
        />
      );
  } else {
    const timed = requireTimed(appointment);
    if (!clientOption) notFound(); // TIMED sempre tem cliente (CHECK appointments_timed_client_check)
    const editable = timed.status === "AGENDADO" || timed.status === "CONFIRMADO";
    const initialStartAt = `${agendaDateKey(timed.startAt, business.timezone)}T${formatAgendaTime(timed.startAt, business.timezone)}`;
    content = !editable ? (
      <NotEditable />
    ) : (
      <AppointmentForm
        appointmentId={timed.id}
        initialClient={clientOption}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.durationMinutes ?? 0,
          defaultPrice: s.defaultPrice?.toString() ?? "",
        }))}
        currency={business.currency}
        initialServiceIds={timed.services.map((s) => s.productId).filter((sid): sid is string => Boolean(sid))}
        initialStartAt={initialStartAt}
        initialNotes={timed.notes ?? ""}
        timeZone={business.timezone}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Editar agendamento</h1>
        <Link href="/agenda" className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400">
          ← Voltar para agenda
        </Link>
      </div>
      {content}
    </div>
  );
}

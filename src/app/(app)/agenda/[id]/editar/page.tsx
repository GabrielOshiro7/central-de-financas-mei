import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { getAppointmentById } from "@/lib/agenda/queries";
import { listVisibleClients } from "@/lib/clients/queries";
import { listVisibleProducts } from "@/lib/products/queries";
import { agendaDateKey, formatAgendaTime } from "@/lib/agenda/time";
import { AppointmentForm } from "@/components/agenda/AppointmentForm";

export default async function EditarAgendamentoPage(props: PageProps<"/agenda/[id]/editar">) {
  const { id } = await props.params;
  const { business } = await requireOnboardedUser();

  const appointment = await getAppointmentById(business.id, id);
  if (!appointment) notFound();

  const [clients, services] = await Promise.all([
    listVisibleClients(business.id),
    listVisibleProducts(business.id, undefined, "SERVICO"),
  ]);

  const editable = appointment.status === "AGENDADO" || appointment.status === "CONFIRMADO";
  const initialStartAt = `${agendaDateKey(appointment.startAt, business.timezone)}T${formatAgendaTime(appointment.startAt, business.timezone)}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Editar agendamento</h1>
        <Link href="/agenda" className="text-sm font-medium text-gray-600 hover:underline dark:text-neutral-400">
          ← Voltar para agenda
        </Link>
      </div>

      {!editable ? (
        <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
          <p>Este agendamento não pode mais ser editado (status atual não permite).</p>
        </div>
      ) : (
        <AppointmentForm
          mode="edit"
          appointmentId={appointment.id}
          clients={clients.map((c) => ({ id: c.id, name: c.name, tradeName: c.tradeName ?? "" }))}
          services={services.map((s) => ({
            id: s.id,
            name: s.name,
            durationMinutes: s.durationMinutes ?? 0,
            defaultPrice: s.defaultPrice?.toString() ?? "",
          }))}
          currency={business.currency}
          initialClientId={appointment.clientId}
          initialServiceIds={appointment.services.map((s) => s.productId).filter((sid): sid is string => Boolean(sid))}
          initialStartAt={initialStartAt}
          initialNotes={appointment.notes ?? ""}
          timeZone={business.timezone}
        />
      )}
    </div>
  );
}

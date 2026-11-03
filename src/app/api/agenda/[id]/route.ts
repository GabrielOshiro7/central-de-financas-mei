import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { appointmentInputSchema, dayAppointmentInputSchema } from "@/lib/agenda/schema";
import { updateAppointment, updateDayAppointment } from "@/lib/agenda/mutations";
import { parseAgendaDateTimeInput } from "@/lib/agenda/time";

// Editar. Fluxo por dia (DAY, Agenda A3): so em AGENDADO. Fluxo com horario
// (TIMED, legado): remarcar em AGENDADO/CONFIRMADO, exatamente como antes (ver
// updateMany condicional em updateAppointment, mutations.ts). O fluxo vem do
// proprio agendamento, nunca do corpo. Sem DELETE de proposito (agendamento
// nunca e apagado fisicamente na v1 - cancelar e mudar status, ver
// status/route.ts).
export async function PATCH(request: Request, context: RouteContext<"/api/agenda/[id]">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const { id } = await context.params;
  const appointment = await prisma.appointment.findFirst({ where: { id, businessId: business.id }, select: { kind: true } });
  if (!appointment) {
    return NextResponse.json({ error: "Agendamento não encontrado." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);

  if (appointment.kind === "DAY") {
    const parsed = dayAppointmentInputSchema(business.currency).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
    }
    const result = await updateDayAppointment(business.id, id, parsed.data);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ id: result.value.id });
  }

  const parsed = appointmentInputSchema().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const data = parsed.data;
  const result = await updateAppointment(business.id, id, {
    clientId: data.clientId,
    startAt: parseAgendaDateTimeInput(data.startAt, business.timezone),
    services: data.services,
    notes: data.notes || null,
    allowOverlap: data.allowOverlap,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, conflicts: result.conflicts }, { status: result.conflicts ? 409 : 400 });
  }

  return NextResponse.json({ id: result.value.id });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { appointmentInputSchema } from "@/lib/agenda/schema";
import { updateAppointment } from "@/lib/agenda/mutations";
import { parseTokyoDateTimeInput } from "@/lib/agenda/time";

// Editar/remarcar - so em AGENDADO/CONFIRMADO (ver updateMany condicional em
// updateAppointment, mutations.ts). Sem DELETE de proposito (agendamento
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
  const body = await request.json().catch(() => null);
  const parsed = appointmentInputSchema().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const data = parsed.data;
  const result = await updateAppointment(business.id, id, {
    clientId: data.clientId,
    startAt: parseTokyoDateTimeInput(data.startAt),
    services: data.services,
    notes: data.notes || null,
    allowOverlap: data.allowOverlap,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, conflicts: result.conflicts }, { status: result.conflicts ? 409 : 400 });
  }

  return NextResponse.json({ id: result.value.id });
}

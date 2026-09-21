import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { appointmentStatusChangeSchema } from "@/lib/agenda/schema";
import { changeAppointmentStatus } from "@/lib/agenda/mutations";

// Confirmar/cancelar/faltou/reabrir - toda transicao passa por
// changeAppointmentStatus, que valida via canTransition (tabela exaustiva)
// e escreve via updateMany condicional no status de origem. `allowOverlap`
// so importa ao reabrir (CANCELADO/FALTOU -> AGENDADO), que reaplica a
// checagem de sobreposicao - ignorado pelas demais transicoes.
export async function POST(request: Request, context: RouteContext<"/api/agenda/[id]/status">) {
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
  const parsed = appointmentStatusChangeSchema().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const result = await changeAppointmentStatus(business.id, id, parsed.data.status, {
    allowOverlap: parsed.data.allowOverlap,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, conflicts: result.conflicts }, { status: result.conflicts ? 409 : 400 });
  }

  return NextResponse.json({ id: result.value.id });
}

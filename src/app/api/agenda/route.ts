import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { appointmentInputSchema } from "@/lib/agenda/schema";
import { createAppointment } from "@/lib/agenda/mutations";
import { listAppointmentsForRange } from "@/lib/agenda/queries";
import { todayRange, agendaWeekRange, parseAgendaDateTimeInput } from "@/lib/agenda/time";

// Listar por intervalo (hoje/semana, no fuso da empresa - ver time.ts). A
// pagina /agenda (incremento 5) consulta listAppointmentsForRange direto
// (Server Component, mesmo padrao do resto do app - ver vendas/page.tsx),
// entao esta rota GET existe principalmente pra refresh client-side e
// paridade com o padrao ja usado em GET /api/insights.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const view = new URL(request.url).searchParams.get("view");
  const now = new Date();
  const { start, end } = view === "week" ? agendaWeekRange(now, business.timezone) : todayRange(now, business.timezone);

  const appointments = await listAppointmentsForRange(business.id, start, end);
  return NextResponse.json({ appointments });
}

// Sobreposicao e AVISO, nao bloqueio (ver detectOverlap em calculations.ts):
// se createAppointment devolver `conflicts`, a rota responde 409 pra o
// frontend distinguir "conflito, precisa confirmar" de um erro comum (400).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = appointmentInputSchema().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const data = parsed.data;
  const result = await createAppointment(business.id, {
    clientId: data.clientId,
    startAt: parseAgendaDateTimeInput(data.startAt, business.timezone),
    services: data.services,
    notes: data.notes || null,
    allowOverlap: data.allowOverlap,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, conflicts: result.conflicts }, { status: result.conflicts ? 409 : 400 });
  }

  return NextResponse.json({ id: result.value.id }, { status: 201 });
}

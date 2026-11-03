import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { dayAppointmentInputSchema } from "@/lib/agenda/schema";
import { createDayAppointment } from "@/lib/agenda/mutations";
import { listAppointmentsForRange } from "@/lib/agenda/queries";
import { todayRange, agendaWeekRange } from "@/lib/agenda/time";

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

// Criar (Agenda A3): toda criacao nova e do fluxo por dia (DAY) - so o dia,
// com servicos, valores, categoria e pagamento ja definidos. O fluxo com
// horario (TIMED) nao cria mais; os existentes continuam editaveis em
// PATCH /api/agenda/[id].
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
  const parsed = dayAppointmentInputSchema(business.currency).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const result = await createDayAppointment(business.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ id: result.value.id }, { status: 201 });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { undoCompletionSchema } from "@/lib/agenda/schema";
import { undoAppointmentCompletion } from "@/lib/agenda/undoCompletion";

// Desfazer a conclusao de um atendimento (Agenda A4), DAY ou TIMED - estorna
// o dinheiro recebido e cancela a venda na mesma transacao (ver
// undoAppointmentCompletion). Repetir a chamada nao estorna de novo: devolve
// 400 com "Esta conclusão já foi desfeita."
export async function POST(request: Request, context: RouteContext<"/api/agenda/[id]/undo">) {
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
  const parsed = undoCompletionSchema().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const result = await undoAppointmentCompletion(business.id, id, parsed.data.to);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result.value);
}

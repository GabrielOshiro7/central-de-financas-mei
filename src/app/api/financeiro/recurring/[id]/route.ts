import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { recurringEntrySchema } from "@/lib/finance/recurring/schema";
import { updateRecurringEntry, deleteRecurringEntry } from "@/lib/finance/recurring/mutations";
import { materializeRecurringEntries } from "@/lib/finance/recurring/materialize";

export async function PATCH(request: Request, context: RouteContext<"/api/financeiro/recurring/[id]">) {
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
  const parsed = recurringEntrySchema(business.currency).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  // Editar o molde (inclusive amount) nunca altera ocorrencias ja
  // materializadas - so as futuras (ver comentario em updateRecurringEntry).
  const result = await updateRecurringEntry(business.id, id, {
    type: parsed.data.type,
    categoryId: parsed.data.categoryId,
    description: parsed.data.description,
    amount: parsed.data.amount,
    frequency: parsed.data.frequency,
    dayOfWeek: parsed.data.dayOfWeek,
    dayOfMonth: parsed.data.dayOfMonth,
    yearMonth: parsed.data.yearMonth,
    startDate: new Date(parsed.data.startDate),
    endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error.includes("não encontrada") ? 404 : 400 }
    );
  }

  await materializeRecurringEntries(business.id, user.id);

  return NextResponse.json({ id: result.value.id });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/financeiro/recurring/[id]">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const { id } = await context.params;
  // Excluir desvincula (nao apaga) os FinancialEntry ja gerados - onDelete:
  // SetNull na FK cuida disso no proprio banco (ver deleteRecurringEntry).
  const result = await deleteRecurringEntry(business.id, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ id: result.value.id });
}

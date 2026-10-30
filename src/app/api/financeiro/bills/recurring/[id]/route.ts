import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { recurringBillSchema } from "@/lib/finance/bills/schema";
import { updateRecurringBill, deleteRecurringBill } from "@/lib/finance/bills/mutations";
import { dayFromInput } from "@/lib/finance/entryDay";
import { materializeRecurringBills } from "@/lib/finance/bills/materialize";
import { clockFor } from "@/lib/time/zoned";

export async function PATCH(request: Request, context: RouteContext<"/api/financeiro/bills/recurring/[id]">) {
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
  const parsed = recurringBillSchema(business.currency).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  // Editar o molde (inclusive amount) nunca altera ocorrencias (Bill) ja
  // materializadas - so as futuras (ver updateRecurringBill).
  const result = await updateRecurringBill(business.id, id, parsed.data.direction, {
    categoryId: parsed.data.categoryId,
    description: parsed.data.description,
    amount: parsed.data.amount,
    frequency: parsed.data.frequency,
    dayOfWeek: parsed.data.dayOfWeek,
    dayOfMonth: parsed.data.dayOfMonth,
    yearMonth: parsed.data.yearMonth,
    // Dias de calendario (F6b-2): "YYYY-MM-DD" do formulario e o proprio dia.
    startOn: dayFromInput(parsed.data.startDate, business.timezone),
    endOn: parsed.data.endDate ? dayFromInput(parsed.data.endDate, business.timezone) : null,
    documentNumber: parsed.data.documentNumber,
    counterpartyName: parsed.data.counterpartyName,
    paymentMethod: parsed.data.paymentMethod,
    bankAccount: parsed.data.bankAccount,
    costCenter: parsed.data.costCenter,
    notes: parsed.data.notes,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error.includes("não encontrada") ? 404 : 400 }
    );
  }

  await materializeRecurringBills(business.id, clockFor(business));

  return NextResponse.json({ id: result.value.id });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/financeiro/bills/recurring/[id]">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const { id } = await context.params;
  // Excluir desvincula (nao apaga) as Bill ja geradas - onDelete: SetNull na
  // FK cuida disso no proprio banco (ver deleteRecurringBill).
  const result = await deleteRecurringBill(business.id, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ id: result.value.id });
}

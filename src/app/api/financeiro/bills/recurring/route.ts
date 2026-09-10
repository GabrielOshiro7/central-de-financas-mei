import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { recurringBillSchema } from "@/lib/finance/bills/schema";
import { createRecurringBill } from "@/lib/finance/bills/mutations";
import { materializeRecurringBills } from "@/lib/finance/bills/materialize";

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
  const parsed = recurringBillSchema(business.currency).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const result = await createRecurringBill(business.id, parsed.data.direction, {
    categoryId: parsed.data.categoryId,
    description: parsed.data.description,
    amount: parsed.data.amount,
    frequency: parsed.data.frequency,
    dayOfWeek: parsed.data.dayOfWeek,
    dayOfMonth: parsed.data.dayOfMonth,
    yearMonth: parsed.data.yearMonth,
    startDate: new Date(parsed.data.startDate),
    endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
    documentNumber: parsed.data.documentNumber,
    counterpartyName: parsed.data.counterpartyName,
    paymentMethod: parsed.data.paymentMethod,
    bankAccount: parsed.data.bankAccount,
    costCenter: parsed.data.costCenter,
    notes: parsed.data.notes,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Materializa imediatamente as ocorrencias ate o horizonte (secao
  // "MATERIALIZACAO" - ver bills/materialize.ts), mesmo padrao do endpoint
  // equivalente de RecurringEntry.
  await materializeRecurringBills(business.id);

  return NextResponse.json({ id: result.value.id }, { status: 201 });
}

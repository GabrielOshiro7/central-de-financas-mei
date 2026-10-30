import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { billSchema } from "@/lib/finance/bills/schema";
import { createBill } from "@/lib/finance/bills/mutations";
import { dayFromInput } from "@/lib/finance/entryDay";

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
  const parsed = billSchema(business.currency).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const result = await createBill(business.id, parsed.data.direction, {
    categoryId: parsed.data.categoryId,
    description: parsed.data.description,
    amount: parsed.data.amount,
    // Dias de calendario (F6b-2): "YYYY-MM-DD" do formulario e o proprio dia.
    issueOn: parsed.data.issueDate ? dayFromInput(parsed.data.issueDate, business.timezone) : null,
    dueOn: dayFromInput(parsed.data.dueDate, business.timezone),
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

  return NextResponse.json({ id: result.value.id }, { status: 201 });
}

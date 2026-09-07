import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { transactionSchema } from "@/lib/finance/schema";
import { updateTransaction, deleteTransaction } from "@/lib/finance/mutations";

export async function PATCH(request: Request, context: RouteContext<"/api/financeiro/transactions/[id]">) {
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
  const parsed = transactionSchema(business.currency).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const result = await updateTransaction(business.id, id, {
    type: parsed.data.type,
    occurredAt: new Date(parsed.data.occurredAt),
    description: parsed.data.description,
    categoryId: parsed.data.categoryId,
    amount: parsed.data.amount,
    notes: parsed.data.notes,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error.includes("não encontrado") ? 404 : 400 });
  }

  return NextResponse.json({ id: result.value.id });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/financeiro/transactions/[id]">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const { id } = await context.params;
  const result = await deleteTransaction(business.id, id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ id: result.value.id });
}

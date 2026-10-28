import { NextResponse } from "next/server";
import { isDateKey } from "@/lib/time/zoned";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { transactionSchema } from "@/lib/finance/schema";
import { createTransaction } from "@/lib/finance/mutations";

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
  const parsed = transactionSchema(business.currency).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const result = await createTransaction(business.id, user.id, {
    type: parsed.data.type,
    // O dia digitado (YYYY-MM-DD) e a fonte do dia (Etapa F6a-2); um valor
    // com hora, se algum cliente mandar, continua tratado como instante.
    ...(isDateKey(parsed.data.occurredAt)
      ? { occurredOn: parsed.data.occurredAt }
      : { occurredAt: new Date(parsed.data.occurredAt) }),
    description: parsed.data.description,
    categoryId: parsed.data.categoryId,
    amount: parsed.data.amount,
    notes: parsed.data.notes,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ id: result.value.id }, { status: 201 });
}

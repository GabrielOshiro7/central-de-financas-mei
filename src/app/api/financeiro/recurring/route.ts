import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { recurringEntrySchema } from "@/lib/finance/recurring/schema";
import { createRecurringEntry } from "@/lib/finance/recurring/mutations";
import { materializeRecurringEntries } from "@/lib/finance/recurring/materialize";

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
  const parsed = recurringEntrySchema(business.currency).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const result = await createRecurringEntry(business.id, {
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
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Materializa imediatamente as ocorrencias entre a primeira valida e agora
  // (secao "INTERFACE" da Etapa 4.1) - idempotente mesmo se a leitura
  // seguinte de uma pagina financeira materializar de novo.
  await materializeRecurringEntries(business.id, user.id);

  return NextResponse.json({ id: result.value.id }, { status: 201 });
}

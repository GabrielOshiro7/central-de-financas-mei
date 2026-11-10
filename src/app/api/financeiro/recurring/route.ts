import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { recurringEntrySchema } from "@/lib/finance/recurring/schema";
import { createRecurringEntry } from "@/lib/finance/recurring/mutations";
import { materializeRecurringEntries } from "@/lib/finance/recurring/materialize";
import { firstOccurrence, toRecurrenceRule } from "@/lib/finance/recurring/occurrences";
import { dbDateToKey } from "@/lib/time/zoned";
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
    // Dias de calendario (F6c): "YYYY-MM-DD" do formulario e o proprio dia.
    startOn: dayFromInput(parsed.data.startDate, business.timezone),
    endOn: parsed.data.endDate ? dayFromInput(parsed.data.endDate, business.timezone) : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Materializa imediatamente as ocorrencias entre a primeira valida e agora
  // (secao "INTERFACE" da Etapa 4.1) - idempotente mesmo se a leitura
  // seguinte de uma pagina financeira materializar de novo.
  await materializeRecurringEntries(business.id, user.id);

  // Primeira ocorrencia do molde (regra de F5, so leitura) e o que ja foi
  // materializado DESTE molde (quantidade, primeira e ultima data): a tela usa
  // para avisar "a primeira entra em DD/MM/AAAA" quando ainda e futura, ou
  // "N lancamentos criados, de ... a ..." quando comecam antes do mes corrente.
  // firstOn null: o fim do molde vem antes da primeira ocorrencia (nunca gera nada).
  const stored = await prisma.recurringEntry.findUniqueOrThrow({ where: { id: result.value.id } });
  const first = firstOccurrence(toRecurrenceRule(stored), dbDateToKey(stored.startOn));
  const firstOn = stored.endOn && first > dbDateToKey(stored.endOn) ? null : first;

  const materialized = await prisma.financialEntry.aggregate({
    where: { businessId: business.id, recurringEntryId: result.value.id },
    _count: { _all: true },
    _min: { occurredOn: true },
    _max: { occurredOn: true },
  });

  return NextResponse.json(
    {
      id: result.value.id,
      firstOn,
      created: materialized._count._all,
      createdFirstOn: materialized._min.occurredOn ? dbDateToKey(materialized._min.occurredOn) : null,
      createdLastOn: materialized._max.occurredOn ? dbDateToKey(materialized._max.occurredOn) : null,
    },
    { status: 201 }
  );
}

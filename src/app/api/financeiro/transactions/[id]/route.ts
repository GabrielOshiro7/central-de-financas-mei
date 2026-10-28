import { NextResponse } from "next/server";
import { isDateKey } from "@/lib/time/zoned";
import { prisma } from "@/lib/db";
import { getCurrentUser, getCurrentUserWithSession } from "@/lib/auth/cookies";
import { requireElevatedSession } from "@/lib/auth/guards";
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
    return NextResponse.json({ error: result.error }, { status: result.error.includes("não encontrado") ? 404 : 400 });
  }

  return NextResponse.json({ id: result.value.id });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/financeiro/transactions/[id]">) {
  const current = await getCurrentUserWithSession();
  if (!current) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  // Excluir um lancamento financeiro e irreversivel e apaga historico ja
  // refletido nos calculos do sistema - exige reautenticacao recente
  // (step-up), verificada aqui no servidor e nao so no frontend (Etapa
  // sessao-expiracao-reauth, secao 2.4).
  const reauthError = requireElevatedSession(current);
  if (reauthError) {
    return NextResponse.json({ error: reauthError }, { status: 403 });
  }

  const business = await prisma.business.findUnique({ where: { userId: current.user.id } });
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

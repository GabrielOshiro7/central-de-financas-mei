import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { billSchema } from "@/lib/finance/bills/schema";
import { updateBill } from "@/lib/finance/bills/mutations";

// Nao ha DELETE aqui de proposito (secao "EXCLUSAO" da Etapa 5: preservar
// rastreabilidade financeira) - so PATCH (enquanto PENDING) e os endpoints
// dedicados settle/revert/cancel em cancel/route.ts, revert/route.ts e
// settle/route.ts.
export async function PATCH(request: Request, context: RouteContext<"/api/financeiro/bills/[id]">) {
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
  const parsed = billSchema(business.currency).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const result = await updateBill(business.id, id, parsed.data.direction, {
    categoryId: parsed.data.categoryId,
    description: parsed.data.description,
    amount: parsed.data.amount,
    issueDate: parsed.data.issueDate ? new Date(parsed.data.issueDate) : null,
    dueDate: new Date(parsed.data.dueDate),
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

  return NextResponse.json({ id: result.value.id });
}

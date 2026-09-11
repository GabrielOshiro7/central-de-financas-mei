import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { confirmSaleSchema } from "@/lib/sales/schema";
import { confirmSale } from "@/lib/sales/mutations";

// DRAFT -> CONFIRMED: so aqui (ou em POST /api/vendas ja confirmando direto)
// as Bills sao materializadas.
export async function POST(request: Request, context: RouteContext<"/api/vendas/[id]/confirm">) {
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
  const parsed = confirmSaleSchema(business.currency).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const result = await confirmSale(business.id, id, {
    installments: parsed.data.installments.map((installment) => ({
      dueDate: new Date(installment.dueDate),
      amount: installment.amount,
      paidNow: installment.paidNow,
    })),
    paymentMethod: parsed.data.paymentMethod || null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error.includes("não encontrada") ? 404 : 400 });
  }

  return NextResponse.json({ id: result.value.id });
}

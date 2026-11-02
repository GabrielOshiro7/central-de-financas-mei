import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { saleSchema } from "@/lib/sales/schema";
import { createSale } from "@/lib/sales/mutations";
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
  const parsed = saleSchema(business.currency).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const data = parsed.data;
  const result = await createSale(business.id, user.id, {
    clientRequestId: data.clientRequestId,
    status: data.status,
    clientId: data.clientId,
    categoryId: data.categoryId,
    // Dias de calendario (F6c): "YYYY-MM-DD" do formulario e o proprio dia.
    saleOn: dayFromInput(data.saleDate, business.timezone),
    items: data.items.map((item) => ({
      productId: item.productId || null,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    discount: data.discountType ? { type: data.discountType, value: data.discountValue ?? 0 } : null,
    paymentMethod: data.paymentMethod || null,
    installments: data.installments?.map((installment) => ({
      dueOn: dayFromInput(installment.dueDate, business.timezone),
      amount: installment.amount,
      paidNow: installment.paidNow,
    })),
    notes: data.notes || null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ id: result.value.id, saleNumber: result.value.saleNumber }, { status: 201 });
}

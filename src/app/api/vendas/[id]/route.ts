import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { saleUpdateSchema, saleNotesUpdateSchema } from "@/lib/sales/schema";
import { updateSale, updateSaleNotes } from "@/lib/sales/mutations";

// Nao ha DELETE aqui de proposito (preservar rastreabilidade - ver
// cancel/route.ts). A rota decide entre edicao completa e "so notas"
// consultando o estado real da venda (existe Bill PAID?) ANTES de validar o
// corpo - nunca confia numa flag enviada pelo cliente pra escolher o schema
// (ADENDO item 2: bloquear edicao de valor/itens de uma venda com pagamento
// ja registrado).
export async function PATCH(request: Request, context: RouteContext<"/api/vendas/[id]">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const { id } = await context.params;
  const sale = await prisma.sale.findFirst({ where: { id, businessId: business.id }, include: { bills: true } });
  if (!sale) {
    return NextResponse.json({ error: "Venda não encontrada." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const locked = sale.bills.some((b) => b.status === "PAID");

  if (locked) {
    const parsed = saleNotesUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
    }
    const result = await updateSaleNotes(business.id, id, parsed.data.notes || null);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json({ id: result.value.id });
  }

  const parsed = saleUpdateSchema(business.currency).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const data = parsed.data;
  const result = await updateSale(business.id, id, {
    clientId: data.clientId,
    categoryId: data.categoryId,
    saleDate: new Date(data.saleDate),
    items: data.items.map((item) => ({
      productId: item.productId || null,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    discount: data.discountType ? { type: data.discountType, value: data.discountValue ?? 0 } : null,
    paymentMethod: data.paymentMethod || null,
    installments: data.installments?.map((installment) => ({
      dueDate: new Date(installment.dueDate),
      amount: installment.amount,
    })),
    notes: data.notes || null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error.includes("não encontrada") ? 404 : 400 });
  }

  return NextResponse.json({ id: result.value.id });
}

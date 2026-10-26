import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { appointmentCompleteSchema } from "@/lib/agenda/schema";
import { completeAppointment } from "@/lib/agenda/mutations";

// O ponto mais critico da Agenda (ver comentario completo em
// completeAppointment, src/lib/agenda/mutations.ts): cria Sale+itens+Bill(s)
// reaproveitando createSale da Etapa 6 dentro de UMA transacao com a
// mudanca de status. Idempotente - concluir 2x (sequencial ou concorrente)
// devolve o mesmo saleId sem criar uma segunda venda.
export async function POST(request: Request, context: RouteContext<"/api/agenda/[id]/complete">) {
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
  const parsed = appointmentCompleteSchema(business.currency).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const data = parsed.data;
  const result = await completeAppointment(
    business.id,
    user.id,
    id,
    {
      categoryId: data.categoryId,
      items: data.items.map((item) => ({
        productId: item.productId || null,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      paymentMethod: data.paymentMethod || null,
      installments: data.installments,
    },
    business.timezone
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    id: result.value.id,
    saleId: result.value.saleId,
    saleNumber: result.value.saleNumber,
    alreadyCompleted: result.value.alreadyCompleted,
  });
}

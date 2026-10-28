import { NextResponse } from "next/server";
import { isDateKey } from "@/lib/time/zoned";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { settleBill } from "@/lib/finance/bills/mutations";

const bodySchema = z.object({
  paidAt: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "Data de pagamento/recebimento inválida.")
    .optional(),
});

// "Marcar como pago/recebido" (secao "PAGAMENTO / RECEBIMENTO" da Etapa 5).
// Endpoint dedicado (nao reaproveita o PATCH de edicao) porque a semantica e
// diferente: aqui a data enviada e SEMPRE a data real do pagamento
// (occurredAt do FinancialEntry gerado), nunca um campo editavel de uma
// conta ja finalizada.
export async function POST(request: Request, context: RouteContext<"/api/financeiro/bills/[id]/settle">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date();
  // Data informada (YYYY-MM-DD) = o dia do lancamento (Etapa F6a-2); sem
  // data, o dia sai do instante do clique.
  const paidOn = parsed.data.paidAt && isDateKey(parsed.data.paidAt) ? parsed.data.paidAt : undefined;
  const result = await settleBill(business.id, user.id, id, paidAt, paidOn);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error.includes("não encontrada") ? 404 : 400 }
    );
  }

  return NextResponse.json({ id: result.value.id, financialEntryId: result.value.financialEntryId });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { dayFromInput } from "@/lib/finance/entryDay";
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
// diferente: aqui a data enviada e SEMPRE o dia real do pagamento (dia do
// FinancialEntry gerado), nunca um campo editavel de uma conta ja finalizada.
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

  // O campo do corpo continua se chamando "paidAt", mas e o DIA do pagamento
  // (Etapa F6b-2): vira Bill.paidOn e o dia do lancamento. Sem data, o dia e
  // "hoje" no fuso da empresa. Bill.paidAt e sempre o instante real do
  // registro (agora), gravado por settleBill.
  const paidOn = parsed.data.paidAt ? dayFromInput(parsed.data.paidAt, business.timezone) : undefined;
  const result = await settleBill(business.id, user.id, id, paidOn);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error.includes("não encontrada") ? 404 : 400 }
    );
  }

  return NextResponse.json({ id: result.value.id, financialEntryId: result.value.financialEntryId });
}

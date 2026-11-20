import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { revertBillSettlement } from "@/lib/finance/bills/mutations";
import { legalReacceptBlock } from "@/lib/legal/apiGate";

export async function POST(_request: Request, context: RouteContext<"/api/financeiro/bills/[id]/revert">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const legalBlock = legalReacceptBlock(user);
  if (legalBlock) return legalBlock;

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const { id } = await context.params;
  const result = await revertBillSettlement(business.id, id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error.includes("não encontrada") ? 404 : 400 }
    );
  }

  return NextResponse.json({ id: result.value.id });
}

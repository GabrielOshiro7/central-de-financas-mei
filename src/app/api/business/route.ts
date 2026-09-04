import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

const { Decimal } = Prisma;
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { businessEditSchema } from "@/lib/onboarding/schema";

// Atualiza a empresa do usuario autenticado. O id da empresa nunca vem do
// cliente - e sempre resolvido via where: { userId: user.id }, entao nao ha
// como um usuario alterar os dados de outro mesmo manipulando o body/URL.
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = businessEditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const existing = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!existing) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const business = await prisma.business.update({
    where: { userId: user.id },
    data: {
      name: parsed.data.name,
      yearsInBusiness: parsed.data.yearsInBusiness,
      employeeCount: parsed.data.employeeCount,
      currency: parsed.data.currency,
      averageMonthlyRevenue: new Decimal(parsed.data.averageMonthlyRevenue),
    },
  });

  return NextResponse.json({ business: { id: business.id, name: business.name } });
}

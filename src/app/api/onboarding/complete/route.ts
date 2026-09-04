import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });

  const hasRevenueAnswer =
    business?.businessType === "OUTRO"
      ? Boolean(business.revenueModelOther)
      : Boolean(business?.revenueModel && business.revenueModel.length > 0);

  const isComplete =
    Boolean(business?.businessType) &&
    hasRevenueAnswer &&
    Boolean(business?.name) &&
    Boolean(business?.yearsInBusiness) &&
    Boolean(business?.employeeCount) &&
    Boolean(business?.currency) &&
    business?.averageMonthlyRevenue != null;

  if (!business || !isComplete) {
    return NextResponse.json(
      { error: "Complete todas as perguntas antes de continuar." },
      { status: 400 }
    );
  }

  await prisma.business.update({
    where: { userId: user.id },
    data: { onboardingCompleted: true },
  });

  return NextResponse.json({ ok: true });
}

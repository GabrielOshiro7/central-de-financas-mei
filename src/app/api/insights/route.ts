import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { getInsightsForBusiness } from "@/lib/insights/queries";
import { clockFor } from "@/lib/time/zoned";

// Unico caminho de leitura (secao "Decisoes" da Etapa 7): getInsightsForBusiness
// nunca chama IA, mesmo quando precisa regenerar por dado desatualizado -
// esta rota e sempre rapida e nunca toca rede externa.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const insights = await getInsightsForBusiness(business.id, clockFor(business));
  return NextResponse.json({ insights });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { generateInsightsForBusiness } from "@/lib/insights/mutations";
import { getInsightsForBusiness } from "@/lib/insights/queries";
import { clockFor } from "@/lib/time/zoned";

// Botao manual de "atualizar" (secao 27 do prompt da Etapa 7) - o UNICO
// caminho que chama IA (withAI: true), incondicionalmente, ignorando o
// fingerprint de cache. Nunca acionado automaticamente pelo GET.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const clock = clockFor(business);
  await generateInsightsForBusiness(business.id, clock, { withAI: true });
  const insights = await getInsightsForBusiness(business.id, clock);
  return NextResponse.json({ insights });
}

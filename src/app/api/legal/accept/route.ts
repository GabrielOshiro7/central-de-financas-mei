import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { legalAcceptSchema } from "@/lib/validation/auth";
import { currentAcceptanceData } from "@/lib/legal/acceptance";

// Aceite (ou reaceite) dos Termos de Servico e da Politica de Privacidade. Grava data/hora de agora
// e as VERSOES VIGENTES (do codigo - nunca versoes enviadas pelo cliente). Fica de fora do bloqueio
// de reaceite: e justamente a rota que o libera. Exige so login.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = legalAcceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const data = currentAcceptanceData();
  await prisma.user.update({ where: { id: user.id }, data });
  return NextResponse.json({ ok: true, termsVersion: data.termsVersion, privacyVersion: data.privacyVersion });
}

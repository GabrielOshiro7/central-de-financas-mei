import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { legalReacceptBlock } from "@/lib/legal/apiGate";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const legalBlock = legalReacceptBlock(user);
  if (legalBlock) return legalBlock;

  const business = await prisma.business.findUnique({ where: { userId: user.id } });

  // So o nome e a moeda sao necessarios. Tipo de negocio, modelo de receita, tempo de existencia,
  // numero de pessoas e faturamento medio sao opcionais (so informacao de perfil, nenhuma funcao do
  // sistema os usa).
  const isComplete = Boolean(business?.name) && Boolean(business?.currency);

  if (!business || !isComplete) {
    return NextResponse.json(
      { error: "Informe o nome da empresa e a moeda antes de continuar." },
      { status: 400 }
    );
  }

  await prisma.business.update({
    where: { userId: user.id },
    data: { onboardingCompleted: true },
  });

  return NextResponse.json({ ok: true });
}

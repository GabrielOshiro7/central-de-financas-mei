import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { INSIGHT_KEY_REGEX, setInsightRead } from "@/lib/insights/reads";

const bodySchema = z.object({ insightKey: z.string().regex(INSIGHT_KEY_REGEX, "Insight inválido."), read: z.boolean() }).strict();

// Marca/desmarca um insight como lido PELO USUARIO DA SESSAO, na empresa dele (nunca
// um id de usuario/empresa vindo da requisicao).
export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const result = await setInsightRead(user.id, business.id, parsed.data.insightKey, parsed.data.read);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error === "Insight não encontrado." ? 404 : 400 });
  }
  return NextResponse.json({ insightKey: parsed.data.insightKey, read: parsed.data.read });
}

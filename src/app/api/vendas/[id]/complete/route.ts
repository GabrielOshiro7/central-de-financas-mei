import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { setSaleCompleted } from "@/lib/sales/mutations";

// "Concluída" e so um marcador comercial manual (ex.: entrega concluida) -
// nao tem nenhum efeito financeiro/sobre os Bills relacionados.
export async function POST(_request: Request, context: RouteContext<"/api/vendas/[id]/complete">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const { id } = await context.params;
  const result = await setSaleCompleted(business.id, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error.includes("não encontrada") ? 404 : 400 });
  }

  return NextResponse.json({ id: result.value.id });
}

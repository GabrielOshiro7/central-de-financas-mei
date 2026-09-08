import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { setRecurringEntryActive } from "@/lib/finance/recurring/mutations";

const bodySchema = z.object({ isActive: z.boolean() });

// Endpoint dedicado pra pausar/retomar (isActive) - payload deliberadamente
// separado do PATCH de edicao completa em [id]/route.ts, pra nao misturar
// "editar os dados do molde" com "ligar/desligar a geracao de novas
// ocorrencias" no mesmo contrato.
export async function PATCH(request: Request, context: RouteContext<"/api/financeiro/recurring/[id]/active">) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const result = await setRecurringEntryActive(business.id, id, parsed.data.isActive);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ id: result.value.id });
}

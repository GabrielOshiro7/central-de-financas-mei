import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { clientSchema } from "@/lib/clients/schema";
import { updateClient } from "@/lib/clients/mutations";

// Nao ha DELETE aqui de proposito - clientes nunca sao excluidos (preservar
// historico de vendas), so inativados via [id]/active/route.ts.
export async function PATCH(request: Request, context: RouteContext<"/api/clientes/[id]">) {
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
  const parsed = clientSchema().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const result = await updateClient(business.id, id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error.includes("não encontrado") ? 404 : 400 });
  }

  return NextResponse.json({ id: result.value.id });
}

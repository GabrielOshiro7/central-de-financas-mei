import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { openingBalanceSchema } from "@/lib/finance/cash/schema";
import { updateOpeningBalance } from "@/lib/finance/cash/mutations";

// Endpoint dedicado (Etapa 5.1), separado de PATCH /api/business - saldo
// inicial e um conceito proprio (posicao de caixa), nao um campo de perfil
// da empresa, mesmo vivendo na mesma tabela/formulario visual.
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = openingBalanceSchema(business.currency).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const result = await updateOpeningBalance(user.id, {
    openingBalance: parsed.data.openingBalance,
    openingBalanceDate: new Date(parsed.data.openingBalanceDate),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ id: result.business.id });
}

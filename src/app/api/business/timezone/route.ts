import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/cookies";
import { businessTimeZoneSchema } from "@/lib/time/schema";
import { updateBusinessTimeZone } from "@/lib/onboarding/businessMutations";

// Pais + fuso da empresa (Etapa F7). Endpoint dedicado, como o de saldo
// inicial (opening-balance), com a MESMA autorizacao de PATCH /api/business:
// sessao valida e empresa resolvida por userId - o id da empresa nunca vem do
// cliente (businessTimeZoneSchema e strict: um "businessId" no corpo e 400).
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = businessTimeZoneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const result = await updateBusinessTimeZone(user.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json(result.business);
}

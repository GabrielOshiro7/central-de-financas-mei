import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/cookies";
import { businessEditSchema } from "@/lib/onboarding/schema";
import { updateBusinessProfile } from "@/lib/onboarding/businessMutations";

// Atualiza a empresa do usuario autenticado. O id da empresa nunca vem do
// cliente - e sempre resolvido via where: { userId: user.id }, entao nao ha
// como um usuario alterar os dados de outro mesmo manipulando o body/URL.
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = businessEditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const result = await updateBusinessProfile(user.id, parsed.data);
  if (!result.ok) {
    const status = result.error === "Empresa não encontrada." ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ business: result.business });
}

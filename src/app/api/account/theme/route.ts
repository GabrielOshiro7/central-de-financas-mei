import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { THEME_COOKIE, themeCookieOptions, themeFromPreference, themePreferenceSchema } from "@/lib/theme";

// Preferencia de tema do usuario LOGADO (claro/escuro). Sempre do usuario da
// sessao - nunca um id vindo da requisicao. Visitante nao chama esta rota (so cookie).
export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = themePreferenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { themePreference: parsed.data.theme },
    select: { themePreference: true },
  });

  const theme = themeFromPreference(updated.themePreference) ?? "light";
  const response = NextResponse.json({ theme: updated.themePreference });
  response.cookies.set(THEME_COOKIE, theme, themeCookieOptions);
  return response;
}

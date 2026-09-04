import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserWithSession } from "@/lib/auth/cookies";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { invalidateOtherSessions } from "@/lib/auth/session";
import { changePasswordSchema } from "@/lib/validation/auth";

export async function POST(request: Request) {
  const current = await getCurrentUserWithSession();
  if (!current) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: current.user.id } });
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const validCurrentPassword = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!validCurrentPassword) {
    return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  await invalidateOtherSessions(user.id, current.sessionId);

  return NextResponse.json({ message: "Senha alterada com sucesso." });
}

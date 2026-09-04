import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { invalidateAllUserSessions } from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/rateLimit";
import { getClientIp } from "@/lib/http";
import { hashResetToken } from "@/lib/auth/resetToken";
import { resetPasswordSchema } from "@/lib/validation/auth";

const RATE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 }; // 10 tentativas / 15 min por IP

const GENERIC_ERROR = "Link inválido ou expirado.";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = rateLimit(`reset-password:${ip}`, RATE_LIMIT.max, RATE_LIMIT.windowMs);

  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em alguns minutos." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const { token, password } = parsed.data;
  const tokenHash = hashResetToken(token);

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (
    !resetToken ||
    resetToken.usedAt !== null ||
    resetToken.expiresAt.getTime() < Date.now()
  ) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { userId: resetToken.userId, id: { not: resetToken.id } },
    }),
  ]);

  await invalidateAllUserSessions(resetToken.userId);

  return NextResponse.json({
    message: "Senha redefinida com sucesso. Faça login com a nova senha.",
  });
}

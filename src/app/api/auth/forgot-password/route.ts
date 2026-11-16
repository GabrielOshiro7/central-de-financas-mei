import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/auth/rateLimit";
import { cleanupExpiredAuthDataSafely } from "@/lib/auth/cleanup";
import { getClientIp } from "@/lib/http";
import {
  RESET_TOKEN_DURATION_MS,
  generateResetToken,
  hashResetToken,
} from "@/lib/auth/resetToken";
import { emailService } from "@/lib/email";
import { forgotPasswordSchema, normalizeEmail } from "@/lib/validation/auth";

const RATE_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 }; // 5 tentativas / 15 min por IP+e-mail

const GENERIC_MESSAGE = "Se este e-mail existir, você receberá um link.";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const email = normalizeEmail(parsed.data.email);
  const ip = getClientIp(request);
  const { allowed } = rateLimit(
    `forgot-password:${ip}:${email}`,
    RATE_LIMIT.max,
    RATE_LIMIT.windowMs
  );

  if (!allowed) {
    // Mesmo limitado, respondemos a mensagem generica para nao vazar
    // diferenca de comportamento a quem esta tentando enumerar contas.
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    const rawToken = generateResetToken();
    const tokenHash = hashResetToken(rawToken);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_DURATION_MS),
      },
    });

    // Limpeza oportunista de sessoes/links vencidos de todos os usuarios. after(): roda DEPOIS de
    // a resposta ser enviada (nao atrasa a resposta) e o Next.js garante que termine, inclusive
    // em plataformas serverless. Nunca lanca (falha so gera log). Ver src/lib/auth/cleanup.ts.
    after(() => cleanupExpiredAuthDataSafely());

    const resetUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password/${rawToken}`;
    await emailService.sendPasswordResetEmail(user.email, resetUrl);
  }

  return NextResponse.json({ message: GENERIC_MESSAGE });
}

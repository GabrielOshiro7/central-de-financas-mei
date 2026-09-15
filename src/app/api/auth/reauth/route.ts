import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserWithSession } from "@/lib/auth/cookies";
import { verifyPassword } from "@/lib/auth/password";
import { elevateSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/rateLimit";
import { getClientIp } from "@/lib/http";
import { reauthSchema } from "@/lib/validation/auth";

// Reautenticacao para acoes sensiveis (step-up/"sudo mode", secao 2.4 da
// Etapa sessao-expiracao-reauth) - confirma a senha atual e eleva SO a
// sessao corrente por STEP_UP_GRACE_MINUTES (ver elevateSession). A senha
// nunca e logada nem persistida em lugar nenhum alem desta checagem
// imediata contra o hash ja armazenado.
const RATE_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 };

export async function POST(request: Request) {
  const current = await getCurrentUserWithSession();
  if (!current) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const ip = getClientIp(request);
  const { allowed } = rateLimit(`reauth:${ip}:${current.user.id}`, RATE_LIMIT.max, RATE_LIMIT.windowMs);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em alguns minutos." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = reauthSchema.safeParse(body);
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

  const validPassword = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!validPassword) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 400 });
  }

  const elevatedUntil = await elevateSession(current.sessionId);
  return NextResponse.json({ elevatedUntil });
}

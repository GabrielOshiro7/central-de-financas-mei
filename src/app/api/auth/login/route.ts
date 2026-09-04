import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createUserSession } from "@/lib/auth/cookies";
import { rateLimit } from "@/lib/auth/rateLimit";
import { getClientIp } from "@/lib/http";
import { loginSchema, normalizeEmail } from "@/lib/validation/auth";

const RATE_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 }; // 5 tentativas / 15 min por IP+e-mail

const GENERIC_ERROR = "E-mail ou senha incorretos.";

// Hash "dummy" pre-computado usado quando o usuario nao existe, para que o
// tempo de resposta seja parecido com o de uma senha incorreta de verdade
// (evita vazar via timing se um e-mail esta cadastrado ou nao).
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword(crypto.randomUUID());
  }
  return dummyHashPromise;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const email = normalizeEmail(parsed.data.email);
  const { password } = parsed.data;

  const ip = getClientIp(request);
  const { allowed } = rateLimit(`login:${ip}:${email}`, RATE_LIMIT.max, RATE_LIMIT.windowMs);

  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em alguns minutos." },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await verifyPassword(password, await getDummyHash());
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  await createUserSession(user.id);

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
  });
}

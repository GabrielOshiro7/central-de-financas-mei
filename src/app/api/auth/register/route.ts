import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createUserSession } from "@/lib/auth/cookies";
import { rateLimit } from "@/lib/auth/rateLimit";
import { getClientIp } from "@/lib/http";
import { registerSchema, normalizeEmail } from "@/lib/validation/auth";

const RATE_LIMIT = { max: 10, windowMs: 10 * 60 * 1000 }; // 10 tentativas / 10 min por IP

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed } = rateLimit(`register:${ip}`, RATE_LIMIT.max, RATE_LIMIT.windowMs);

  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em alguns minutos." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const email = normalizeEmail(parsed.data.email);
  const { name, password } = parsed.data;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json(
      { error: "Este e-mail já está cadastrado." },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: { name, email, passwordHash },
    select: { id: true, name: true, email: true },
  });

  await createUserSession(user.id);

  return NextResponse.json({ user }, { status: 201 });
}

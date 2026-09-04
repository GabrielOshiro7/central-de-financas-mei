import crypto from "crypto";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE_NAME = "session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const RENEWAL_THRESHOLD_MS = SESSION_DURATION_MS / 2;

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export type SessionValidationResult =
  | { session: { id: string; expiresAt: Date }; user: { id: string; name: string; email: string } }
  | { session: null; user: null };

export async function validateSessionToken(
  token: string
): Promise<SessionValidationResult> {
  const sessionId = hashToken(token);

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (!session) {
    return { session: null, user: null };
  }

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    return { session: null, user: null };
  }

  // Renovacao deslizante: se menos da metade da validade restar, estende a sessao.
  if (session.expiresAt.getTime() - Date.now() < RENEWAL_THRESHOLD_MS) {
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await prisma.session.update({
      where: { id: sessionId },
      data: { expiresAt },
    });
    session.expiresAt = expiresAt;
  }

  return {
    session: { id: session.id, expiresAt: session.expiresAt },
    user: session.user,
  };
}

export async function invalidateSession(token: string): Promise<void> {
  const sessionId = hashToken(token);
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
}

// Usado apos redefinicao de senha: derruba todas as sessoes ativas do
// usuario, ja que a senha antiga pode ter sido comprometida.
export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

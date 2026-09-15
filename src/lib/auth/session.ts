import crypto from "crypto";
import { prisma } from "@/lib/db";
import {
  ABSOLUTE_SESSION_DAYS_DEFAULT,
  ABSOLUTE_SESSION_DAYS_REMEMBERED,
  ACTIVITY_UPDATE_THROTTLE_MINUTES,
  INACTIVITY_TIMEOUT_MINUTES,
  STEP_UP_GRACE_MINUTES,
} from "@/lib/auth/sessionPolicy";

export const SESSION_COOKIE_NAME = "session";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, rememberMe: boolean) {
  const token = generateSessionToken();
  const now = new Date();
  const absoluteDays = rememberMe ? ABSOLUTE_SESSION_DAYS_REMEMBERED : ABSOLUTE_SESSION_DAYS_DEFAULT;
  const expiresAt = new Date(now.getTime() + absoluteDays * DAY_MS);

  await prisma.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt,
      lastActivityAt: now,
    },
  });

  return { token, expiresAt, rememberMe };
}

export type SessionExpiryReason = "inactivity" | "absolute";

export type SessionValidationResult =
  | {
      session: { id: string; expiresAt: Date; elevatedUntil: Date | null };
      user: { id: string; name: string; email: string };
      reason?: undefined;
    }
  | { session: null; user: null; reason?: SessionExpiryReason };

export async function validateSessionToken(token: string): Promise<SessionValidationResult> {
  const sessionId = hashToken(token);

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (!session) {
    return { session: null, user: null };
  }

  const now = Date.now();

  // Teto absoluto: nunca estendido, independente de uso continuo (ver
  // comentario em prisma/schema.prisma sobre a renovacao deslizante
  // removida nesta etapa).
  if (session.expiresAt.getTime() < now) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    return { session: null, user: null, reason: "absolute" };
  }

  // Expiracao por inatividade: comparacao no servidor a cada requisicao
  // autenticada - um timer so no navegador seria trivialmente contornavel
  // (ver ADENDO da etapa sessao-expiracao-reauth).
  const inactiveMs = now - session.lastActivityAt.getTime();
  if (inactiveMs > INACTIVITY_TIMEOUT_MINUTES * MINUTE_MS) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    return { session: null, user: null, reason: "inactivity" };
  }

  // Throttle: so regrava lastActivityAt se a marca atual ja tiver mais que
  // ACTIVITY_UPDATE_THROTTLE_MINUTES - evita um UPDATE por requisicao.
  let lastActivityAt = session.lastActivityAt;
  if (inactiveMs > ACTIVITY_UPDATE_THROTTLE_MINUTES * MINUTE_MS) {
    lastActivityAt = new Date(now);
    await prisma.session.update({
      where: { id: sessionId },
      data: { lastActivityAt },
    });
  }

  return {
    session: { id: session.id, expiresAt: session.expiresAt, elevatedUntil: session.elevatedUntil },
    user: session.user,
  };
}

export async function invalidateSession(token: string): Promise<void> {
  const sessionId = hashToken(token);
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
}

// Usado apos redefinicao de senha (fluxo "esqueci minha senha"): derruba
// todas as sessoes ativas do usuario, ja que a senha antiga pode ter sido
// comprometida.
export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

// Usado apos troca de senha estando logado: mantem a sessao atual (quem
// trocou a senha nao precisa ser deslogado) e derruba as demais.
export async function invalidateOtherSessions(
  userId: string,
  currentSessionId: string
): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId, id: { not: currentSessionId } },
  });
}

// Reautenticacao para acoes sensiveis (step-up/"sudo mode") - chamado por
// POST /api/auth/reauth depois de confirmar a senha atual. Eleva SO a
// sessao corrente; outras sessoes do mesmo usuario (outro navegador,
// celular) continuam nao-elevadas ate confirmarem a senha na propria
// sessao delas.
export async function elevateSession(sessionId: string): Promise<Date> {
  const elevatedUntil = new Date(Date.now() + STEP_UP_GRACE_MINUTES * MINUTE_MS);
  await prisma.session.update({
    where: { id: sessionId },
    data: { elevatedUntil },
  });
  return elevatedUntil;
}

export function isSessionElevated(session: { elevatedUntil: Date | null }): boolean {
  return session.elevatedUntil !== null && session.elevatedUntil.getTime() > Date.now();
}

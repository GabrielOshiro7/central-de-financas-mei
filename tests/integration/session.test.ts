import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import {
  createSession,
  validateSessionToken,
  elevateSession,
  isSessionElevated,
} from "@/lib/auth/session";
import {
  INACTIVITY_TIMEOUT_MINUTES,
  ACTIVITY_UPDATE_THROTTLE_MINUTES,
  ABSOLUTE_SESSION_DAYS_DEFAULT,
  ABSOLUTE_SESSION_DAYS_REMEMBERED,
  STEP_UP_GRACE_MINUTES,
} from "@/lib/auth/sessionPolicy";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword("senhaValida123");
  return prisma.user.create({
    data: { name: "Teste Sessao", email: `sessao-test-${suffix}-${Date.now()}@example.com`, passwordHash },
  });
}

describe("expiracao por inatividade e teto absoluto", () => {
  const userIds: string[] = [];
  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("sessao com atividade recente continua valida", async () => {
    const user = await makeUser("ativa");
    userIds.push(user.id);
    const { token } = await createSession(user.id, false);

    const result = await validateSessionToken(token);
    expect(result.user?.id).toBe(user.id);
  });

  it("sessao sem atividade ha mais que INACTIVITY_TIMEOUT_MINUTES e rejeitada e apagada", async () => {
    const user = await makeUser("inativa");
    userIds.push(user.id);
    const { token } = await createSession(user.id, false);

    // simula inatividade: empurra lastActivityAt pra alem do limite
    const sessionId = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    await prisma.session.update({
      where: { id: sessionId.id },
      data: { lastActivityAt: new Date(Date.now() - (INACTIVITY_TIMEOUT_MINUTES + 1) * MINUTE_MS) },
    });

    const result = await validateSessionToken(token);
    expect(result.user).toBeNull();
    expect(result.reason).toBe("inactivity");

    const stillExists = await prisma.session.findUnique({ where: { id: sessionId.id } });
    expect(stillExists).toBeNull();
  });

  it("sessao apos o teto absoluto e rejeitada mesmo com atividade recente", async () => {
    const user = await makeUser("absoluta");
    userIds.push(user.id);
    const { token } = await createSession(user.id, false);

    const row = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    await prisma.session.update({
      where: { id: row.id },
      data: {
        expiresAt: new Date(Date.now() - MINUTE_MS), // ja vencida
        lastActivityAt: new Date(), // atividade "agora" - nao deveria salvar
      },
    });

    const result = await validateSessionToken(token);
    expect(result.user).toBeNull();
    expect(result.reason).toBe("absolute");
  });

  it("'lembrar de mim' estende o teto absoluto mas NAO desativa a expiracao por inatividade", async () => {
    const user = await makeUser("lembrar");
    userIds.push(user.id);
    const { token, expiresAt } = await createSession(user.id, true);

    // confirma que o teto absoluto de fato foi estendido (30 dias, nao 7)
    const expectedMin = Date.now() + (ABSOLUTE_SESSION_DAYS_REMEMBERED - 1) * DAY_MS;
    expect(expiresAt.getTime()).toBeGreaterThan(expectedMin);

    const row = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    await prisma.session.update({
      where: { id: row.id },
      data: { lastActivityAt: new Date(Date.now() - (INACTIVITY_TIMEOUT_MINUTES + 1) * MINUTE_MS) },
    });

    // mesmo com expiresAt a 30 dias de distancia, a sessao expira por
    // inatividade - "lembrar de mim" muda so o teto absoluto.
    const result = await validateSessionToken(token);
    expect(result.user).toBeNull();
    expect(result.reason).toBe("inactivity");
  });

  it("sem 'lembrar de mim' o teto absoluto usa ABSOLUTE_SESSION_DAYS_DEFAULT", async () => {
    const user = await makeUser("padrao");
    userIds.push(user.id);
    const { expiresAt } = await createSession(user.id, false);

    const expectedMax = Date.now() + (ABSOLUTE_SESSION_DAYS_DEFAULT + 1) * DAY_MS;
    const expectedMin = Date.now() + (ABSOLUTE_SESSION_DAYS_DEFAULT - 1) * DAY_MS;
    expect(expiresAt.getTime()).toBeLessThan(expectedMax);
    expect(expiresAt.getTime()).toBeGreaterThan(expectedMin);
  });

  it("throttle: nao regrava lastActivityAt se a marca atual tem menos que ACTIVITY_UPDATE_THROTTLE_MINUTES", async () => {
    const user = await makeUser("throttle-dentro");
    userIds.push(user.id);
    const { token } = await createSession(user.id, false);

    const row = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    const staleButUnderThrottle = new Date(Date.now() - (ACTIVITY_UPDATE_THROTTLE_MINUTES - 1) * MINUTE_MS);
    await prisma.session.update({ where: { id: row.id }, data: { lastActivityAt: staleButUnderThrottle } });

    await validateSessionToken(token);

    const after = await prisma.session.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.lastActivityAt.getTime()).toBe(staleButUnderThrottle.getTime());
  });

  it("throttle: regrava lastActivityAt quando a marca atual passou do throttle (mas nao do timeout)", async () => {
    const user = await makeUser("throttle-fora");
    userIds.push(user.id);
    const { token } = await createSession(user.id, false);

    const row = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    const staleOverThrottle = new Date(Date.now() - (ACTIVITY_UPDATE_THROTTLE_MINUTES + 1) * MINUTE_MS);
    await prisma.session.update({ where: { id: row.id }, data: { lastActivityAt: staleOverThrottle } });

    const before = Date.now();
    await validateSessionToken(token);

    const after = await prisma.session.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe("reautenticacao para acoes sensiveis (step-up)", () => {
  const userIds: string[] = [];
  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("sessao recem-criada nao esta elevada", async () => {
    const user = await makeUser("nao-elevada");
    userIds.push(user.id);
    const { token } = await createSession(user.id, false);
    const { session } = await validateSessionToken(token);
    expect(session && isSessionElevated(session)).toBe(false);
  });

  it("elevateSession eleva a sessao dentro da janela de graca", async () => {
    const user = await makeUser("elevada");
    userIds.push(user.id);
    const { token } = await createSession(user.id, false);
    const { session: before } = await validateSessionToken(token);
    if (!before) throw new Error("sessao deveria existir");

    const elevatedUntil = await elevateSession(before.id);
    expect(elevatedUntil.getTime()).toBeGreaterThan(Date.now());
    expect(elevatedUntil.getTime()).toBeLessThanOrEqual(Date.now() + STEP_UP_GRACE_MINUTES * MINUTE_MS + 1000);

    const { session: after } = await validateSessionToken(token);
    expect(after && isSessionElevated(after)).toBe(true);
  });

  it("elevacao expirada nao conta como elevada", async () => {
    const user = await makeUser("elevacao-vencida");
    userIds.push(user.id);
    const { token } = await createSession(user.id, false);
    const row = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    await prisma.session.update({
      where: { id: row.id },
      data: { elevatedUntil: new Date(Date.now() - MINUTE_MS) },
    });

    const { session } = await validateSessionToken(token);
    expect(session && isSessionElevated(session)).toBe(false);
  });

  it("cada sessao tem sua propria janela de elevacao (elevar uma nao eleva outra)", async () => {
    const user = await makeUser("multi-sessao");
    userIds.push(user.id);
    const first = await createSession(user.id, false);
    const second = await createSession(user.id, false);

    const { session: firstSession } = await validateSessionToken(first.token);
    if (!firstSession) throw new Error("sessao 1 deveria existir");
    await elevateSession(firstSession.id);

    const { session: firstAfter } = await validateSessionToken(first.token);
    const { session: secondAfter } = await validateSessionToken(second.token);
    expect(firstAfter && isSessionElevated(firstAfter)).toBe(true);
    expect(secondAfter && isSessionElevated(secondAfter)).toBe(false);
  });
});

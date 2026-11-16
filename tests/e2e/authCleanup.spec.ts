import { test, expect } from "@playwright/test";
import crypto from "crypto";
import { hashPassword } from "@/lib/auth/password";
import { newTestPrisma } from "./helpers/session";
import { assertTestDatabase, loadTestEnv } from "../testEnv";

// Prova, no servidor Next.js REAL, que a limpeza agendada com after() de fato executa depois da
// resposta do login (os testes de integracao simulam o after(); aqui ele e o do framework).
loadTestEnv();
assertTestDatabase();
const prisma = newTestPrisma();
const PASSWORD = "SenhaValida123";
const H = 60 * 60 * 1000;
const createdUserIds: string[] = [];

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

test("login real: a resposta sai e, depois dela, after() apaga a sessão e o link vencidos (e só eles)", async ({ request }) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const user = await prisma.user.create({ data: { name: "Limpeza E2E", email: `limpeza-e2e-${stamp}@example.com`, passwordHash: await hashPassword(PASSWORD) } });
  createdUserIds.push(user.id);

  // Banco de teste: tira o lixo antigo que ja era apagavel (o lote e de 500 e a escolha nao e
  // ordenada), para a linha deste teste entrar no lote do login.
  const graceCutoff = new Date(Date.now() - 24 * H);
  await prisma.session.deleteMany({ where: { expiresAt: { lt: graceCutoff } } });
  await prisma.session.deleteMany({ where: { lastActivityAt: { lt: new Date(Date.now() - 26 * H) } } });
  await prisma.passwordResetToken.deleteMany({ where: { OR: [{ expiresAt: { lt: graceCutoff } }, { usedAt: { lt: graceCutoff } }] } });

  const old = await prisma.session.create({ data: { id: crypto.randomUUID(), userId: user.id, expiresAt: new Date(Date.now() - 48 * H), lastActivityAt: new Date(Date.now() - 48 * H) } });
  const valid = await prisma.session.create({ data: { id: crypto.randomUUID(), userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * H), lastActivityAt: new Date() } });
  const oldToken = await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() - 48 * H) } });
  const validToken = await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 30 * 60_000) } });

  const res = await request.post("/api/auth/login", { data: { email: user.email, password: PASSWORD } });
  expect(res.status()).toBe(200);
  expect(res.headers()["set-cookie"]).toContain("session=");

  // after() roda depois da resposta: espera ate a linha vencida sumir.
  await expect
    .poll(async () => (await prisma.session.count({ where: { id: old.id } })) + (await prisma.passwordResetToken.count({ where: { id: oldToken.id } })), { timeout: 15_000 })
    .toBe(0);
  // E nunca o que ainda vale.
  expect(await prisma.session.count({ where: { id: valid.id } })).toBe(1);
  expect(await prisma.passwordResetToken.count({ where: { id: validToken.id } })).toBe(1);
});

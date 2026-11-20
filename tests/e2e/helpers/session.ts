import type { BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { currentAcceptanceData } from "@/lib/legal/acceptance";

// Usuario ja com onboarding concluido e sessao ativa, criados direto no banco de teste (sem
// passar pelo cadastro e pelo assistente) - para specs que so precisam estar "logadas" nas
// telas do app. `cleanup` apaga o usuario (empresa e sessoes saem em cascata).
export async function createOnboardedUser(prisma: PrismaClient, label: string) {
  const user = await prisma.user.create({
    data: { name: `E2E ${label}`, email: `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`, passwordHash: "x", ...currentAcceptanceData() },
  });
  await prisma.business.create({ data: { userId: user.id, name: `Empresa ${label}`, onboardingCompleted: true } });
  const { token } = await createSession(user.id, false);
  return {
    userId: user.id,
    token,
    cookieHeader: `${SESSION_COOKIE_NAME}=${token}`,
    async signIn(context: BrowserContext, baseURL: string) {
      await context.addCookies([{ name: SESSION_COOKIE_NAME, value: token, url: baseURL }]);
    },
  };
}

export function newTestPrisma() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
}

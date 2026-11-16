import type { FullConfig } from "@playwright/test";
import { assertTestDatabase, loadTestEnv } from "../testEnv";
import { runWarmup } from "./helpers/warmup";

// Segunda linha de defesa (a primeira e a checagem no proprio
// playwright.config.ts, que roda antes de o webServer subir).
//
// Depois: aquecimento do servidor de teste. O Playwright sobe o webServer ANTES do
// globalSetup, entao aqui o servidor ja responde. Visita todas as paginas e aciona todas
// as rotas de API uma vez (ver helpers/warmup.ts), para que a compilacao a frio do
// `next dev` nao caia dentro do tempo limite de um teste. E2E_SKIP_WARMUP=1 pula (so para
// medir a suite sem aquecimento).
export default async function globalSetup(config: FullConfig) {
  loadTestEnv();
  assertTestDatabase();
  if (process.env.E2E_SKIP_WARMUP === "1") return;

  const baseUrl = config.projects[0]?.use.baseURL ?? process.env.APP_URL;
  if (!baseUrl) throw new Error("[warmup] baseURL ausente na configuracao do Playwright.");

  // Importados aqui (e nao no topo) para o DATABASE_URL de teste ja estar carregado quando
  // src/lib/db.ts criar a conexao.
  const { prisma } = await import("@/lib/db");
  const { createSession, SESSION_COOKIE_NAME } = await import("@/lib/auth/session");

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const userIds: string[] = [];
  async function sessionCookie(label: string, onboardingCompleted: boolean) {
    const user = await prisma.user.create({
      data: { name: `Aquecimento ${label}`, email: `warmup-${label}-${stamp}@example.com`, passwordHash: "x" },
    });
    userIds.push(user.id);
    await prisma.business.create({
      data: { userId: user.id, name: `Empresa aquecimento ${label}`, onboardingCompleted },
    });
    const { token } = await createSession(user.id, false);
    return `${SESSION_COOKIE_NAME}=${token}`;
  }

  try {
    const sessions = { onboarded: await sessionCookie("ok", true), fresh: await sessionCookie("novo", false) };
    const started = Date.now();
    const results = await runWarmup(baseUrl, sessions);
    const slowest = [...results].sort((a, b) => b.ms - a.ms)[0];
    console.log(`[warmup] ${results.length} itens em ${Math.round((Date.now() - started) / 1000)} s (mais lento: ${slowest?.url} ${slowest?.ms} ms)`);
  } finally {
    // Usuarios descartaveis: sessoes e empresa saem em cascata.
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
}

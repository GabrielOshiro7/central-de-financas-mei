import { test, expect, type Browser } from "@playwright/test";
import { gotoHydrated } from "./helpers/hydration";
import { createOnboardedUser, newTestPrisma } from "./helpers/session";
import { assertTestDatabase, loadTestEnv } from "../testEnv";
import { MINIMUM_AGE, PRIVACY_POLICY_VERSION, REGISTER_ACCEPT_TEXT, TERMS_VERSION } from "@/content/legal/meta";
import { PRIVACY_CHANGES, TERMS_CHANGES } from "@/content/legal/changes";

// Reaceite dos documentos legais. O servidor de teste liga o mecanismo com LEGAL_REACCEPT_FORCE=1
// (playwright.config.ts), porque LEGAL_DOCS_DRAFT continua true: com o rascunho ligado o mecanismo
// fica desligado no app de verdade, e isso é provado nos testes de unidade (legalReacceptGuard.test.ts).
loadTestEnv();
assertTestDatabase();
const prisma = newTestPrisma();
const REACCEPT_CODE = "LEGAL_REACCEPT_REQUIRED";

test.afterAll(async () => {
  await prisma.$disconnect();
});

// Usuario onboarded cujo aceite esta desatualizado (ou nunca existiu, com `never`).
async function outdatedUser(label: string, opts: { never?: boolean; onboarded?: boolean } = {}) {
  const user = await createOnboardedUser(prisma, label);
  await prisma.user.update({
    where: { id: user.userId },
    data: opts.never ? { legalAcceptedAt: null, termsVersion: null, privacyVersion: null } : { termsVersion: "0.1", privacyVersion: "0.1" },
  });
  if (opts.onboarded === false) await prisma.business.update({ where: { userId: user.userId }, data: { onboardingCompleted: false } });
  return user;
}

async function loggedPage(browser: Browser, baseURL: string, user: Awaited<ReturnType<typeof outdatedUser>>) {
  const context = await browser.newContext();
  await user.signIn(context, baseURL);
  return { context, page: await context.newPage() };
}

test.describe("reaceite dos documentos legais (mecanismo ligado)", () => {
  test("aceite desatualizado: o app leva ao reaceite com o resumo; a API responde 403; aceitar grava e libera", async ({ browser, baseURL }) => {
    const user = await outdatedUser("reaceite-versao");
    const { context, page } = await loggedPage(browser, baseURL!, user);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/reaceite$/);
    await expect(page.getByRole("heading", { name: "Documentos atualizados", level: 1 })).toBeVisible();
    await expect(page.locator("[data-app-shell]")).toHaveCount(0); // antes de acessar o app: sem menu nem telas

    // Resumo do que mudou desde a versão aceita (0.1): tudo das versões posteriores a 0.1.
    const termsLines = TERMS_CHANGES.filter((c) => c.version !== "0.1").flatMap((c) => c.summary);
    const privacyLines = PRIVACY_CHANGES.filter((c) => c.version !== "0.1").flatMap((c) => c.summary);
    for (const line of [...termsLines, ...privacyLines]) await expect(page.getByText(line)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Termos de Serviço/ })).toContainText(`versão ${TERMS_VERSION}`);
    await expect(page.getByRole("heading", { name: /Política de Privacidade/ })).toContainText(`versão ${PRIVACY_POLICY_VERSION}`);
    const links = page.getByRole("link", { name: "Ler o texto completo" });
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAttribute("href", "/termos");
    await expect(links.nth(1)).toHaveAttribute("href", "/privacidade");

    // API do app: 403 com mensagem clara e código; qualquer rota autenticada.
    for (const path of ["/api/clientes/search?q=a", "/api/insights", "/api/agenda"]) {
      const res = await page.request.get(path);
      expect(res.status(), path).toBe(403);
      const body = await res.json();
      expect(body.code).toBe(REACCEPT_CODE);
      expect(body.error).toMatch(/aceite os Termos de Serviço e a Política de Privacidade atualizados/i);
    }
    const write = await page.request.post("/api/clientes", { data: { name: "Bloqueado" } });
    expect(write.status()).toBe(403);

    // A rota de aceite também exige a caixa marcada (servidor), com a declaração de maioridade na mensagem.
    expect((await page.request.post("/api/legal/accept", { data: {} })).status()).toBe(400);
    const refused = await page.request.post("/api/legal/accept", { data: { acceptTerms: false } });
    expect(refused.status()).toBe(400);
    expect((await refused.json()).error).toBe(
      `Declare ter ${MINIMUM_AGE} anos ou mais e aceite os Termos de Serviço e a Política de Privacidade para continuar.`
    );

    // Sem marcar a caixa: não avança.
    await gotoHydrated(page, "/reaceite");
    // A caixa do reaceite tem o MESMO texto do cadastro, com a declaração de maioridade.
    expect(REGISTER_ACCEPT_TEXT).toBe("Declaro ter 18 anos ou mais e li e aceito os Termos de Serviço e a Política de Privacidade");
    await expect(page.getByLabel(REGISTER_ACCEPT_TEXT)).toBeVisible();
    await page.getByRole("button", { name: "Aceitar e continuar" }).click();
    await expect(page.locator('p[role="alert"]')).toHaveText(
      `Declare ter ${MINIMUM_AGE} anos ou mais e aceite os Termos de Serviço e a Política de Privacidade para continuar.`
    );
    await expect(page).toHaveURL(/\/reaceite$/);
    const before = Date.now();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })).termsVersion).toBe("0.1");

    // Marca e aceita: grava data/hora e as versões VIGENTES, e libera o app.
    await page.getByLabel(/li e aceito/i).check();
    await page.getByRole("button", { name: "Aceitar e continuar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.userId } });
    expect([saved.termsVersion, saved.privacyVersion]).toEqual([TERMS_VERSION, PRIVACY_POLICY_VERSION]);
    expect(saved.legalAcceptedAt!.getTime()).toBeGreaterThanOrEqual(before - 5000);

    expect((await page.request.get("/api/clientes/search?q=a")).status()).toBe(200);
    await page.goto("/reaceite"); // nada pendente: volta ao app
    await expect(page).toHaveURL(/\/dashboard$/);
    await context.close();
  });

  test("conta sem registro de aceite (campos nulos) também passa pelo reaceite, com o texto de primeiro aceite", async ({ browser, baseURL }) => {
    const user = await outdatedUser("reaceite-nulo", { never: true });
    const { context, page } = await loggedPage(browser, baseURL!, user);
    await page.goto("/clientes");
    await expect(page).toHaveURL(/\/reaceite$/);
    await expect(page.getByText("Ainda não temos o registro do seu aceite")).toBeVisible();
    await gotoHydrated(page, "/reaceite");
    await page.getByLabel(/li e aceito/i).check();
    await page.getByRole("button", { name: "Aceitar e continuar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })).legalAcceptedAt).not.toBeNull();
    await context.close();
  });

  test("o onboarding também exige o reaceite, e depois de aceitar o usuário segue para o onboarding", async ({ browser, baseURL }) => {
    const user = await outdatedUser("reaceite-onboarding", { onboarded: false });
    const { context, page } = await loggedPage(browser, baseURL!, user);
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/reaceite$/);
    await gotoHydrated(page, "/reaceite");
    await page.getByLabel(/li e aceito/i).check();
    await page.getByRole("button", { name: "Aceitar e continuar" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await context.close();
  });

  test("sair (logout) continua disponível na tela de reaceite", async ({ browser, baseURL }) => {
    const user = await outdatedUser("reaceite-sair");
    const { context, page } = await loggedPage(browser, baseURL!, user);
    await gotoHydrated(page, "/reaceite");
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("rotas de autenticação e a leitura dos documentos legais ficam liberadas com o reaceite pendente", async ({ browser, baseURL }) => {
    const user = await outdatedUser("reaceite-liberadas");
    const { context, page } = await loggedPage(browser, baseURL!, user);
    for (const path of ["/termos", "/privacidade", "/cookies", "/tokushoho", "/licencas"]) {
      const res = await page.goto(path);
      expect(res!.status(), path).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
    // Autenticação: nunca 403 de reaceite (aqui 400 por corpo vazio, ou 200).
    for (const path of ["/api/auth/change-password", "/api/auth/reauth", "/api/auth/login", "/api/auth/forgot-password"]) {
      const res = await page.request.post(path, { data: {} });
      expect(res.status(), path).not.toBe(403);
    }
    expect((await page.request.post("/api/auth/logout")).status()).toBe(200);
    await context.close();
  });

  test("usuário em dia não vê o reaceite", async ({ browser, baseURL }) => {
    const user = await createOnboardedUser(prisma, "reaceite-emdia");
    const { context, page } = await loggedPage(browser, baseURL!, user);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    expect((await page.request.get("/api/clientes/search?q=a")).status()).toBe(200);
    await context.close();
  });
});

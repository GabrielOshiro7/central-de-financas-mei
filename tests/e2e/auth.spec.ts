import { test, expect } from "@playwright/test";
import { gotoHydrated } from "./helpers/hydration";

const PASSWORD = "SenhaValida123";

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

async function register(page: import("@playwright/test").Page, name: string, email: string) {
  await gotoHydrated(page, "/register");
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
}

// O Next.js injeta um <div role="alert"> global (route announcer) para leitores
// de tela, que colide com getByRole("alert"). Escopamos ao <p role="alert">
// que os formularios realmente usam para mostrar erros.
function formError(page: import("@playwright/test").Page) {
  return page.locator('p[role="alert"]');
}

test.describe("tela inicial", () => {
  // A landing repete "Entrar"/"Criar conta" no cabecalho e no hero - o teste
  // olha o menu do cabecalho. A recuperacao de senha nao fica na landing: e o
  // link "Esqueci minha senha" da tela de login.
  test("mostra entrar, criar conta e recuperar senha", async ({ page }) => {
    await gotoHydrated(page, "/");
    const authNav = page.getByRole("navigation", { name: "Autenticação" });
    await expect(authNav.getByRole("link", { name: "Entrar" })).toBeVisible();
    await expect(authNav.getByRole("link", { name: "Criar conta" })).toBeVisible();

    await authNav.getByRole("link", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("link", { name: "Esqueci minha senha" })).toBeVisible();
  });
});

test.describe("cadastro", () => {
  // Cenario 1: criar conta nova -> usuario criado no banco. Desde a Etapa 2,
  // quem ainda nao completou o onboarding cai em /onboarding, nao direto no
  // dashboard (ver tests/e2e/onboarding.spec.ts para o fluxo completo ate o
  // dashboard).
  test("criar conta nova leva ao onboarding", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, "Usuario Teste", email);

    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole("heading", { name: "Qual é o tipo do seu negócio?" })).toBeVisible();
  });

  // Cenario 2: criar conta com e-mail ja existente -> cadastro recusado.
  test("recusa cadastro com e-mail ja existente", async ({ page, context }) => {
    const email = uniqueEmail();
    await register(page, "Primeiro Usuario", email);
    await expect(page).toHaveURL(/\/onboarding/);

    await context.clearCookies();
    await register(page, "Segundo Usuario", email);

    await expect(page).toHaveURL(/\/register/);
    await expect(formError(page)).toHaveText("Este e-mail já está cadastrado.");
  });
});

test.describe("login e logout", () => {
  // Login de um usuario que ainda nao completou o onboarding -> onboarding,
  // nao dashboard. O fluxo completo (onboarding -> dashboard -> logout ->
  // login -> direto ao dashboard) esta em onboarding.spec.ts.
  test("login com credenciais corretas acessa o onboarding, e logout encerra a sessao", async ({
    page,
  }) => {
    const email = uniqueEmail();
    await register(page, "Usuario Login", email);
    await expect(page).toHaveURL(/\/onboarding/);

    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/onboarding/);
  });

  // Cenario 4: login com senha incorreta -> recusado, mensagem generica.
  test("login com senha incorreta mostra mensagem generica", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, "Usuario Senha Errada", email);
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill("senhaErradaXYZ123");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(formError(page)).toHaveText("E-mail ou senha incorretos.");
    await expect(page).toHaveURL(/\/login/);
  });

  // Cenario 6: acesso a /dashboard sem autenticacao -> redireciona para /login.
  test("acesso ao dashboard sem sessao redireciona para o login", async ({ page }) => {
    await gotoHydrated(page, "/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  // Cenario 7: fechar e reabrir o navegador -> sessao continua funcionando (cookie persiste).
  test("sessao continua valida em uma nova aba do mesmo navegador", async ({ page, context }) => {
    const email = uniqueEmail();
    await register(page, "Usuario Persistencia", email);
    await expect(page).toHaveURL(/\/onboarding/);

    const newPage = await context.newPage();
    await gotoHydrated(newPage, "/onboarding");
    await expect(newPage).toHaveURL(/\/onboarding/);
    await expect(
      newPage.getByRole("heading", { name: "Qual é o tipo do seu negócio?" })
    ).toBeVisible();
  });
});

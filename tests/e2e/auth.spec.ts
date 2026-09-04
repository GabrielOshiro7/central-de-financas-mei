import { test, expect } from "@playwright/test";

const PASSWORD = "SenhaValida123";

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

async function register(page: import("@playwright/test").Page, name: string, email: string) {
  await page.goto("/register");
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
  test("mostra entrar, criar conta e recuperar senha", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Criar conta" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Recuperar senha" })).toBeVisible();
  });
});

test.describe("cadastro", () => {
  // Cenario 1: criar conta nova -> usuario criado no banco (comprovado pelo acesso ao dashboard).
  test("criar conta nova leva ao dashboard com o nome do usuario", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, "Usuario Teste", email);

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Bem-vindo, Usuario Teste" })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
  });

  // Cenario 2: criar conta com e-mail ja existente -> cadastro recusado.
  test("recusa cadastro com e-mail ja existente", async ({ page, context }) => {
    const email = uniqueEmail();
    await register(page, "Primeiro Usuario", email);
    await expect(page).toHaveURL(/\/dashboard/);

    await context.clearCookies();
    await register(page, "Segundo Usuario", email);

    await expect(page).toHaveURL(/\/register/);
    await expect(formError(page)).toHaveText("Este e-mail já está cadastrado.");
  });
});

test.describe("login e logout", () => {
  // Cenario 3, 5, 8: login correto -> dashboard; logout -> volta ao login; dados persistem.
  test("login com credenciais corretas acessa o dashboard, e logout encerra a sessao", async ({
    page,
  }) => {
    const email = uniqueEmail();
    await register(page, "Usuario Login", email);
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Bem-vindo, Usuario Login" })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
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
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  // Cenario 7: fechar e reabrir o navegador -> login continua funcionando (cookie persiste).
  test("sessao continua valida em uma nova aba do mesmo navegador", async ({ page, context }) => {
    const email = uniqueEmail();
    await register(page, "Usuario Persistencia", email);
    await expect(page).toHaveURL(/\/dashboard/);

    const newPage = await context.newPage();
    await newPage.goto("/dashboard");
    await expect(newPage).toHaveURL(/\/dashboard/);
    await expect(
      newPage.getByRole("heading", { name: "Bem-vindo, Usuario Persistencia" })
    ).toBeVisible();
  });
});

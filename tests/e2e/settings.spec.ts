import { test, expect, type Page } from "@playwright/test";
import { fillMoney } from "./helpers/money";

const PASSWORD = "SenhaValida123";
const NEW_PASSWORD = "SenhaNovaValida456";

function uniqueEmail() {
  return `cfg-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

async function register(page: Page, name: string, email: string) {
  await page.goto("/register");
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
}

async function completeOnboarding(page: Page, name: string) {
  await page.getByRole("button", { name: "Loja", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Venda de produtos", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nome da empresa").fill(name);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "1 a 3 anos", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Número de pessoas").fill("3");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /BRL/ }).click();
  await fillMoney(page.getByLabel("Valor médio mensal"), "5000");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Ir para o dashboard" }).click();
}

function formError(page: Page) {
  return page.locator('p[role="alert"]');
}

test.describe("configuracoes - alterar senha", () => {
  test("recusa com senha atual incorreta, aceita com senha atual correta", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, "Usuario Senha", email);
    await completeOnboarding(page, "Empresa Senha");

    await page.getByRole("link", { name: "Configurações" }).click();
    await expect(page).toHaveURL(/\/configuracoes/);

    await page.getByLabel("Senha atual").fill("senhaErradaQualquer123");
    await page.getByLabel("Nova senha", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirmar nova senha").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Alterar senha" }).click();

    await expect(formError(page)).toHaveText("Senha atual incorreta.");

    await page.getByLabel("Senha atual").fill(PASSWORD);
    await page.getByLabel("Nova senha", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirmar nova senha").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Alterar senha" }).click();

    await expect(page.getByText("Senha alterada com sucesso.")).toBeVisible();

    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login/);

    // senha antiga nao funciona mais
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.locator('p[role="alert"]')).toHaveText("E-mail ou senha incorretos.");

    // senha nova funciona
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("troca de senha invalida as demais sessoes ativas", async ({ page, browser }) => {
    const email = uniqueEmail();
    await register(page, "Usuario Multi Sessao", email);
    await completeOnboarding(page, "Empresa Multi Sessao");

    // segunda sessao logada com a mesma conta, em outro contexto de navegador
    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await otherPage.goto("/login");
    await otherPage.getByLabel("E-mail").fill(email);
    await otherPage.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await otherPage.getByRole("button", { name: "Entrar" }).click();
    await expect(otherPage).toHaveURL(/\/dashboard/);

    // troca a senha na primeira sessao
    await page.getByRole("link", { name: "Configurações" }).click();
    await page.getByLabel("Senha atual").fill(PASSWORD);
    await page.getByLabel("Nova senha", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirmar nova senha").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Alterar senha" }).click();
    await expect(page.getByText("Senha alterada com sucesso.")).toBeVisible();

    // a sessao antiga (otherPage) deixa de funcionar
    await otherPage.reload();
    await expect(otherPage).toHaveURL(/\/login/);

    // a sessao atual (page) continua funcionando normalmente
    await page.reload();
    await expect(page).toHaveURL(/\/configuracoes/);

    await otherContext.close();
  });
});

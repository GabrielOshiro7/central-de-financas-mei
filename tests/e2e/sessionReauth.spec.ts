import { test, expect, type Page } from "@playwright/test";
import { fillMoney } from "./helpers/money";

const PASSWORD = "SenhaValida123";

function uniqueEmail(prefix = "reauth") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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
  await page.getByLabel("Número de pessoas").fill("5");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /BRL/ }).click();
  await fillMoney(page.getByLabel("Valor médio mensal"), "10000");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Tudo pronto!" })).toBeVisible();
  await page.getByRole("button", { name: "Ir para o dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function addRevenue(page: Page, description: string) {
  await page.getByRole("button", { name: "+ Novo lançamento" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Data").fill(todayIso());
  await dialog.getByLabel("Descrição").fill(description);
  await dialog.getByLabel("Categoria").selectOption({ label: "Venda de produtos" });
  await fillMoney(dialog.getByLabel("Valor"), "100");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe("reautenticação para excluir lançamento (step-up)", () => {
  test("senha errada não exclui; senha correta eleva a sessão e completa a exclusão; uma 2ª exclusão na janela de graça não pede senha de novo", async ({
    page,
  }) => {
    const email = uniqueEmail();
    await register(page, "Dono Reauth", email);
    await completeOnboarding(page, "Empresa Reauth E2E");

    await page.goto("/financeiro/receitas");
    await addRevenue(page, "Lançamento A E2E");
    await addRevenue(page, "Lançamento B E2E");

    // --- Lançamento A: senha errada primeiro ---
    await page
      .getByRole("row", { name: /Lançamento A E2E/ })
      .getByRole("button", { name: "Excluir" })
      .click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();

    const reauthDialog = page.getByRole("alertdialog", { name: "Confirme sua senha" });
    await expect(reauthDialog).toBeVisible();
    await reauthDialog.getByLabel("Senha").fill("senhaErrada999");
    await reauthDialog.getByRole("button", { name: "Confirmar" }).click();
    await expect(reauthDialog.getByText("Senha incorreta.")).toBeVisible();
    // continua visivel: nem a exclusao nem a elevacao aconteceram
    await expect(page.getByText("Lançamento A E2E")).toBeVisible();

    // --- agora com a senha correta ---
    await reauthDialog.getByLabel("Senha").fill(PASSWORD);
    await reauthDialog.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("Lançamento A E2E")).toHaveCount(0);

    // --- Lançamento B: dentro da janela de graça, nao deveria pedir senha de novo ---
    await page
      .getByRole("row", { name: /Lançamento B E2E/ })
      .getByRole("button", { name: "Excluir" })
      .click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByText("Lançamento B E2E")).toHaveCount(0);
    await expect(page.getByRole("alertdialog", { name: "Confirme sua senha" })).toHaveCount(0);
  });
});

test.describe("login - lembrar de mim", () => {
  test("desmarcado (padrão) gera cookie de sessão sem persistência; marcado gera cookie persistente", async ({
    page,
    context,
  }) => {
    const email = uniqueEmail("remember");
    await register(page, "Dono Remember", email);
    await completeOnboarding(page, "Empresa Remember E2E");
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login/);

    // sem marcar "lembrar de mim"
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    let cookies = await context.cookies();
    let sessionCookie = cookies.find((c) => c.name === "session");
    expect(sessionCookie).toBeTruthy();
    // cookie de sessao (sem expiracao persistida) - Playwright reporta -1
    expect(sessionCookie?.expires).toBe(-1);

    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login/);

    // agora marcando "lembrar de mim"
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Lembrar de mim").check();
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    cookies = await context.cookies();
    sessionCookie = cookies.find((c) => c.name === "session");
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie?.expires).toBeGreaterThan(0);
  });
});

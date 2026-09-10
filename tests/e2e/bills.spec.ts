import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "SenhaValida123";

function uniqueEmail(prefix = "bills") {
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
  await page.getByLabel("Valor médio mensal").fill("10000");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Tudo pronto!" })).toBeVisible();
  await page.getByRole("button", { name: "Ir para o dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("Etapa 5 - contas a pagar e a receber", () => {
  test("cria, paga e reverte uma conta a pagar pela UI", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const email = uniqueEmail();
    await register(page, "Dono Contas", email);
    await completeOnboarding(page, "Empresa Contas E2E");

    await page.goto("/financeiro/pagar");
    await expect(page.getByRole("heading", { name: "Contas a pagar" })).toBeVisible();

    await page.getByRole("button", { name: "+ Nova conta a pagar" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Descrição").fill("Aluguel do escritório E2E");
    await dialog.getByLabel("Categoria").selectOption({ label: "Aluguel" });
    await dialog.getByLabel("Valor").fill("1500");
    await dialog.getByLabel("Fornecedor (opcional)").fill("Imobiliária E2E");
    await dialog.getByLabel("Data de vencimento").fill(todayIso());
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect(dialog).toHaveCount(0);

    // Aparece na tabela como Pendente.
    const row = page.getByRole("row", { name: /Aluguel do escritório E2E/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("Pendente")).toBeVisible();
    await expect(row.getByText("Imobiliária E2E")).toBeVisible();

    // Marcar como pago -> dialogo de data -> confirmar.
    await row.getByRole("button", { name: "Marcar como pago" }).click();
    const settleDialog = page.getByRole("alertdialog");
    await expect(settleDialog.getByText("Marcar como pago")).toBeVisible();
    await settleDialog.locator("#settleDate").fill(todayIso());
    await settleDialog.getByRole("button", { name: "Confirmar" }).click();
    await expect(settleDialog).toHaveCount(0);

    await expect(row.getByText("Pago", { exact: true })).toBeVisible();
    await expect(row.getByText("Pendente")).toHaveCount(0);

    // Reverter -> volta a Pendente.
    await row.getByRole("button", { name: "Reverter" }).click();
    const revertDialog = page.getByRole("alertdialog");
    await expect(revertDialog.getByText("Reverter confirmação")).toBeVisible();
    await revertDialog.getByRole("button", { name: "Reverter" }).click();
    await expect(revertDialog).toHaveCount(0);
    await expect(row.getByText("Pendente")).toBeVisible();

    expect(consoleErrors, `Erros de console encontrados: ${consoleErrors.join("; ")}`).toEqual([]);
  });

  test("cria e confirma uma conta a receber, e o dashboard mostra o painel de previsão", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const email = uniqueEmail("receber");
    await register(page, "Dono Contas Receber", email);
    await completeOnboarding(page, "Empresa Contas Receber E2E");

    await page.goto("/financeiro/receber");
    await expect(page.getByRole("heading", { name: "Contas a receber" })).toBeVisible();

    await page.getByRole("button", { name: "+ Nova conta a receber" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Descrição").fill("Venda a prazo E2E");
    await dialog.getByLabel("Categoria").selectOption({ label: "Venda de produtos" });
    await dialog.getByLabel("Valor").fill("800");
    await dialog.getByLabel("Cliente (opcional)").fill("Cliente E2E");
    await dialog.getByLabel("Data de vencimento").fill(todayIso());
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect(dialog).toHaveCount(0);

    const row = page.getByRole("row", { name: /Venda a prazo E2E/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("Pendente")).toBeVisible();

    await row.getByRole("button", { name: "Marcar como recebido" }).click();
    const settleDialog = page.getByRole("alertdialog");
    await settleDialog.locator("#settleDate").fill(todayIso());
    await settleDialog.getByRole("button", { name: "Confirmar" }).click();
    await expect(settleDialog).toHaveCount(0);
    await expect(row.getByText("Recebido", { exact: true })).toBeVisible();

    // Dashboard: painel novo integrado, rotulado como Previsão.
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Contas a pagar e a receber" })).toBeVisible();
    await expect(page.getByText("Previsão", { exact: true })).toBeVisible();

    expect(consoleErrors, `Erros de console encontrados: ${consoleErrors.join("; ")}`).toEqual([]);
  });
});

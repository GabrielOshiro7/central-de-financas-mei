import { test, expect, type Page } from "@playwright/test";
import { gotoHydrated } from "./helpers/hydration";
import { fillMoney } from "./helpers/money";

const PASSWORD = "SenhaValida123";

function uniqueEmail(prefix = "clientes") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

async function register(page: Page, name: string, email: string) {
  await gotoHydrated(page, "/register");
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

test.describe("Etapa 6 - clientes", () => {
  test("cria, edita, inativa e pesquisa um cliente pela UI", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const email = uniqueEmail();
    await register(page, "Dono Clientes", email);
    await completeOnboarding(page, "Empresa Clientes E2E");

    await gotoHydrated(page, "/clientes");
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
    await expect(page.getByText("Nenhum cliente cadastrado.")).toBeVisible();

    await page.getByRole("button", { name: "Novo cliente", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome", { exact: true }).fill("João da Silva E2E");
    await dialog.getByLabel("Telefone (opcional)").fill("11999990000");
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect(dialog).toHaveCount(0);

    const row = page.getByRole("row", { name: /João da Silva E2E/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("Ativo", { exact: true })).toBeVisible();

    // Editar.
    await row.getByRole("button", { name: "Editar" }).click();
    const editDialog = page.getByRole("dialog");
    await editDialog.getByLabel("Nome", { exact: true }).fill("João da Silva Editado E2E");
    await editDialog.getByRole("button", { name: "Salvar" }).click();
    await expect(editDialog).toHaveCount(0);
    const updatedRow = page.getByRole("row", { name: /João da Silva Editado E2E/ });
    await expect(updatedRow).toBeVisible();

    // Pesquisar.
    await page.getByLabel("Pesquisar").fill("Editado E2E");
    await page.getByLabel("Pesquisar").press("Enter");
    await expect(page.getByRole("row", { name: /João da Silva Editado E2E/ })).toBeVisible();
    await page.getByLabel("Pesquisar").fill("Nome Que Não Existe");
    await page.getByLabel("Pesquisar").press("Enter");
    await expect(page.getByText("Nenhum cliente encontrado para os filtros selecionados.")).toBeVisible();
    await page.getByLabel("Pesquisar").fill("");
    await page.getByLabel("Pesquisar").press("Enter");

    // Inativar - some da lista padrao (so ativos), mas continua existindo com "Todos".
    await page.getByRole("row", { name: /João da Silva Editado E2E/ }).getByRole("button", { name: "Inativar" }).click();
    const confirmDialog = page.getByRole("alertdialog");
    await confirmDialog.getByRole("button", { name: "Inativar" }).click();
    await expect(confirmDialog).toHaveCount(0);
    await expect(page.getByRole("row", { name: /João da Silva Editado E2E/ })).toHaveCount(0);

    await page.getByLabel("Status").selectOption({ label: "Todos" });
    const inactiveRow = page.getByRole("row", { name: /João da Silva Editado E2E/ });
    await expect(inactiveRow).toBeVisible();
    await expect(inactiveRow.getByText("Inativo", { exact: true })).toBeVisible();

    // Perfil do cliente - histórico vazio não gera erro (Cenário 5).
    await inactiveRow.getByRole("link", { name: "Ver" }).click();
    await expect(page.getByRole("heading", { name: "João da Silva Editado E2E" })).toBeVisible();
    await expect(page.getByText("Nenhuma venda registrada para este cliente ainda.")).toBeVisible();

    expect(consoleErrors, `Erros de console encontrados: ${consoleErrors.join("; ")}`).toEqual([]);
  });

  test("multiempresa: clientes de mesmo nome em empresas diferentes não se misturam", async ({ page }) => {
    const emailA = uniqueEmail("clientes-a");
    await register(page, "Dono A", emailA);
    await completeOnboarding(page, "Empresa A E2E");
    await gotoHydrated(page, "/clientes");
    await page.getByRole("button", { name: "Novo cliente", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Nome", { exact: true }).fill("Cliente Duplicado E2E");
    await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("row", { name: /Cliente Duplicado E2E/ })).toBeVisible();

    await page.context().clearCookies();

    const emailB = uniqueEmail("clientes-b");
    await register(page, "Dono B", emailB);
    await completeOnboarding(page, "Empresa B E2E");
    await gotoHydrated(page, "/clientes");
    // Empresa nova - a lista não deve conter o cliente da empresa A.
    await expect(page.getByText("Nenhum cliente cadastrado.")).toBeVisible();
  });
});

import { test, expect, type Page } from "@playwright/test";
import { fillMoney } from "./helpers/money";

const PASSWORD = "SenhaValida123";

function uniqueEmail(prefix = "vendas") {
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

async function createClient(page: Page, name: string) {
  await page.goto("/clientes");
  await page.getByRole("button", { name: /Novo cliente/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe("Etapa 6 - vendas", () => {
  test("Cenário 1: cria uma venda à vista e ela aparece como paga", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const email = uniqueEmail("avista");
    await register(page, "Dono Vendas", email);
    await completeOnboarding(page, "Empresa Vendas E2E");
    await createClient(page, "João Cliente E2E");

    await page.goto("/vendas");
    await expect(page.getByRole("heading", { name: "Vendas" })).toBeVisible();
    await expect(page.getByText("Nenhuma venda encontrada.")).toBeVisible();

    await page.getByRole("link", { name: "Registrar venda" }).click();
    await expect(page).toHaveURL(/\/vendas\/nova/);

    await page.getByLabel("Cliente").selectOption({ label: "João Cliente E2E" });
    await page.getByLabel("Categoria (receita)").selectOption({ label: "Venda de serviços" });
    await page.getByLabel("Data da venda").fill(todayIso());
    await page.getByLabel("Descrição").fill("Serviço A E2E");
    await page.getByLabel("Quantidade").fill("1");
    await fillMoney(page.getByLabel("Preço unitário"), "500");
    await page.getByLabel("Forma de pagamento (opcional)").selectOption({ label: "Transferência" });
    // "À vista" já é o padrão selecionado.

    await page.getByRole("button", { name: "Confirmar venda" }).click();
    await expect(page).toHaveURL(/\/vendas\/[^/]+$/);

    await expect(page.getByText("Confirmada", { exact: true })).toBeVisible();
    await expect(page.getByText("Paga", { exact: true })).toBeVisible();
    await expect(page.getByText("Serviço A E2E")).toBeVisible();

    await page.goto("/vendas");
    const row = page.getByRole("row", { name: /João Cliente E2E/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("Paga", { exact: true })).toBeVisible();

    expect(consoleErrors, `Erros de console encontrados: ${consoleErrors.join("; ")}`).toEqual([]);
  });

  test("Cenário 2 e 3: venda a prazo, recebe uma parcela, e cancelamento é bloqueado após recebimento", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const email = uniqueEmail("aprazo");
    await register(page, "Dono Vendas A Prazo", email);
    await completeOnboarding(page, "Empresa Vendas A Prazo E2E");
    await createClient(page, "Maria Cliente E2E");

    await page.goto("/vendas/nova");
    await page.getByLabel("Cliente").selectOption({ label: "Maria Cliente E2E" });
    await page.getByLabel("Categoria (receita)").selectOption({ label: "Venda de produtos" });
    await page.getByLabel("Data da venda").fill(todayIso());
    await page.getByLabel("Descrição").fill("Produto B E2E");
    await page.getByLabel("Quantidade").fill("1");
    await fillMoney(page.getByLabel("Preço unitário"), "1200");

    await page.getByRole("button", { name: "A prazo" }).click();
    await page.getByLabel("Nº de parcelas").fill("3");
    await page.getByRole("button", { name: "Dividir igualmente" }).click();

    await page.getByRole("button", { name: "Confirmar venda" }).click();
    await expect(page).toHaveURL(/\/vendas\/[^/]+$/);
    await expect(page.getByText("Não paga", { exact: true })).toBeVisible();

    // Registrar recebimento da primeira parcela (linha da tabela de parcelas,
    // nunca a tabela de itens - localizada pelo próprio botão de ação, que só
    // existe na tabela de Bills).
    const firstBillRow = page.locator("tr", { has: page.getByRole("button", { name: "Registrar recebimento" }) }).first();
    await firstBillRow.getByRole("button", { name: "Registrar recebimento" }).click();
    const settleDialog = page.getByRole("alertdialog");
    await settleDialog.locator("#saleSettleDate").fill(todayIso());
    await settleDialog.getByRole("button", { name: "Confirmar" }).click();
    await expect(settleDialog).toHaveCount(0);

    await expect(page.getByText("Parcialmente paga", { exact: true })).toBeVisible();

    // Cancelamento agora deve ser bloqueado (já existe parcela paga).
    await page.getByRole("button", { name: "Cancelar venda" }).click();
    const cancelDialog = page.getByRole("alertdialog");
    await cancelDialog.getByRole("button", { name: "Cancelar venda" }).click();
    await expect(cancelDialog.getByText(/já tem parcela recebida/i)).toBeVisible();
    await cancelDialog.getByRole("button", { name: "Cancelar", exact: true }).click();

    // A venda continua Confirmada (não foi cancelada).
    await expect(page.getByText("Confirmada", { exact: true })).toBeVisible();

    // O 400 do POST .../cancel bloqueado de propósito (linha 135 acima) gera
    // um log de rede "Failed to load resource" do próprio navegador - isso
    // não é um bug (é exatamente o comportamento esperado do Cenário 3), só
    // filtrado aqui para não ser confundido com um erro de verdade.
    const unexpectedErrors = consoleErrors.filter((e) => !e.includes("Failed to load resource"));
    expect(unexpectedErrors, `Erros de console encontrados: ${unexpectedErrors.join("; ")}`).toEqual([]);
  });

  test("Cenário 3: cancelamento é permitido quando nenhuma parcela foi recebida", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const email = uniqueEmail("cancelar");
    await register(page, "Dono Vendas Cancelar", email);
    await completeOnboarding(page, "Empresa Vendas Cancelar E2E");
    await createClient(page, "Pedro Cliente E2E");

    await page.goto("/vendas/nova");
    await page.getByLabel("Cliente").selectOption({ label: "Pedro Cliente E2E" });
    await page.getByLabel("Categoria (receita)").selectOption({ label: "Venda de produtos" });
    await page.getByLabel("Data da venda").fill(todayIso());
    await page.getByLabel("Descrição").fill("Produto Cancelável E2E");
    await page.getByLabel("Quantidade").fill("1");
    await fillMoney(page.getByLabel("Preço unitário"), "1000");
    await page.getByRole("button", { name: "A prazo" }).click();
    await page.getByLabel("Nº de parcelas").fill("2");
    await page.getByRole("button", { name: "Dividir igualmente" }).click();
    await page.getByRole("button", { name: "Confirmar venda" }).click();
    await expect(page).toHaveURL(/\/vendas\/[^/]+$/);

    await page.getByRole("button", { name: "Cancelar venda" }).click();
    const cancelDialog = page.getByRole("alertdialog");
    await cancelDialog.getByRole("button", { name: "Cancelar venda" }).click();
    await expect(cancelDialog).toHaveCount(0);

    await expect(page.getByText("Cancelada", { exact: true })).toBeVisible();

    expect(consoleErrors, `Erros de console encontrados: ${consoleErrors.join("; ")}`).toEqual([]);
  });
});

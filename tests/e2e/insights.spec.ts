import { test, expect, type Page } from "@playwright/test";
import { fillMoney } from "./helpers/money";

const PASSWORD = "SenhaValida123";

function uniqueEmail(prefix = "insights") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

function formatDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayIso() {
  return formatDateInput(new Date());
}

// Dia 1 do mês anterior - sempre cai dentro do range recortado que os
// Insights usam para comparar (previousClipped começa no dia 1 do mês
// anterior e vai até o mesmo dia-do-mês de hoje), então funciona
// independente de em que dia do mês o teste rodar.
function firstOfPreviousMonthIso() {
  const now = new Date();
  return formatDateInput(new Date(now.getFullYear(), now.getMonth() - 1, 1));
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

async function createAndSettleReceivable(page: Page, description: string, amount: string, dueDateIso: string) {
  await page.goto("/financeiro/receber");
  await page.getByRole("button", { name: "+ Nova conta a receber" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Descrição").fill(description);
  await dialog.getByLabel("Categoria").selectOption({ label: "Venda de produtos" });
  await fillMoney(dialog.getByLabel("Valor"), amount);
  await dialog.getByLabel("Data de vencimento").fill(dueDateIso);
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(dialog).toHaveCount(0);

  const row = page.getByRole("row", { name: new RegExp(description) });
  await row.getByRole("button", { name: "Marcar como recebido" }).click();
  const settleDialog = page.getByRole("alertdialog");
  await settleDialog.locator("#settleDate").fill(dueDateIso);
  await settleDialog.getByRole("button", { name: "Confirmar" }).click();
  await expect(settleDialog).toHaveCount(0);
  await expect(row.getByText("Recebido", { exact: true })).toBeVisible();
}

test.describe("Etapa 7 - insights", () => {
  test("dois meses de dados geram um insight de faturamento, o link de ação navega e o botão de regenerar não altera os números", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const email = uniqueEmail();
    await register(page, "Dono Insights", email);
    await completeOnboarding(page, "Empresa Insights E2E");

    // Mês anterior: R$1.000. Mês atual: R$1.500 (+50%, bem acima do limiar
    // de relevância de 10%) - garante que REVENUE_GROWTH dispare
    // independente de qualquer outro dado pré-existente.
    await createAndSettleReceivable(page, "Recebimento mês anterior E2E", "1000", firstOfPreviousMonthIso());
    await createAndSettleReceivable(page, "Recebimento mês atual E2E", "1500", todayIso());

    await page.goto("/insights");
    await expect(page.getByRole("heading", { name: "Insights", exact: true })).toBeVisible();

    const revenueCard = page.getByText(/Faturamento em (crescimento|queda)/);
    await expect(revenueCard).toBeVisible();

    // Link de ação aponta para uma tela já existente (nunca uma página
    // duplicada de detalhe).
    await page.getByRole("link", { name: "Ver financeiro" }).click();
    await expect(page).toHaveURL(/\/financeiro$/);

    await page.goto("/insights");
    const descriptionBefore = await page.locator("text=/O faturamento de/").first().textContent();

    await page.getByRole("button", { name: "Atualizar insights" }).click();
    await expect(page.getByRole("button", { name: "Atualizar insights" })).toBeEnabled();

    // Sem provedor de IA real configurado neste ambiente (AI_PROVIDER não
    // definido = NullProvider) - regenerar nunca muda os números exibidos,
    // só re-tenta a narrativa (que continua caindo no template).
    const descriptionAfter = await page.locator("text=/O faturamento de/").first().textContent();
    expect(descriptionAfter).toBe(descriptionBefore);

    expect(consoleErrors, `Erros de console encontrados: ${consoleErrors.join("; ")}`).toEqual([]);
  });

  test("estado vazio: empresa sem histórico do mês anterior mostra a mensagem de dados insuficientes", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const email = uniqueEmail("vazio");
    await register(page, "Dono Insights Vazio", email);
    await completeOnboarding(page, "Empresa Insights Vazio E2E");

    await page.goto("/insights");
    await expect(page.getByText("Ainda não há dados suficientes para gerar insights.")).toBeVisible();

    expect(consoleErrors, `Erros de console encontrados: ${consoleErrors.join("; ")}`).toEqual([]);
  });
});

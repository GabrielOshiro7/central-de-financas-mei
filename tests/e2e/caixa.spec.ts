import { test, expect, type Page } from "@playwright/test";
import { gotoHydrated } from "./helpers/hydration";
import { fillMoney } from "./helpers/money";

const PASSWORD = "SenhaValida123";

function uniqueEmail(prefix = "caixa") {
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

test.describe("Etapa 5.1 - aba Caixa", () => {
  test("estado vazio, aviso permanente de divergência, e cálculo após configurar saldo inicial", async ({
    page,
  }) => {
    const email = uniqueEmail();
    await register(page, "Dono Caixa", email);
    await completeOnboarding(page, "Empresa Caixa E2E");

    // Estado vazio: nenhum lancamento, nenhum saldo inicial configurado.
    await page.getByRole("link", { name: "Caixa", exact: true }).click();
    await expect(page).toHaveURL(/\/caixa/);
    await expect(page.getByRole("heading", { name: "Seu caixa ainda não tem dados suficientes" })).toBeVisible();

    // Registra dois lancamentos manuais (Etapa 3, ja testado - so preparando dado pro Caixa).
    await gotoHydrated(page, "/financeiro/receitas");
    async function addRevenue(date: string, description: string, amount: string) {
      await page.getByRole("button", { name: "+ Novo lançamento" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Data").fill(date);
      await dialog.getByLabel("Descrição").fill(description);
      await dialog.getByLabel("Categoria").selectOption({ label: "Venda de produtos" });
      await fillMoney(dialog.getByLabel("Valor"), amount);
      await dialog.getByRole("button", { name: "Salvar" }).click();
      await expect(dialog).toHaveCount(0);
    }
    await addRevenue("2026-01-05", "Venda antiga E2E", "1000");
    await addRevenue("2026-01-20", "Venda recente E2E", "500");

    // Sem saldo inicial configurado: banner de "nao configurado" + calculo
    // implicito (primeiro lancamento = base, excluido; so o segundo conta).
    await page.getByRole("link", { name: "Caixa", exact: true }).click();
    await expect(page.getByText("Saldo inicial não configurado")).toBeVisible();
    await expect(page.getByText("R$500.00", { exact: false })).toBeVisible();

    // Aviso permanente - requisito mais importante da etapa: SEMPRE visivel,
    // nao atras de um icone/tooltip.
    await expect(
      page.getByText("Saldo baseado nos lançamentos registrados no sistema — pode divergir do extrato bancário real.")
    ).toBeVisible();

    // Distincao clara do Saldo previsto (Contas a Pagar/Receber).
    await expect(page.getByText("Previsão de contas a pagar e a receber")).toBeVisible();

    // Configura o saldo inicial a partir do atalho da propria aba Caixa.
    await page.getByRole("link", { name: "Configurar saldo inicial" }).click();
    await expect(page).toHaveURL(/\/configuracoes/);
    await fillMoney(page.getByLabel("Saldo inicial", { exact: true }), "2000");
    await page.getByLabel("Data do saldo inicial").fill("2026-01-01");
    await page.getByRole("button", { name: "Salvar saldo inicial" }).click();
    await expect(page.getByText("Saldo inicial atualizado com sucesso.")).toBeVisible();

    // Volta pro Caixa: agora com saldo inicial configurado, os DOIS
    // lancamentos contam (ambos posteriores a 01/jan) -> 2000+1000+500=3500.
    await page.getByRole("link", { name: "Caixa", exact: true }).click();
    await expect(page.getByText("Saldo inicial não configurado")).toHaveCount(0);
    await expect(page.getByText("R$3,500.00", { exact: false })).toBeVisible();
  });
});

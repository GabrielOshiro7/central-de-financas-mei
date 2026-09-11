import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "SenhaValida123";

function uniqueEmail(prefix = "onb") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

async function register(page: Page, name: string, email: string) {
  await page.goto("/register");
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
}

type OnboardingAnswers = {
  businessType?: string;
  revenueLabel?: string;
  name: string;
  years?: string;
  employeeCount?: string;
  currency?: string;
  revenue?: string;
};

async function answerStep1(page: Page, businessType: string) {
  await page.getByRole("button", { name: businessType, exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
}

async function answerStep2(page: Page, revenueLabel: string) {
  await page.getByRole("button", { name: revenueLabel, exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
}

async function completeOnboarding(page: Page, opts: OnboardingAnswers) {
  const businessType = opts.businessType ?? "Loja";
  const revenueLabel = opts.revenueLabel ?? "Venda de produtos";
  const years = opts.years ?? "1 a 3 anos";
  const employeeCount = opts.employeeCount ?? "5";
  const currency = opts.currency ?? "BRL";
  const revenue = opts.revenue ?? "10000";

  await answerStep1(page, businessType);
  await answerStep2(page, revenueLabel);

  await page.getByLabel("Nome da empresa").fill(opts.name);
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByRole("button", { name: years, exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByLabel("Número de pessoas").fill(employeeCount);
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByRole("button", { name: new RegExp(currency) }).click();
  await page.getByLabel("Valor médio mensal").fill(revenue);
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByRole("heading", { name: "Tudo pronto!" })).toBeVisible();
  await page.getByRole("button", { name: "Ir para o dashboard" }).click();
}

test.describe("onboarding", () => {
  // Cenario 1 e 4 (parte 1): onboarding completo leva ao dashboard, com
  // estado vazio (nenhum lancamento financeiro cadastrado ainda).
  test("onboarding completo leva ao dashboard em estado vazio", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, "Dono Loja", email);
    await expect(page).toHaveURL(/\/onboarding/);

    await completeOnboarding(page, { name: "Empresa Onboarding Completo", revenue: "15000" });

    await expect(page).toHaveURL(/\/dashboard/);
    // Etapa 4: o dashboard gerencial passou a ter "Visão Geral" como titulo
    // (nao mais uma saudacao pessoal "Ola, <nome>") e, para uma empresa que
    // nunca lancou nada, mostra o estado vazio real (secao 27) em vez de uma
    // grade de cards individuais com "Sem dados".
    await expect(page.getByRole("heading", { name: "Visão Geral" })).toBeVisible();
    await expect(page.getByRole("main").getByText("Empresa Onboarding Completo")).toBeVisible();

    // Cenario 7: sem lancamentos financeiros, mostra o estado vazio real -
    // nunca um numero calculado ou o average_monthly_revenue do onboarding.
    await expect(
      page.getByRole("heading", { name: "Seu dashboard ainda não possui dados suficientes" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Importar dados" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Adicionar lançamento" })).toBeVisible();
    await expect(page.getByText("15,000")).toHaveCount(0);
    await expect(page.getByText("R$15,000")).toHaveCount(0);
  });

  // Cenario 3: fechar o navegador no meio do onboarding e voltar -> retoma
  // de onde parou (nao recomeca do zero).
  test("retoma o onboarding de onde parou apos reabrir em nova aba", async ({ page, context }) => {
    const email = uniqueEmail();
    await register(page, "Usuario Retomada", email);
    await expect(page).toHaveURL(/\/onboarding/);

    await answerStep1(page, "Restaurante");
    await expect(page.getByRole("heading", { name: "Como sua empresa ganha dinheiro?" })).toBeVisible();

    await answerStep2(page, "Delivery");
    await expect(page.getByRole("heading", { name: "Qual é o nome da sua empresa?" })).toBeVisible();

    // simula fechar e reabrir o navegador: nova aba, mesmo contexto (mesmo cookie de sessao)
    const newPage = await context.newPage();
    await newPage.goto("/onboarding");

    // deve continuar no passo 3 (nome), nao voltar para o passo 1
    await expect(newPage.getByRole("heading", { name: "Qual é o nome da sua empresa?" })).toBeVisible();
    await expect(newPage.getByText("Pergunta 3 de 6")).toBeVisible();
  });

  // Cenario 4 (completo): conclui o onboarding, sai, entra de novo -> vai
  // direto para o dashboard, nao repete o onboarding.
  test("apos concluir o onboarding, login seguinte vai direto ao dashboard", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, "Usuario Retorno", email);
    await completeOnboarding(page, { name: "Empresa Retorno" });
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });

  // Cenario 5: usuario altera dados da empresa -> refletido no banco.
  // Etapa 5.1: "Minha empresa" saiu do menu principal - o formulario agora
  // mora na secao "Empresa" dentro de Configuracoes.
  test("editar dados da empresa em Configurações reflete a mudanca", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, "Usuario Edicao", email);
    await completeOnboarding(page, { name: "Nome Original Ltda" });

    await page.getByRole("link", { name: "Configurações" }).click();
    await expect(page).toHaveURL(/\/configuracoes/);
    await expect(page.getByRole("heading", { name: "Empresa" })).toBeVisible();

    const nameInput = page.getByLabel("Nome da empresa");
    await expect(nameInput).toHaveValue("Nome Original Ltda");

    await nameInput.fill("Nome Atualizado Ltda");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Dados atualizados com sucesso.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Nome da empresa")).toHaveValue("Nome Atualizado Ltda");
  });

  // Cenario 6: usuario A nao consegue acessar/alterar dados da empresa do
  // usuario B, mesmo chamando a API diretamente.
  test("isolamento entre usuarios: B nao consegue alterar nem enxergar dados de A", async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const emailA = uniqueEmail("isoA");
    const emailB = uniqueEmail("isoB");

    await register(pageA, "Usuario A", emailA);
    await completeOnboarding(pageA, { name: "Empresa A Isolada" });

    await register(pageB, "Usuario B", emailB);
    await completeOnboarding(pageB, { name: "Empresa B Isolada" });

    // B tenta, via chamada direta a API (nao pela UI), alterar dados -
    // so pode afetar a propria empresa, pois a rota resolve o registro por
    // where: { userId: <sessao de B> }, nunca por um id vindo do body.
    const response = await pageB.request.patch("/api/business", {
      data: {
        name: "Empresa Hackeada",
        yearsInBusiness: "MENOS_DE_1_ANO",
        employeeCount: 1,
        currency: "BRL",
        averageMonthlyRevenue: 1,
      },
    });
    expect(response.ok()).toBe(true);

    await pageA.reload();
    await expect(pageA.getByRole("main").getByText("Empresa A Isolada")).toBeVisible();
    await expect(pageA.getByText("Empresa Hackeada")).toHaveCount(0);

    // A rota antiga /empresa continua funcionando como redirect (Etapa 5.1) -
    // aproveitado aqui pra tambem confirmar isso, alem do isolamento.
    await pageB.goto("/empresa");
    await expect(pageB).toHaveURL(/\/configuracoes/);
    await expect(pageB.getByLabel("Nome da empresa")).toHaveValue("Empresa Hackeada");

    await contextA.close();
    await contextB.close();
  });

  // Cenario 11: JPY nao tem casas decimais, de ponta a ponta pela UI.
  test("faturamento em JPY e salvo e exibido sem casas decimais", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, "Usuario Iene", email);
    await completeOnboarding(page, {
      name: "Empresa Japao",
      currency: "JPY",
      revenue: "500000",
    });

    await page.getByRole("link", { name: "Configurações" }).click();
    await expect(page.getByText(/¥500,000\b/)).toBeVisible();
    await expect(page.getByText(/¥500,000\.00/)).toHaveCount(0);
  });

  // Etapa 5.1: rota antiga de "Minha empresa" removida do menu, mas mantida
  // como redirect para nao quebrar favoritos/historico de navegacao.
  test("rota antiga /empresa redireciona para Configurações", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, "Usuario Redirect", email);
    await completeOnboarding(page, { name: "Empresa Redirect" });

    await expect(page.getByRole("link", { name: "Minha empresa" })).toHaveCount(0);

    await page.goto("/empresa");
    await expect(page).toHaveURL(/\/configuracoes/);
    await expect(page.getByRole("heading", { name: "Empresa" })).toBeVisible();
    await expect(page.getByLabel("Nome da empresa")).toHaveValue("Empresa Redirect");
  });

  // Etapa 5.1: novo item de menu "Caixa", entre Financeiro e Assistente.
  test("item 'Caixa' aparece no menu principal e navega corretamente", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, "Usuario Caixa", email);
    await completeOnboarding(page, { name: "Empresa Caixa Nav" });

    await expect(page.getByRole("link", { name: "Caixa", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Caixa", exact: true }).click();
    await expect(page).toHaveURL(/\/caixa/);
    await expect(page.getByRole("heading", { name: "Caixa", exact: true })).toBeVisible();
  });
});

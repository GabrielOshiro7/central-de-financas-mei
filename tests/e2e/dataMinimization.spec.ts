import { test, expect, type Page } from "@playwright/test";
import { gotoHydrated } from "./helpers/hydration";
import { fillMoney } from "./helpers/money";
import { createOnboardedUser, newTestPrisma } from "./helpers/session";
import { assertTestDatabase, loadTestEnv } from "../testEnv";
import { SENSITIVE_DATA_NOTICE } from "../../src/lib/privacy/sensitiveDataNotice";

// Minimizacao de dados na interface: perguntas so de perfil podem ser puladas, campos nao necessarios
// estao marcados "(opcional)", campos de identificador / dado financeiro sensivel explicam a
// finalidade, e todo campo livre de observacao tem o mesmo aviso padrao.
loadTestEnv();
assertTestDatabase();
const prisma = newTestPrisma();
const PASSWORD = "SenhaValida123";
const createdUserIds: string[] = [];

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

async function loggedIn(page: Page, baseURL: string, label: string) {
  const user = await createOnboardedUser(prisma, label);
  createdUserIds.push(user.userId);
  await user.signIn(page.context(), baseURL);
  return user;
}

test.describe("onboarding: perguntas só de perfil são opcionais", () => {
  test("dá para pular tipo, modelo de receita, tempo de existência e número de pessoas; nome e moeda seguem obrigatórios", async ({ page }) => {
    test.setTimeout(120_000);
    const email = `minimiza-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
    await gotoHydrated(page, "/register");
    await expect(page.getByText("Usado para entrar na sua conta e recuperar a senha.")).toBeVisible(); // finalidade do e-mail
    await page.getByLabel("Nome").fill("Minimiza E2E");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirmar senha").fill(PASSWORD);
    await page.getByLabel(/Li e aceito/).check();
    await page.getByRole("button", { name: "Criar conta" }).click();

    // 1: tipo do negócio - pergunta opcional, com "Pular"
    await expect(page.getByRole("heading", { name: "Qual é o tipo do seu negócio?" })).toBeVisible();
    await expect(page.getByText(/Pergunta opcional/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled(); // sem escolher, só dá para pular
    await page.getByRole("button", { name: "Pular" }).click();

    // 2: modelo de receita - sem o tipo não há opções
    await expect(page.getByRole("heading", { name: "Como sua empresa ganha dinheiro?" })).toBeVisible();
    await expect(page.getByText(/Você pulou o tipo do negócio/)).toBeVisible();
    await page.getByRole("button", { name: "Pular" }).click();

    // 3: nome - obrigatório, SEM "Pular"
    await expect(page.getByRole("heading", { name: "Qual é o nome da sua empresa?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pular" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await page.getByLabel("Nome da empresa").fill("Empresa Mínima E2E");
    await page.getByRole("button", { name: "Continuar" }).click();

    // 4 e 5: opcionais
    await expect(page.getByRole("heading", { name: "Há quanto tempo sua empresa existe?" })).toBeVisible();
    await page.getByRole("button", { name: "Pular" }).click();
    await expect(page.getByRole("heading", { name: "Quantas pessoas trabalham na empresa?" })).toBeVisible();
    await page.getByRole("button", { name: "Pular" }).click();

    // 6: moeda obrigatória; o valor médio é opcional
    await expect(page.getByRole("heading", { name: "Qual é o faturamento médio mensal?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pular" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled(); // sem moeda
    await expect(page.getByLabel("Valor médio mensal (opcional)")).toBeVisible();
    await expect(page.getByText("Só informativo: não entra nos cálculos do painel. A moeda é obrigatória.")).toBeVisible();
    await page.getByRole("button", { name: /BRL/ }).click();
    await expect(page.getByRole("button", { name: "Continuar" })).toBeEnabled(); // valor em branco é aceito
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page.getByRole("heading", { name: "Tudo pronto!" })).toBeVisible();
    await page.getByRole("button", { name: "Ir para o dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { business: true } });
    createdUserIds.push(user.id);
    expect(user.business?.onboardingCompleted).toBe(true);
    expect([user.business?.businessType, user.business?.yearsInBusiness, user.business?.employeeCount, user.business?.averageMonthlyRevenue]).toEqual([null, null, null, null]);
    expect(user.business?.name).toBe("Empresa Mínima E2E");
  });

  test("informar o faturamento médio continua funcionando", async ({ page }) => {
    test.setTimeout(120_000);
    const email = `minimiza2-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
    await gotoHydrated(page, "/register");
    await page.getByLabel("Nome").fill("Minimiza 2");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirmar senha").fill(PASSWORD);
    await page.getByLabel(/Li e aceito/).check();
    await page.getByRole("button", { name: "Criar conta" }).click();
    await page.getByRole("button", { name: "Pular" }).click();
    await page.getByRole("button", { name: "Pular" }).click();
    await page.getByLabel("Nome da empresa").fill("Empresa Com Valor");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Pular" }).click();
    await page.getByRole("button", { name: "Pular" }).click();
    await page.getByRole("button", { name: /BRL/ }).click();
    await fillMoney(page.getByLabel("Valor médio mensal (opcional)"), "2500");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByRole("heading", { name: "Tudo pronto!" })).toBeVisible();
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { business: true } });
    createdUserIds.push(user.id);
    expect(Number(user.business?.averageMonthlyRevenue)).toBe(2500);
  });
});

test.describe("Configurações: dados da empresa opcionais", () => {
  test("os três campos de perfil estão marcados (opcional) e podem ficar em branco", async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const user = await loggedIn(page, baseURL!, "min-config");
    await prisma.business.update({ where: { userId: user.userId }, data: { employeeCount: 4, yearsInBusiness: "DE_1_A_3_ANOS", averageMonthlyRevenue: 5000 } });
    await gotoHydrated(page, "/configuracoes");

    await expect(page.getByText("Há quanto tempo sua empresa existe? (opcional)")).toBeVisible();
    await expect(page.getByLabel("Número de pessoas (opcional)")).toBeVisible();
    await expect(page.getByLabel("Faturamento médio mensal (opcional)")).toBeVisible();
    await expect(page.getByText("Esse valor é só informação de perfil — não entra nos cálculos do dashboard.")).toBeVisible();
    await expect(page.getByLabel("Saldo inicial", { exact: true })).toBeVisible();
    await expect(page.getByText("Usado só para calcular a posição do seu caixa.")).toBeVisible();
    await expect(page.getByText("Usado para entrar na sua conta e recuperar a senha.")).toBeVisible();

    // Esvazia os três e salva.
    await page.getByLabel("Número de pessoas (opcional)").fill("");
    await page.getByRole("button", { name: "Prefiro não informar" }).click();
    await page.getByLabel("Faturamento médio mensal (opcional)").fill("");
    await page.getByRole("button", { name: "Salvar alterações" }).first().click();
    await expect(page.getByText("Dados atualizados com sucesso.")).toBeVisible();
    const business = await prisma.business.findUniqueOrThrow({ where: { userId: user.userId } });
    expect([business.employeeCount, business.yearsInBusiness, business.averageMonthlyRevenue]).toEqual([null, null, null]);
    expect(business.name).toBe("Empresa min-config"); // nome continua
  });
});

test.describe("finalidade dos campos e aviso padrão das observações", () => {
  test("cliente: documento, contatos e endereço explicam a finalidade; observações têm o aviso", async ({ page, baseURL }) => {
    await loggedIn(page, baseURL!, "min-cliente");
    await gotoHydrated(page, "/clientes");
    await page.getByRole("button", { name: "Novo cliente", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Usado apenas para você identificar e buscar o cliente nas suas vendas.")).toBeVisible();
    await expect(dialog.getByText("Só para você contatar o cliente; o sistema não envia mensagens.")).toBeVisible();
    await expect(dialog.getByText("Só para você contatar o cliente; o sistema não envia e-mails a ele.")).toBeVisible();
    await expect(dialog.getByText("Guardado só como registro do cliente.")).toBeVisible();
    await expect(dialog.getByText(SENSITIVE_DATA_NOTICE)).toBeVisible();
    // Tudo o que não é o nome está marcado como opcional.
    for (const label of ["Documento (CPF/CNPJ/outro, opcional)", "Telefone (opcional)", "WhatsApp (opcional)", "E-mail (opcional)", "Endereço (opcional)", "Observações (opcional)"]) {
      await expect(dialog.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("conta a pagar: conta bancária pede só um apelido; observação tem o aviso", async ({ page, baseURL }) => {
    await loggedIn(page, baseURL!, "min-conta");
    await gotoHydrated(page, "/financeiro/pagar");
    await page.getByRole("button", { name: "Nova conta a pagar", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Use só um apelido (ex.: Caixa, Conta principal). Não digite o número da conta.")).toBeVisible();
    await expect(dialog.getByText("Número da nota ou do boleto, só para você localizar a conta.")).toBeVisible();
    await expect(dialog.getByText(SENSITIVE_DATA_NOTICE)).toBeVisible();
    for (const label of ["Conta bancária/caixa (opcional)", "Centro de custo (opcional)", "Número/documento (opcional)", "Observação (opcional)"]) {
      await expect(dialog.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("lançamento (receita): observação tem o aviso padrão", async ({ page, baseURL }) => {
    await loggedIn(page, baseURL!, "min-lanc");
    await gotoHydrated(page, "/financeiro/receitas");
    await page.getByRole("button", { name: "Nova receita" }).first().click();
    await expect(page.getByRole("dialog").getByText(SENSITIVE_DATA_NOTICE)).toBeVisible();
  });

  test("venda e agendamento: observações têm o MESMO aviso padrão", async ({ page, baseURL }) => {
    const user = await loggedIn(page, baseURL!, "min-venda");
    // A venda exige ao menos um cliente cadastrado para mostrar o formulario.
    const business = await prisma.business.findUniqueOrThrow({ where: { userId: user.userId } });
    await prisma.client.create({ data: { businessId: business.id, name: "Cliente Minimiza" } });
    await gotoHydrated(page, "/vendas/nova");
    await expect(page.getByText(SENSITIVE_DATA_NOTICE)).toBeVisible();
    await expect(page.getByText("Observações (opcional)")).toBeVisible();
    await gotoHydrated(page, "/agenda/novo");
    await expect(page.getByText(SENSITIVE_DATA_NOTICE)).toBeVisible();
    await expect(page.getByText(/Não registre informações de saúde ou dados sensíveis do cliente/)).toHaveCount(0); // texto antigo saiu
  });

  test("importação: a coluna observação é opcional e leva o aviso padrão", async ({ page, baseURL }) => {
    await loggedIn(page, baseURL!, "min-import");
    await gotoHydrated(page, "/financeiro/importar");
    await expect(page.getByText("A coluna observacao é opcional.")).toBeVisible();
    await expect(page.getByText(SENSITIVE_DATA_NOTICE)).toBeVisible();
  });
});

import { test, expect, type Page } from "@playwright/test";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { gotoHydrated } from "./helpers/hydration";
import { fillMoney } from "./helpers/money";
import { assertTestDatabase, loadTestEnv } from "../testEnv";

// Tecla Enter nos formularios: avanca para o proximo campo e NUNCA envia a
// partir de um campo; o envio e do botao final. Ver src/lib/forms/enterNavigation.ts.
loadTestEnv();
assertTestDatabase();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const { Decimal } = Prisma;

const PASSWORD = "SenhaValida123";

function uniqueEmail(prefix = "enter") {
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
  await page.getByLabel("Número de pessoas").fill("2");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /BRL/ }).click();
  await fillMoney(page.getByLabel("Valor médio mensal"), "5000");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Ir para o dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function setupBusiness(page: Page, prefix: string) {
  const email = uniqueEmail(prefix);
  await register(page, "Dono Enter E2E", email);
  await completeOnboarding(page, "Empresa Enter E2E");
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { business: true } });
  return { email, businessId: user.business!.id };
}

test.describe("Enter nos formulários", () => {
  test("a) Login: Enter no e-mail vai à senha, Enter na senha vai ao botão (sem enviar), Enter no botão entra", async ({ page, context }) => {
    test.setTimeout(90_000);
    const { email } = await setupBusiness(page, "enter-login");
    await context.clearCookies();

    await gotoHydrated(page, "/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("E-mail").press("Enter");
    await expect(page.getByLabel("Senha")).toBeFocused();
    await expect(page.locator('p[role="alert"]')).toHaveCount(0); // nada foi enviado
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("Senha").fill(PASSWORD);
    await page.getByLabel("Senha").press("Enter"); // pula "Lembrar de mim"
    await expect(page.getByRole("button", { name: "Entrar" })).toBeFocused();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/login/); // ainda nao enviou

    await page.keyboard.press("Enter"); // Enter no botão = envio nativo
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("b) Cadastro: Enter percorre os campos até o botão sem enviar", async ({ page }) => {
    await gotoHydrated(page, "/register");
    await page.getByLabel("Nome").fill("Fulano Enter");
    await page.getByLabel("Nome").press("Enter");
    await expect(page.getByLabel("E-mail")).toBeFocused();
    await page.getByLabel("E-mail").fill(uniqueEmail("enter-register"));
    await page.getByLabel("E-mail").press("Enter");
    await expect(page.getByLabel("Senha", { exact: true })).toBeFocused();
    await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Senha", { exact: true }).press("Enter");
    await expect(page.getByLabel("Confirmar senha")).toBeFocused();
    await page.getByLabel("Confirmar senha").fill(PASSWORD);
    await page.getByLabel("Confirmar senha").press("Enter");
    await expect(page.getByRole("button", { name: "Criar conta" })).toBeFocused();

    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/register/); // nenhum Enter enviou o formulario
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test("c) Novo agendamento: Enter na busca seleciona o cliente e vai a Serviços; só o botão Agendar envia", async ({ page }) => {
    test.setTimeout(90_000);
    const { businessId } = await setupBusiness(page, "enter-agenda");
    await prisma.client.create({ data: { businessId, name: "Maria Enter E2E" } });
    await prisma.client.create({ data: { businessId, name: "Joana Enter E2E" } });
    await prisma.product.create({ data: { businessId, name: "Corte Enter E2E", type: "SERVICO", defaultPrice: new Decimal(80) } });

    await gotoHydrated(page, "/agenda/novo");
    const search = page.getByRole("combobox", { name: "Buscar cliente" });
    await search.fill("mar");
    await expect(search).toHaveAttribute("aria-expanded", "true");
    const listbox = page.getByRole("listbox");
    await expect(listbox.getByRole("option")).toHaveCount(1); // so a Maria
    await expect(listbox.getByRole("option", { name: "Maria Enter E2E" })).toHaveAttribute("aria-selected", "true");

    await search.press("Enter");
    await expect(page.getByText("Maria Enter E2E")).toBeVisible();
    await expect(page.getByRole("button", { name: "Trocar" })).toBeVisible();
    await expect(page.getByLabel("Adicionar serviço")).toBeFocused(); // foco em Serviços
    await expect(page).toHaveURL(/\/agenda\/novo/);
    expect(await prisma.appointment.count({ where: { businessId } })).toBe(0);

    // Enter em campos do formulario so navega.
    await page.getByLabel("Adicionar serviço").selectOption({ label: "Corte Enter E2E" });
    await page.getByLabel("Data do atendimento").focus();
    await page.getByLabel("Data do atendimento").press("Enter");
    await expect(page.getByLabel("Categoria de receita")).toBeFocused();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/agenda\/novo/);
    expect(await prisma.appointment.count({ where: { businessId } })).toBe(0);

    // O envio e so do botao Agendar.
    await page.getByRole("button", { name: "Agendar" }).click();
    await expect(page).toHaveURL(/\/agenda\?view=day/);
    expect(await prisma.appointment.count({ where: { businessId } })).toBe(1);
  });

  test("c2) Busca de cliente: setas mudam o destaque, Esc fecha a lista, sem resultado o Enter não faz nada", async ({ page }) => {
    test.setTimeout(90_000);
    const { businessId } = await setupBusiness(page, "enter-combo");
    await prisma.client.createMany({
      data: [
        { businessId, name: "Ana Souza Enter" },
        { businessId, name: "Ana Paula Enter" },
      ],
    });

    await gotoHydrated(page, "/agenda/novo");
    const search = page.getByRole("combobox", { name: "Buscar cliente" });
    await search.fill("ana");
    const options = page.getByRole("listbox").getByRole("option");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await search.press("ArrowDown");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(search).toHaveAttribute("aria-activedescendant", (await options.nth(1).getAttribute("id"))!);

    await search.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(search).toHaveAttribute("aria-expanded", "false");

    await search.fill("zzz");
    await search.press("Enter");
    await expect(search).toBeFocused(); // sem resultado: nada acontece
    await expect(page.getByRole("button", { name: "Trocar" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/agenda\/novo/);
  });

  test("d) Criar novo cliente (pop-up): Enter só navega nele; salvar cria o cliente e NÃO envia o agendamento; o mini-formulário de serviço confirma com Enter", async ({ page }) => {
    test.setTimeout(90_000);
    const { businessId } = await setupBusiness(page, "enter-mini");
    await prisma.product.create({ data: { businessId, name: "Corte Mini E2E", type: "SERVICO", defaultPrice: new Decimal(50) } });

    await gotoHydrated(page, "/agenda/novo");
    await page.getByRole("button", { name: "+ Criar novo cliente" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Nome", { exact: true })).toBeFocused(); // pop-up abre com o foco no Nome
    await dialog.getByLabel("Nome", { exact: true }).fill("Cliente Mini E2E");
    await dialog.getByLabel("Nome", { exact: true }).press("Enter");
    await expect(dialog.getByLabel("Nome fantasia (opcional)")).toBeFocused(); // Enter so navega
    expect(await prisma.client.count({ where: { businessId, name: "Cliente Mini E2E" } })).toBe(0);
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect(dialog).toHaveCount(0);

    await expect(page.getByText("Cliente Mini E2E")).toBeVisible();
    await expect(page.getByRole("button", { name: "Trocar" })).toBeVisible();
    await expect(page.getByLabel("Adicionar serviço")).toBeFocused();
    expect(await prisma.client.count({ where: { businessId, name: "Cliente Mini E2E" } })).toBe(1);
    expect(await prisma.appointment.count({ where: { businessId } })).toBe(0);
    await expect(page).toHaveURL(/\/agenda\/novo/);

    // Mini-formulario de servico: Enter no nome vai ao preco; Enter no preco cria o servico.
    await page.getByRole("button", { name: "Criar novo serviço" }).click();
    await page.getByLabel("Nome do serviço").fill("Escova Mini E2E");
    await page.getByLabel("Nome do serviço").press("Enter");
    await expect(page.getByLabel("Preço (opcional)")).toBeFocused();
    await fillMoney(page.getByLabel("Preço (opcional)"), "30");
    await page.getByLabel("Preço (opcional)").press("Enter");
    await expect(page.getByLabel("Valor unitário")).toBeVisible();
    expect(await prisma.product.count({ where: { businessId, name: "Escova Mini E2E" } })).toBe(1);
    expect(await prisma.appointment.count({ where: { businessId } })).toBe(0);
    await expect(page).toHaveURL(/\/agenda\/novo/);
  });

  test("e) Modal Nova receita: Enter avança e não salva; Observação aceita quebra de linha", async ({ page }) => {
    test.setTimeout(90_000);
    const { businessId } = await setupBusiness(page, "enter-modal");

    await gotoHydrated(page, "/financeiro/receitas");
    await page.getByRole("button", { name: "Nova receita" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Data").focus();
    await dialog.getByLabel("Data").press("Enter");
    await expect(dialog.getByLabel("Descrição")).toBeFocused();
    await dialog.getByLabel("Descrição").fill("Receita via Enter");
    await dialog.getByLabel("Descrição").press("Enter");
    await expect(dialog.getByLabel("Categoria")).toBeFocused();
    await dialog.getByLabel("Categoria").press("Enter");
    await expect(dialog.getByLabel("Valor")).toBeFocused();
    await fillMoney(dialog.getByLabel("Valor"), "120");
    await dialog.getByLabel("Valor").press("Enter"); // pula "Recorrente"
    const notes = dialog.getByLabel("Observação (opcional)");
    await expect(notes).toBeFocused();

    await notes.pressSequentially("linha 1");
    await notes.press("Enter");
    await notes.pressSequentially("linha 2");
    await expect(notes).toHaveValue("linha 1\nlinha 2");

    await page.waitForTimeout(500);
    await expect(dialog).toBeVisible(); // nada foi salvo
    expect(await prisma.financialEntry.count({ where: { businessId } })).toBe(0);
  });

  test("f) IME: Enter com isComposing (ou keyCode 229) não move o foco", async ({ page }) => {
    await gotoHydrated(page, "/login");
    await page.getByLabel("E-mail").focus();
    await page.evaluate(() => {
      const email = document.getElementById("email")!;
      email.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }));
      email.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true, cancelable: true }));
    });
    await expect(page.getByLabel("E-mail")).toBeFocused();

    // Fora da composicao, o mesmo Enter navega.
    await page.getByLabel("E-mail").press("Enter");
    await expect(page.getByLabel("Senha")).toBeFocused();
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

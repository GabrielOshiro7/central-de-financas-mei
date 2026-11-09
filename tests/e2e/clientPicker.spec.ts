import { test, expect, type Page } from "@playwright/test";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { gotoHydrated } from "./helpers/hydration";
import { fillMoney } from "./helpers/money";
import { assertTestDatabase, loadTestEnv } from "../testEnv";

// Escolha de cliente da Agenda: a lista so aparece com o campo em foco (3
// recentes; ao digitar, busca no servidor) e "Criar novo cliente" abre o MESMO
// pop-up de cadastro da pagina Clientes.
loadTestEnv();
assertTestDatabase();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const { Decimal } = Prisma;

const PASSWORD = "SenhaValida123";

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

async function setupBusiness(page: Page, prefix: string) {
  const email = uniqueEmail(prefix);
  await gotoHydrated(page, "/register");
  await page.getByLabel("Nome").fill("Dono Picker E2E");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByRole("button", { name: "Loja", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Venda de produtos", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Nome da empresa").fill("Empresa Picker E2E");
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
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { business: true } });
  return user.business!.id;
}

// Clientes com atendimentos registrados em momentos diferentes (createdAt): os
// recentes sao os 3 ultimos.
async function seedClients(businessId: string) {
  const make = (name: string, extra: { tradeName?: string } = {}) => prisma.client.create({ data: { businessId, name, ...extra } });
  const [antiga, jose, marcos, maria, marta, paulo] = await Promise.all([
    make("Antiga Souza"),
    make("José Álvares", { tradeName: "Oficina do Zé" }),
    make("Marcos Lima"),
    make("Maria Souza"),
    make("Marta Reis"),
    make("Paulo Nunes"),
  ]);
  const startAt = new Date("2026-06-01T10:00:00Z");
  const used: [{ id: string }, string][] = [
    [antiga, "2026-01-01T00:00:00Z"],
    [jose, "2026-02-01T00:00:00Z"],
    [marcos, "2026-03-01T00:00:00Z"],
    [maria, "2026-04-01T00:00:00Z"],
    [marta, "2026-05-01T00:00:00Z"],
  ];
  for (const [c, createdAt] of used) {
    await prisma.appointment.create({
      data: { businessId, clientId: c.id, startAt, endAt: new Date(startAt.getTime() + 30 * 60_000), createdAt: new Date(createdAt) },
    });
  }
  void paulo;
}

test.describe("Agenda - escolha de cliente", () => {
  test("lista só com foco: 3 recentes ao focar, busca no servidor ao digitar, teclado de combobox", async ({ page }) => {
    test.setTimeout(120_000);
    const businessId = await setupBusiness(page, "picker-lista");
    await seedClients(businessId);
    await prisma.product.create({ data: { businessId, name: "Corte Picker E2E", type: "SERVICO", defaultPrice: new Decimal(80) } });

    await gotoHydrated(page, "/agenda/novo");
    const search = page.getByRole("combobox", { name: "Buscar cliente" });
    const options = page.getByRole("listbox").getByRole("option");

    // Sem foco: nenhuma lista (nem a dos recentes).
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(page.getByText("Recentes")).toHaveCount(0);
    await expect(search).toHaveAttribute("aria-expanded", "false");

    // Foco com o campo vazio: "Recentes" = os 3 usados por ultimo (Marta, Maria, Marcos).
    await search.focus();
    await expect(page.getByText("Recentes")).toBeVisible();
    await expect(options).toHaveText(["Marta Reis", "Maria Souza", "Marcos Lima"]);
    await expect(search).toHaveAttribute("aria-expanded", "true");

    // Digitar: busca no servidor, filtrando a cada letra.
    await search.fill("ma");
    await expect(options).toHaveText(["Marcos Lima", "Maria Souza", "Marta Reis"]); // ordem de nome
    await expect(page.getByText("Recentes")).toHaveCount(0);
    await search.fill("mari");
    await expect(options).toHaveText(["Maria Souza"]);
    await expect(options.first()).toHaveAttribute("aria-selected", "true");

    // Sem acento e sem diferenciar maiusculas; tambem pelo nome fantasia.
    await search.fill("JOSE");
    await expect(options).toHaveText(["José Álvares (Oficina do Zé)"]);
    await search.fill("oficina");
    await expect(options).toHaveText(["José Álvares (Oficina do Zé)"]);

    // Setas mudam o destaque; Esc fecha a lista; seta abre de novo.
    await search.fill("mar");
    await expect(options).toHaveText(["Marcos Lima", "Maria Souza", "Marta Reis"]);
    await search.press("ArrowDown");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await search.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await search.press("ArrowDown");
    await expect(page.getByRole("listbox")).toBeVisible();

    // Perder o foco fecha a lista.
    await page.getByRole("heading", { name: "Novo agendamento" }).click();
    await expect(page.getByRole("listbox")).toHaveCount(0);

    // Enter seleciona o destacado, mostra o cliente com "Trocar" e foca Servicos, sem enviar.
    await search.fill("marta");
    await expect(options).toHaveText(["Marta Reis"]);
    await search.press("Enter");
    await expect(page.getByText("Marta Reis")).toBeVisible();
    await expect(page.getByRole("button", { name: "Trocar" })).toBeVisible();
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(page.getByLabel("Adicionar serviço")).toBeFocused();
    await expect(page).toHaveURL(/\/agenda\/novo/);
    expect(await prisma.appointment.count({ where: { businessId, kind: "DAY" } })).toBe(0);

    // Trocar volta a busca com o foco nela.
    await page.getByRole("button", { name: "Trocar" }).click();
    await expect(search).toBeFocused();
  });

  test("sem resultados: mensagem e Criar novo cliente abre o pop-up com o nome; salvar seleciona e foca Serviços, sem enviar o agendamento", async ({ page }) => {
    test.setTimeout(120_000);
    const businessId = await setupBusiness(page, "picker-criar");
    await seedClients(businessId);
    await prisma.product.create({ data: { businessId, name: "Corte Criar E2E", type: "SERVICO", defaultPrice: new Decimal(80) } });

    await gotoHydrated(page, "/agenda/novo");
    const search = page.getByRole("combobox", { name: "Buscar cliente" });
    await search.fill("Zélia Inexistente");
    await expect(page.getByText("Nenhum cliente encontrado")).toBeVisible();
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await search.press("Enter"); // sem resultados: nada acontece
    await expect(search).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Criar novo cliente" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Novo cliente" })).toBeVisible();
    // Pop-up completo da pagina Clientes, fora do <form> do agendamento.
    await expect(dialog.getByLabel("Telefone (opcional)")).toBeVisible();
    await expect(dialog.getByLabel("WhatsApp (opcional)")).toBeVisible();
    await expect(page.locator("form form")).toHaveCount(0);
    await expect(dialog.getByLabel("Nome", { exact: true })).toHaveValue("Zélia Inexistente"); // pre-preenchido

    await dialog.getByLabel("Telefone (opcional)").fill("11 98888-7777");
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect(dialog).toHaveCount(0);

    await expect(page.getByText("Zélia Inexistente")).toBeVisible();
    await expect(page.getByRole("button", { name: "Trocar" })).toBeVisible();
    await expect(page.getByLabel("Adicionar serviço")).toBeFocused();
    await expect(page).toHaveURL(/\/agenda\/novo/);
    const created = await prisma.client.findFirstOrThrow({ where: { businessId, name: "Zélia Inexistente" } });
    expect(created.phone).toBe("11 98888-7777");
    expect(await prisma.appointment.count({ where: { businessId, kind: "DAY" } })).toBe(0); // nada do agendamento foi enviado

    // O agendamento so sai pelo botao Agendar, com o cliente recem-criado.
    await page.getByLabel("Adicionar serviço").selectOption({ label: "Corte Criar E2E" });
    await page.getByRole("button", { name: "Agendar" }).click();
    await expect(page).toHaveURL(/\/agenda\?view=day/);
    const appointment = await prisma.appointment.findFirstOrThrow({ where: { businessId, kind: "DAY" } });
    expect(appointment.clientId).toBe(created.id);
  });

  test("cancelar o pop-up: volta o foco para a busca e nada é enviado", async ({ page }) => {
    test.setTimeout(90_000);
    const businessId = await setupBusiness(page, "picker-cancelar");
    await seedClients(businessId);
    const clientsBefore = await prisma.client.count({ where: { businessId } });

    await gotoHydrated(page, "/agenda/novo");
    await page.getByRole("button", { name: "+ Criar novo cliente" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome", { exact: true }).fill("Nao Deve Existir");
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Buscar cliente" })).toBeFocused();
    await expect(page.getByRole("button", { name: "Trocar" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/agenda\/novo/);
    expect(await prisma.client.count({ where: { businessId } })).toBe(clientsBefore);
    expect(await prisma.appointment.count({ where: { businessId, kind: "DAY" } })).toBe(0);
  });

  test("página Clientes: Novo cliente continua funcionando igual", async ({ page }) => {
    test.setTimeout(90_000);
    const businessId = await setupBusiness(page, "picker-clientes");

    await gotoHydrated(page, "/clientes");
    await page.getByRole("button", { name: "Novo cliente", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Novo cliente" })).toBeVisible();
    await expect(dialog.getByLabel("Nome", { exact: true })).toHaveValue(""); // sem pre-preenchimento
    await dialog.getByLabel("Nome", { exact: true }).fill("Cliente Pagina E2E");
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Cliente Pagina E2E")).toBeVisible(); // a lista recarrega (router.refresh)
    expect(await prisma.client.count({ where: { businessId, name: "Cliente Pagina E2E" } })).toBe(1);
  });

  test("editar agendamento: o cliente do agendamento aparece (com Trocar), sem lista de clientes", async ({ page }) => {
    test.setTimeout(90_000);
    const businessId = await setupBusiness(page, "picker-editar");
    const category = await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE", name: "Venda de serviços" } });
    const client = await prisma.client.create({ data: { businessId, name: "Cliente Do Agendamento" } });
    const product = await prisma.product.create({ data: { businessId, name: "Servico Editar E2E", type: "SERVICO", defaultPrice: new Decimal(40) } });
    const appointment = await prisma.appointment.create({
      data: {
        businessId, clientId: client.id, kind: "DAY", status: "AGENDADO", autoCompleteEligible: true,
        scheduledOn: new Date("2099-01-10T00:00:00Z"), categoryId: category.id, paymentTiming: "AVISTA",
        services: { create: [{ productId: product.id, nameSnapshot: "Servico Editar E2E", unitPrice: new Decimal(40), quantity: 1, position: 0 }] },
      },
    });

    await gotoHydrated(page, `/agenda/${appointment.id}/editar`);
    await expect(page.getByText("Cliente Do Agendamento")).toBeVisible();
    await expect(page.getByRole("button", { name: "Trocar" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Buscar cliente" })).toHaveCount(0);
    await page.getByRole("button", { name: "Trocar" }).click();
    await expect(page.getByRole("combobox", { name: "Buscar cliente" })).toBeFocused();
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { gotoHydrated } from "./helpers/hydration";
import { fillMoney } from "./helpers/money";
import { E2E_BUSINESS_TZ, businessToday } from "./helpers/businessDate";
import { assertTestDatabase, loadTestEnv } from "../testEnv";
import { addDays, formatDateKey, formatInstant, startOfDayInstant } from "../../src/lib/time/zoned";

// Etapa F4: a empresa esta em Asia/Tokyo e o NAVEGADOR em outro fuso
// (America/Sao_Paulo e UTC). Todas as datas e horarios exibidos, e os
// valores iniciais dos campos de data, tem de ser os de Toquio - e sem erro
// de hidratacao (servidor e cliente geram o mesmo texto).
//
// Para o teste discriminar de verdade:
// - os dados sao gravados direto no banco de TESTE em instantes da
//   madrugada de Toquio (00:00-01:30 JST = 15:00-16:30 UTC do dia anterior =
//   12:00-13:30 do dia anterior em Sao Paulo), ou seja, dia de Toquio !=
//   dia de UTC != dia do navegador; um formatador no fuso do processo (UTC)
//   ou do navegador mostraria o dia anterior;
// - o relogio do NAVEGADOR (page.clock) fica parado em 01:00 JST de hoje,
//   quando a data local do navegador (Sao Paulo ou UTC) ainda e ontem - um
//   "hoje" calculado no navegador poria ontem no campo de data.
// O relogio do servidor nao e controlavel no `next dev` (plano, secao 7);
// ele continua no tempo real, e "hoje" do servidor e businessToday().

loadTestEnv();
assertTestDatabase();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const { Decimal } = Prisma;

const PASSWORD = "SenhaValida123";

function uniqueEmail(prefix: string) {
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

async function category(businessId: string, type: "REVENUE" | "COST" | "EXPENSE") {
  const found = await prisma.category.findFirst({
    where: { type, active: true, OR: [{ businessId }, { businessId: null }] },
    orderBy: { name: "asc" },
  });
  if (!found) throw new Error(`Sem categoria ${type} para a empresa de teste`);
  return found;
}

// Grava os dados da empresa recem-criada direto no banco de teste, todos na
// madrugada de Toquio de HOJE (dia da empresa).
async function seedTokyoEarlyMorning(email: string, today: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { business: true } });
  const business = user.business!;
  expect(business.timezone).toBe(E2E_BUSINESS_TZ);

  const tokyoMidnight = startOfDayInstant(today, E2E_BUSINESS_TZ); // 00:00 JST = 15:00 UTC de ontem
  const minutes = (n: number) => new Date(tokyoMidnight.getTime() + n * 60_000);
  const [revenue, cost] = await Promise.all([category(business.id, "REVENUE"), category(business.id, "COST")]);

  await prisma.financialEntry.create({
    data: {
      businessId: business.id,
      userId: user.id,
      type: "REVENUE",
      categoryId: revenue.id,
      amount: new Decimal("250.00"),
      occurredAt: tokyoMidnight,
      description: "Receita madrugada F4",
    },
  });

  await prisma.bill.create({
    data: {
      businessId: business.id,
      categoryId: cost.id,
      description: "Conta madrugada F4",
      amount: new Decimal("123.45"),
      dueDate: tokyoMidnight,
    },
  });

  const client = await prisma.client.create({ data: { businessId: business.id, name: "Cliente Fuso F4" } });
  const saleNumber = business.lastSaleNumber + 1;
  await prisma.business.update({ where: { id: business.id }, data: { lastSaleNumber: saleNumber } });
  const sale = await prisma.sale.create({
    data: {
      businessId: business.id,
      clientId: client.id,
      categoryId: revenue.id,
      userId: user.id,
      saleNumber,
      saleDate: tokyoMidnight,
      status: "CONFIRMED",
      subtotal: new Decimal("400.00"),
      total: new Decimal("400.00"),
      clientRequestId: randomUUID(),
      items: {
        create: [
          { description: "Item F4", quantity: new Decimal(1), unitPrice: new Decimal("400.00"), lineTotal: new Decimal("400.00") },
        ],
      },
    },
  });
  // Parcela vencendo em 7 dias, tambem a meia-noite de Toquio.
  await prisma.bill.create({
    data: {
      businessId: business.id,
      categoryId: revenue.id,
      saleId: sale.id,
      description: `Venda #${saleNumber}`,
      amount: new Decimal("400.00"),
      dueDate: startOfDayInstant(addDays(today, 7), E2E_BUSINESS_TZ),
    },
  });

  // 00:30-01:30 JST de hoje (12:30-13:30 de ontem em Sao Paulo).
  await prisma.appointment.create({
    data: {
      businessId: business.id,
      clientId: client.id,
      startAt: minutes(30),
      endAt: minutes(90),
      services: { create: [{ nameSnapshot: "Corte F4", durationMinutesSnapshot: 60, position: 0 }] },
    },
  });

  return { saleId: sale.id, clientId: client.id };
}

function collectHydrationProblems(page: Page) {
  const problems: string[] = [];
  const isHydration = (text: string) => /hydrat|did not match|didn't match|server rendered/i.test(text);
  page.on("console", (msg: ConsoleMessage) => {
    if (isHydration(msg.text())) problems.push(`[console.${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (error) => {
    if (isHydration(error.message)) problems.push(`[pageerror] ${error.message}`);
  });
  return problems;
}

for (const browserTimeZone of ["America/Sao_Paulo", "UTC"]) {
  test.describe(`F4 - navegador em ${browserTimeZone}, empresa em ${E2E_BUSINESS_TZ}`, () => {
    test.use({ timezoneId: browserTimeZone });

    test.afterAll(async () => {
      await prisma.$disconnect();
    });

    test("datas, horarios e valores iniciais saem no fuso da empresa, sem erro de hidratacao", async ({ page }) => {
      // Varias rotas compiladas pela primeira vez no `next dev` (ver agenda.spec.ts).
      test.setTimeout(120_000);
      const hydrationProblems = collectHydrationProblems(page);

      const email = uniqueEmail("fuso-f4");
      await register(page, "Dono Fuso F4", email);
      await completeOnboarding(page, "Empresa Fuso F4");

      const today = businessToday();
      const todayLabel = formatDateKey(today);
      const { saleId, clientId } = await seedTokyoEarlyMorning(email, today);

      // Sanidade do proprio teste: com o relogio do navegador em 01:00 JST de
      // hoje, a data LOCAL do navegador e ontem.
      const browserNow = new Date(startOfDayInstant(today, E2E_BUSINESS_TZ).getTime() + 60 * 60_000);
      await page.clock.setFixedTime(browserNow);
      const browserLocalDate = await page.evaluate(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      });
      expect(browserLocalDate).toBe(addDays(today, -1));

      // Receitas: data da tabela e valor inicial do campo no modal de criacao.
      await gotoHydrated(page, "/financeiro/receitas");
      const revenueRow = page.getByRole("row", { name: /Receita madrugada F4/ });
      await expect(revenueRow).toContainText(todayLabel);
      await page.getByRole("button", { name: "Nova receita" }).click();
      await expect(page.getByRole("dialog").getByLabel("Data", { exact: true })).toHaveValue(today);
      await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();

      // Contas a pagar: vencimento, "Vencendo hoje" e valor inicial do modal.
      await gotoHydrated(page, "/financeiro/pagar");
      const billRow = page.getByRole("row", { name: /Conta madrugada F4/ });
      await expect(billRow).toContainText(todayLabel);
      await expect(billRow).toContainText("Pendente");
      // Card "Vencendo hoje": a conta vence hoje no dia de Toquio.
      await expect(page.getByText(/^1 · R\$\s?123[.,]45$/)).toBeVisible();
      await page.getByRole("button", { name: "Nova conta a pagar" }).click();
      await expect(page.getByRole("dialog").getByLabel("Data de vencimento", { exact: true })).toHaveValue(today);
      await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();

      // Detalhe da venda: data da venda e vencimento da parcela.
      await gotoHydrated(page, `/vendas/${saleId}`);
      await expect(page.getByRole("heading", { name: /Venda #\d+/ })).toBeVisible();
      await expect(page.getByText(todayLabel, { exact: true })).toBeVisible();
      await expect(page.getByRole("row").filter({ hasText: formatDateKey(addDays(today, 7)) })).toHaveCount(1);

      // Detalhe do cliente: ultima compra, data da venda e da parcela.
      await gotoHydrated(page, `/clientes/${clientId}`);
      await expect(page.getByRole("heading", { name: "Cliente Fuso F4" })).toBeVisible();
      await expect(page.getByText(todayLabel).first()).toBeVisible();
      await expect(page.getByRole("row", { name: /Venda #\d+/ })).toContainText(todayLabel);
      await expect(page.getByRole("row", { name: /Venda #\d+/ })).toContainText(formatDateKey(addDays(today, 7)));

      // Agenda: o agendamento esta no dia de hoje de Toquio, das 00:30 as 01:30.
      await gotoHydrated(page, `/agenda?view=day&day=${today}`);
      await expect(page.getByText("Corte F4")).toBeVisible();
      await expect(page.getByText("00:30–01:30")).toBeVisible();

      // Dashboard: "hoje as HH:mm" no relogio de Toquio (servidor, tempo real).
      const before = new Date();
      await gotoHydrated(page, "/dashboard");
      const after = new Date();
      const header = page.getByText(/Última atualização: hoje às \d{2}:\d{2}/);
      await expect(header).toBeVisible();
      const hhmm = (d: Date) => formatInstant(d, E2E_BUSINESS_TZ, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, "en-GB");
      const shown = (await header.textContent())!.match(/hoje às (\d{2}:\d{2})/)![1];
      expect([hhmm(before), hhmm(after)]).toContain(shown);
      await expect(page.getByText(/\(\d{2}\/\d{2}\/\d{4} — \d{2}\/\d{2}\/\d{4}\)/)).toContainText(todayLabel.slice(3));

      expect(hydrationProblems, `Erros de hidratacao: ${hydrationProblems.join("\n")}`).toEqual([]);
    });
  });
}

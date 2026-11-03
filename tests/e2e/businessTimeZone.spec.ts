import { test, expect, type Page } from "@playwright/test";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { gotoHydrated } from "./helpers/hydration";
import { fillMoney } from "./helpers/money";
import { assertTestDatabase, loadTestEnv } from "../testEnv";
import { addDays, dateKeyToDbDate, formatDateKey, todayKey } from "../../src/lib/time/zoned";

// Etapa F7: Configuracoes > Empresa > País e fuso. Troca a empresa de teste
// para America/Sao_Paulo PELA TELA, confere que "hoje" (data inicial de um
// lancamento novo), o status de um vencimento e o rotulo da Agenda seguem o
// fuso novo e que um lancamento ja existente mantem o dia; depois volta para
// o Japao e confere tudo de novo.
//
// O relogio do servidor nao e controlavel no `next dev`: "hoje" em Toquio e
// em Sao Paulo so sao dias DIFERENTES entre 00:00 e 12:00 JST. Fora dessa
// janela as asserções de "hoje"/vencimento continuam valendo (esperado
// calculado com o relogio real nos dois fusos), mas nao discriminam - o
// teste registra isso numa anotacao. O rotulo da Agenda e o dia do
// lancamento existente discriminam sempre.

loadTestEnv();
assertTestDatabase();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const { Decimal } = Prisma;

const PASSWORD = "SenhaValida123";
const ENTRY_DESCRIPTION = "Receita antes da troca de fuso F7";
const BILL_DESCRIPTION = "Conta vencimento F7";

function uniqueEmail() {
  return `f7-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
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

const todayIn = (timeZone: string) => todayKey({ timeZone, now: new Date() });

async function expectCompanyClock(page: Page, opts: { today: string; entryDay: string; billDue: string; city: string }) {
  // Lancamento ja existente: mesmo dia, qualquer que seja o fuso (90 dias:
  // o padrao da lista e o mes corrente, que pode nao conter o dia).
  await gotoHydrated(page, "/financeiro/receitas?period=LAST_90_DAYS");
  const entryRow = page.getByRole("row", { name: new RegExp(ENTRY_DESCRIPTION) });
  await expect(entryRow).toBeVisible();
  await expect(entryRow.getByText(formatDateKey(opts.entryDay))).toBeVisible();

  // "Hoje" da empresa: data inicial de um lancamento novo.
  await page.getByRole("button", { name: "Nova receita" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Data")).toHaveValue(opts.today);
  await page.keyboard.press("Escape");

  // Vencimento: atrasado so se o vencimento for antes de "hoje" da empresa.
  await gotoHydrated(page, "/financeiro/pagar");
  const billRow = page.getByRole("row", { name: new RegExp(BILL_DESCRIPTION) });
  await expect(billRow).toBeVisible();
  await expect(billRow.getByText(opts.billDue < opts.today ? "Atrasado" : "Pendente", { exact: true })).toBeVisible();

  // Agenda: o rotulo do campo de inicio mostra a cidade do fuso da empresa.
  await gotoHydrated(page, "/agenda/novo");
  await expect(page.getByLabel(`Início (horário de ${opts.city})`)).toBeVisible();
}

async function saveCountryAndZone(page: Page, country: string, timezone: string | null) {
  await gotoHydrated(page, "/configuracoes");
  await page.getByLabel("País", { exact: true }).selectOption(country);
  if (timezone) {
    await page.getByLabel("Fuso horário", { exact: true }).selectOption(timezone);
  } else {
    await expect(page.getByLabel("Fuso horário", { exact: true })).toHaveCount(0); // pais de fuso unico: so o pais
  }
  await page.getByRole("button", { name: "Salvar país e fuso" }).click();
  await expect(page.getByText("País e fuso atualizados.")).toBeVisible();
}

test("Configurações: trocar a empresa para America/Sao_Paulo e voltar; hoje, vencimento e Agenda seguem o fuso, lançamento existente mantém o dia", async ({ page }) => {
  const email = uniqueEmail();
  await register(page, "Usuario Fuso", email);
  await completeOnboarding(page, "Empresa Fuso F7");

  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { business: true } });
  const business = user.business!;
  expect([business.country, business.timezone]).toEqual(["JP", "Asia/Tokyo"]);

  const tokyoToday = todayIn("Asia/Tokyo");
  const spToday = todayIn("America/Sao_Paulo");
  if (tokyoToday === spToday) {
    test.info().annotations.push({
      type: "fuso",
      description: `Hoje é ${tokyoToday} em Tóquio e em São Paulo: as asserções de "hoje"/vencimento não discriminam neste horário.`,
    });
  }

  const [revenue, expense] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { type: "REVENUE", active: true, businessId: null }, orderBy: { name: "asc" } }),
    prisma.category.findFirstOrThrow({ where: { type: "EXPENSE", active: true, businessId: null }, orderBy: { name: "asc" } }),
  ]);
  const entryDay = addDays(tokyoToday, -10);
  await prisma.financialEntry.create({
    data: {
      businessId: business.id, userId: user.id, type: "REVENUE", categoryId: revenue.id, amount: new Decimal("150.00"),
      description: ENTRY_DESCRIPTION, occurredOn: dateKeyToDbDate(entryDay),
    },
  });
  // Vence no "hoje" de Sao Paulo: atrasada em Toquio quando os dias diferem.
  await prisma.bill.create({
    data: { businessId: business.id, categoryId: expense.id, description: BILL_DESCRIPTION, amount: new Decimal("80.00"), dueOn: dateKeyToDbDate(spToday) },
  });

  await expectCompanyClock(page, { today: tokyoToday, entryDay, billDue: spToday, city: "Tóquio" });

  await saveCountryAndZone(page, "BR", "America/Sao_Paulo");
  const inSp = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
  expect([inSp.country, inSp.timezone]).toEqual(["BR", "America/Sao_Paulo"]);
  await expectCompanyClock(page, { today: todayIn("America/Sao_Paulo"), entryDay, billDue: spToday, city: "Brasília" });

  await saveCountryAndZone(page, "JP", null);
  const back = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
  expect([back.country, back.timezone]).toEqual(["JP", "Asia/Tokyo"]);
  await expectCompanyClock(page, { today: todayIn("Asia/Tokyo"), entryDay, billDue: spToday, city: "Tóquio" });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

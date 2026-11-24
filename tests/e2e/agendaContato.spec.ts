import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Prisma } from "@prisma/client";
import { gotoHydrated } from "./helpers/hydration";
import { createOnboardedUser, newTestPrisma } from "./helpers/session";
import { businessToday } from "./helpers/businessDate";
import { next, popup } from "./helpers/newAppointment";
import { assertTestDatabase, loadTestEnv } from "../testEnv";

// Agenda: (1) a caixa pontilhada do dia vazio inteira e clicavel; (2) o cartao do agendamento mostra o WhatsApp/telefone do
// cliente com os atalhos "Ligar" (tel:) e "WhatsApp" (wa.me). Os links NUNCA sao seguidos nestes testes (so o href e lido).
loadTestEnv();
assertTestDatabase();
const prisma = newTestPrisma();
const { Decimal } = Prisma;

type Seed = { userId: string; businessId: string; clients: Record<"zap" | "intl" | "short" | "phone" | "none", string> };
let seed: Seed;

const NAMES = {
  zap: "Cliente Zap Cartão",
  intl: "Cliente Exterior Cartão",
  short: "Cliente Curto Cartão",
  phone: "Cliente Fone Cartão",
  none: "Cliente Sem Contato",
} as const;

async function createAppointment(clientId: string, dayKey: string) {
  const category = await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE", name: "Venda de serviços" } });
  await prisma.appointment.create({
    data: {
      businessId: seed.businessId, clientId, kind: "DAY", status: "AGENDADO", autoCompleteEligible: true,
      scheduledOn: new Date(`${dayKey}T00:00:00Z`), categoryId: category.id, paymentTiming: "AVISTA",
      services: { create: [{ nameSnapshot: "Corte Contato", unitPrice: new Decimal(80), quantity: 1, position: 0 }] },
    },
  });
}

test.beforeEach(async ({ context, baseURL }) => {
  const user = await createOnboardedUser(prisma, "contato");
  const business = await prisma.business.findUniqueOrThrow({ where: { userId: user.userId } });
  expect(business.country).toBe("JP"); // a empresa de teste nasce no Japao (DDI 81)
  const make = async (name: string, data: { whatsapp?: string; phone?: string }) => (await prisma.client.create({ data: { businessId: business.id, name, ...data } })).id;
  seed = {
    userId: user.userId,
    businessId: business.id,
    clients: {
      zap: await make(NAMES.zap, { whatsapp: "090-1111-2222", phone: "03-1234-5678" }),
      intl: await make(NAMES.intl, { whatsapp: "+55 11 91234-5678" }),
      short: await make(NAMES.short, { whatsapp: "123" }),
      phone: await make(NAMES.phone, { phone: "03-9999-8888" }),
      none: await make(NAMES.none, {}),
    },
  };
  await context.addCookies([{ name: "cookie-notice", value: "1", url: baseURL! }]);
  await user.signIn(context, baseURL!);
});

test.afterEach(async () => {
  await prisma.user.deleteMany({ where: { id: seed.userId } });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

const row = (page: Page, name: string): Locator => page.getByTestId("appointment-row").filter({ hasText: name });
const callLink = (page: Page, name: string): Locator => page.getByRole("link", { name: `Ligar para ${name}` });
const whatsappLink = (page: Page, name: string): Locator => page.getByRole("link", { name: `Abrir WhatsApp de ${name}` });

async function seedAllToday() {
  for (const id of Object.values(seed.clients)) await createAppointment(id, businessToday());
}

async function scanAxe(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} ${n.html.slice(0, 120)}`).join(" | ")}`), label).toEqual([]);
}

test.describe("dia vazio: a caixa pontilhada inteira é clicável", () => {
  const emptyDay = businessToday(1);
  const emptyUrl = `/agenda?view=calendar&day=${emptyDay}`;
  const box = (page: Page) => page.getByTestId("empty-day-button");

  test("é UM botão sem aria-label (nome vem do conteúdo, com a data só para leitor de tela), textos visíveis e nada interativo dentro", async ({ page }) => {
    await gotoHydrated(page, emptyUrl);
    const [year, month, day] = emptyDay.split("-");
    await expect(box(page)).toBeVisible();
    // Sem aria-label: o nome acessivel vem do conteudo (os dois textos visiveis + a data em um span sr-only).
    await expect(box(page)).not.toHaveAttribute("aria-label");
    const accessibleName = `Nenhum agendamento neste dia. + Novo agendamento nesta data em ${day}/${month}/${year}`;
    await expect(page.getByRole("button", { name: accessibleName, exact: true })).toHaveCount(1);
    // A data fica so para leitor de tela (sr-only); o que se ve nao muda.
    await expect(box(page).locator(".sr-only")).toHaveText(` em ${day}/${month}/${year}`);
    await expect(box(page)).toContainText("Nenhum agendamento neste dia.");
    await expect(box(page)).toContainText("+ Novo agendamento nesta data");
    expect(await box(page).evaluate((element) => element.tagName)).toBe("BUTTON");
    await expect(box(page).locator("a, button, input, select, textarea, [tabindex]")).toHaveCount(0);
    await expect(box(page)).toHaveCSS("cursor", "pointer");
  });

  test("clicar num canto da caixa (fora do texto) abre o popup com aquela data", async ({ page }) => {
    await gotoHydrated(page, emptyUrl);
    await box(page).click({ position: { x: 6, y: 6 } });
    await expect(popup(page)).toBeVisible();
    expect(new URL(page.url()).searchParams.get("date")).toBe(emptyDay);
    await popup(page).getByLabel("Título (opcional)").fill("Reunião"); // o passo 2 exige cliente, serviço ou título
    await next(page); // 1 Cliente -> 2 Servicos
    await next(page); // 2 Servicos -> 3 Data
    await expect(popup(page).getByLabel("Data do atendimento")).toHaveValue(emptyDay);
  });

  test("Enter e Espaço também abrem o popup", async ({ page }) => {
    await gotoHydrated(page, emptyUrl);
    for (const key of ["Enter", "Space"]) {
      await box(page).focus();
      await expect(box(page)).toBeFocused();
      await page.keyboard.press(key);
      await expect(popup(page), `tecla ${key}`).toBeVisible();
      await page.keyboard.press("Escape"); // sem dado preenchido: fecha direto
      await expect(popup(page)).toHaveCount(0);
    }
  });

  for (const theme of ["light", "dark"] as const) {
    test(`axe: 0 violações com a caixa do dia vazio — tema ${theme}`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "theme", value: theme, url: baseURL! }]);
      await gotoHydrated(page, emptyUrl);
      await expect(box(page)).toBeVisible();
      await scanAxe(page, `dia vazio (${theme})`);
      await box(page).hover();
      await scanAxe(page, `dia vazio em hover (${theme})`);
    });
  }
});

test.describe("contato do cliente no cartão do agendamento", () => {
  test("cliente com WhatsApp: mostra o número como digitado e os dois links com href, target e rel exatos", async ({ page }) => {
    await seedAllToday();
    await gotoHydrated(page, "/agenda");
    const card = row(page, NAMES.zap);
    await expect(card.getByTestId("appointment-contact")).toContainText("090-1111-2222");
    await expect(card.getByTestId("appointment-contact")).not.toContainText("03-1234-5678"); // o WhatsApp tem prioridade sobre o telefone
    await expect(card.getByRole("link", { name: "Ligar para Cliente Zap Cartão" })).toHaveAttribute("href", "tel:09011112222");
    const wa = card.getByRole("link", { name: "Abrir WhatsApp de Cliente Zap Cartão" });
    await expect(wa).toHaveAttribute("href", "https://wa.me/819011112222");
    await expect(wa).toHaveAttribute("target", "_blank");
    await expect(wa).toHaveAttribute("rel", "noopener noreferrer");
    await expect(callLink(page, NAMES.zap)).not.toHaveAttribute("target", /.+/); // Ligar nao abre aba
    // Texto visivel dos atalhos e icones decorativos (sem marca do WhatsApp: so um icone generico, sem texto proprio).
    await expect(card.getByRole("link", { name: /Ligar para/ })).toHaveText("Ligar");
    await expect(wa).toHaveText("WhatsApp");
    await expect(card.getByTestId("appointment-contact").locator("svg[aria-hidden='true']")).toHaveCount(2);
  });

  test("número com + de outro país: o tel e o wa.me preservam o código do país", async ({ page }) => {
    await seedAllToday();
    await gotoHydrated(page, "/agenda");
    await expect(row(page, NAMES.intl).getByTestId("appointment-contact")).toContainText("+55 11 91234-5678");
    await expect(callLink(page, NAMES.intl)).toHaveAttribute("href", "tel:+5511912345678");
    await expect(whatsappLink(page, NAMES.intl)).toHaveAttribute("href", "https://wa.me/5511912345678");
  });

  test("WhatsApp curto demais: mostra o número e o Ligar, sem o atalho de WhatsApp", async ({ page }) => {
    await seedAllToday();
    await gotoHydrated(page, "/agenda");
    await expect(row(page, NAMES.short).getByTestId("appointment-contact")).toContainText("123");
    await expect(callLink(page, NAMES.short)).toHaveAttribute("href", "tel:123");
    await expect(whatsappLink(page, NAMES.short)).toHaveCount(0);
  });

  test("cliente só com telefone: mostra o telefone e só o Ligar", async ({ page }) => {
    await seedAllToday();
    await gotoHydrated(page, "/agenda");
    await expect(row(page, NAMES.phone).getByTestId("appointment-contact")).toContainText("03-9999-8888");
    await expect(callLink(page, NAMES.phone)).toHaveAttribute("href", "tel:0399998888");
    await expect(whatsappLink(page, NAMES.phone)).toHaveCount(0);
    await expect(row(page, NAMES.phone).getByRole("link", { name: /WhatsApp/ })).toHaveCount(0);
  });

  test("cliente sem contato: nenhum link nem rótulo", async ({ page }) => {
    await seedAllToday();
    await gotoHydrated(page, "/agenda");
    const card = row(page, NAMES.none);
    await expect(card).toBeVisible();
    await expect(card.getByTestId("appointment-contact")).toHaveCount(0);
    await expect(card.locator("a[href^='tel:'], a[href*='wa.me']")).toHaveCount(0);
    await expect(card.getByText(/Ligar|WhatsApp/)).toHaveCount(0);
  });

  test("agendamento sem cliente: nada de contato", async ({ page }) => {
    await prisma.appointment.create({
      data: { businessId: seed.businessId, kind: "DAY", status: "AGENDADO", autoCompleteEligible: true, title: "Reuniao sem cliente", scheduledOn: new Date(`${businessToday()}T00:00:00Z`) }, // sem valor: sem categoria nem pagamento
    });
    await gotoHydrated(page, "/agenda");
    const card = row(page, "Reuniao sem cliente");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("appointment-contact")).toHaveCount(0);
  });

  test("celular (375 px): atalhos com pelo menos 44x44 px e o cartão não estoura a largura", async ({ page }) => {
    await seedAllToday();
    await page.setViewportSize({ width: 375, height: 800 });
    await gotoHydrated(page, "/agenda");
    for (const name of [NAMES.zap, NAMES.intl, NAMES.phone]) {
      const card = row(page, name);
      await card.scrollIntoViewIfNeeded();
      for (const link of await card.getByRole("link", { name: /^(Ligar para|Abrir WhatsApp de)/ }).all()) {
        const rect = (await link.boundingBox())!;
        expect(rect.width, `${name}: largura do atalho`).toBeGreaterThanOrEqual(44);
        expect(rect.height, `${name}: altura do atalho`).toBeGreaterThanOrEqual(44);
        expect(rect.x + rect.width, `${name}: atalho dentro da tela`).toBeLessThanOrEqual(375);
      }
      const cardBox = (await card.boundingBox())!;
      expect(cardBox.x + cardBox.width, `${name}: cartao dentro da tela`).toBeLessThanOrEqual(375);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "rolagem horizontal da pagina").toBeLessThanOrEqual(0);
  });

  test("visões Dia e Mês mostram o mesmo contato e os mesmos links", async ({ page }) => {
    await seedAllToday();
    const views = [`/agenda?view=day&day=${businessToday()}`, `/agenda?view=month&month=${businessToday().slice(0, 7)}`];
    for (const url of views) {
      await gotoHydrated(page, url);
      await expect(row(page, NAMES.zap).getByTestId("appointment-contact"), url).toContainText("090-1111-2222");
      await expect(callLink(page, NAMES.zap), url).toHaveAttribute("href", "tel:09011112222");
      await expect(whatsappLink(page, NAMES.zap), url).toHaveAttribute("href", "https://wa.me/819011112222");
      await expect(callLink(page, NAMES.phone), url).toHaveAttribute("href", "tel:0399998888");
      await expect(whatsappLink(page, NAMES.phone), url).toHaveCount(0);
      await expect(row(page, NAMES.none).getByTestId("appointment-contact"), url).toHaveCount(0);
    }
  });

  for (const theme of ["light", "dark"] as const) {
    test(`axe: 0 violações nos cartões com contato — tema ${theme} (desktop e celular)`, async ({ page, context, baseURL }) => {
      test.setTimeout(90_000);
      await seedAllToday();
      await context.addCookies([{ name: "theme", value: theme, url: baseURL! }]);
      await gotoHydrated(page, "/agenda");
      await expect(row(page, NAMES.zap)).toBeVisible();
      await scanAxe(page, `cartoes (${theme})`);
      await page.setViewportSize({ width: 375, height: 800 });
      await expect(row(page, NAMES.zap)).toBeVisible();
      await scanAxe(page, `cartoes 375px (${theme})`);
    });
  }
});

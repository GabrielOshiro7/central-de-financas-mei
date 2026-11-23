import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Prisma } from "@prisma/client";
import { gotoHydrated } from "./helpers/hydration";
import { createOnboardedUser, newTestPrisma } from "./helpers/session";
import { fillMoney } from "./helpers/money";
import { E2E_BUSINESS_TZ, businessToday } from "./helpers/businessDate";
import {
  back,
  clientDialog,
  createClientInPopup,
  discardDialog,
  next,
  openFromAgenda,
  popup,
  save,
  savedNotice,
  stepCounter,
} from "./helpers/newAppointment";
import { assertTestDatabase, loadTestEnv } from "../testEnv";
import { dbDateToKey, formatDateKey, parseDateKey, zonedInstant } from "../../src/lib/time/zoned";

// Popup "Novo agendamento" em passos (Agenda): 1 Cliente -> 2 Servicos -> 3 Data -> [4 Pagamento, so com valor], contador
// "x/N", Enter no ultimo campo do passo = Proximo/Salvar, WhatsApp do cliente, modal de cliente empilhado, fechar com
// confirmacao, /agenda/novo redirecionando, celular e axe.
loadTestEnv();
assertTestDatabase();
const prisma = newTestPrisma();
const { Decimal } = Prisma;

type Seed = { userId: string; businessId: string; clientId: string; serviceId: string; zeroServiceId: string };
let seed: Seed;

test.beforeEach(async ({ context, baseURL }) => {
  const user = await createOnboardedUser(prisma, "popup");
  const business = await prisma.business.findUniqueOrThrow({ where: { userId: user.userId } });
  const client = await prisma.client.create({
    data: { businessId: business.id, name: "Cliente Popup", whatsapp: "090-1111-2222", phone: "03-1234-5678", email: "popup@example.com", city: "Tokyo", notes: "nota original" },
  });
  await prisma.client.createMany({
    data: [
      { businessId: business.id, name: "Maria Popup" },
      { businessId: business.id, name: "Marta Popup" },
    ],
  });
  const service = await prisma.product.create({ data: { businessId: business.id, name: "Corte Popup", type: "SERVICO", defaultPrice: new Decimal(80) } });
  const zero = await prisma.product.create({ data: { businessId: business.id, name: "Cortesia Popup", type: "SERVICO", defaultPrice: new Decimal(0) } });
  seed = { userId: user.userId, businessId: business.id, clientId: client.id, serviceId: service.id, zeroServiceId: zero.id };
  await context.addCookies([{ name: "cookie-notice", value: "1", url: baseURL! }]);
  await user.signIn(context, baseURL!);
});

test.afterEach(async () => {
  await prisma.user.deleteMany({ where: { id: seed.userId } });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

// Define o valor IGNORANDO o maxlength (o fill do Playwright digita e respeita o limite): simula colar/preencher por script.
async function setUnbounded(locator: Locator, value: string) {
  await locator.evaluate((element, text) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(element, text);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

const appointments = () => prisma.appointment.findMany({ where: { businessId: seed.businessId }, include: { installments: { orderBy: { position: "asc" } }, services: true } });

async function pickClient(page: Page, term: string, optionName: string) {
  await page.getByRole("combobox", { name: "Buscar cliente" }).fill(term);
  await page.getByRole("option", { name: optionName }).click();
  await expect(popup(page).getByRole("button", { name: "Trocar" })).toBeVisible();
}

test.describe("Novo agendamento (popup)", () => {
  test("1) sem valor: 3 passos (1/3, 2/3, 3/3), Enter onde aplicável e botão no fim; fecha, confirma e o agendamento existe", async ({ page }) => {
    await openFromAgenda(page);
    await expect(popup(page).getByRole("heading", { name: "Novo agendamento" })).toBeVisible();
    await expect(stepCounter(page)).toHaveText("1/3");
    await expect(popup(page).getByText("Cliente", { exact: true }).first()).toBeVisible(); // subtitulo do passo

    // Passo 1: Enter no titulo vai a busca; Enter na busca VAZIA e sem opcao destacada = Proximo.
    await page.getByLabel("Título (opcional)").fill("Reunião Popup E2E");
    await page.getByLabel("Título (opcional)").press("Enter");
    await expect(page.getByRole("combobox", { name: "Buscar cliente" })).toBeFocused();
    await page.getByRole("combobox", { name: "Buscar cliente" }).press("Enter");
    await expect(stepCounter(page)).toHaveText("2/3");

    // Passo 2: sem valor; Enter no ultimo campo (o seletor de servico) avanca. Foco no primeiro campo do passo.
    await expect(page.getByLabel("Adicionar serviço")).toBeFocused();
    await expect(page.getByTestId("no-value-notice")).toHaveText("Sem valor: não gera receita.");
    await page.getByLabel("Adicionar serviço").press("Enter");
    await expect(stepCounter(page)).toHaveText("3/3");
    await expect(page.getByLabel("Data do atendimento")).toBeFocused();
    await expect(popup(page).getByRole("button", { name: "Salvar" })).toBeVisible();
    await expect(popup(page).getByRole("button", { name: "Próximo" })).toHaveCount(0); // um unico primario por passo

    // Passo 3: salva pelo botao.
    await save(page);
    await expect(popup(page)).toHaveCount(0);
    const today = businessToday();
    await expect(savedNotice(page)).toHaveText(`Agendamento salvo para ${formatDateKey(today)}`);
    await expect(page).not.toHaveURL(/novo=1/);

    const [created] = await appointments();
    expect([created.title, created.clientId, created.categoryId, dbDateToKey(created.scheduledOn!)]).toEqual(["Reunião Popup E2E", null, null, today]);
  });

  test("2) com valor à vista: o contador vira x/4 ao adicionar serviço, o passo Pagamento aparece e salva", async ({ page }) => {
    await openFromAgenda(page);
    await pickClient(page, "cliente pop", "Cliente Popup");
    await next(page);
    await expect(stepCounter(page)).toHaveText("2/3");
    await page.getByLabel("Adicionar serviço").selectOption({ label: "Corte Popup" });
    await expect(page.getByTestId("day-appointment-total")).toHaveText("R$ 80,00");
    await expect(stepCounter(page)).toHaveText("2/4"); // ao vivo
    await expect(popup(page).getByText("— Passo 2 de 4")).toHaveCount(1); // texto acessivel (sr-only)
    await next(page);
    await expect(stepCounter(page)).toHaveText("3/4");
    await next(page);
    await expect(stepCounter(page)).toHaveText("4/4");
    await expect(page.getByLabel("Categoria de receita").locator("option:checked")).toHaveText("Venda de serviços");
    await expect(page.getByRole("button", { name: "À vista" })).toHaveAttribute("aria-pressed", "true");
    await save(page);
    await expect(popup(page)).toHaveCount(0);

    const [created] = await appointments();
    expect([created.clientId, created.paymentTiming, created.installments.length, created.services.length]).toEqual([seed.clientId, "AVISTA", 0, 1]);
    expect(created.categoryId).not.toBeNull();
  });

  test("3) com valor a prazo com parcelas: divide, recusa soma errada e salva", async ({ page }) => {
    await openFromAgenda(page);
    await pickClient(page, "cliente pop", "Cliente Popup");
    await next(page);
    await page.getByLabel("Adicionar serviço").selectOption({ label: "Corte Popup" });
    await next(page);
    await next(page);
    await page.getByRole("button", { name: "A prazo" }).click();
    await page.getByLabel("Nº de parcelas").fill("2");
    await page.getByLabel("Nº de parcelas").press("Enter");
    await expect(page.locator('input[id^="due-"]')).toHaveCount(2);
    await fillMoney(page.locator('input[id^="amount-"]').nth(0), "70");
    await save(page);
    await expect(popup(page).locator('p[role="alert"]')).toHaveText("A soma das parcelas (R$ 110,00) não bate com o total do atendimento (R$ 80,00).");
    await fillMoney(page.locator('input[id^="amount-"]').nth(0), "30");
    await fillMoney(page.locator('input[id^="amount-"]').nth(1), "50");
    await save(page);
    await expect(popup(page)).toHaveCount(0);

    const [created] = await appointments();
    expect(created.paymentTiming).toBe("APRAZO");
    expect(created.installments.map((i) => i.amount.toString())).toEqual(["30", "50"]);
  });

  test("4) valor sem cliente: bloqueio no passo 2; 'Voltar e escolher cliente' leva ao passo 1 com o foco na busca", async ({ page }) => {
    await openFromAgenda(page);
    await expect(popup(page).getByText("Obrigatório se houver serviço com valor.")).toBeVisible();
    await next(page);
    await page.getByLabel("Adicionar serviço").selectOption({ label: "Corte Popup" });
    await next(page);
    await expect(popup(page).locator('p[role="alert"]')).toHaveText("Escolha um cliente para agendamentos com valor.");
    await expect(stepCounter(page)).toHaveText("2/4"); // nao avancou
    await popup(page).getByRole("button", { name: "Voltar e escolher cliente" }).click();
    await expect(stepCounter(page)).toHaveText("1/4");
    await expect(page.getByRole("combobox", { name: "Buscar cliente" })).toBeFocused();
    expect(await appointments()).toHaveLength(0);

    // Com o cliente escolhido, o servico continua la e o fluxo segue.
    await pickClient(page, "cliente pop", "Cliente Popup");
    await next(page);
    await expect(page.getByLabel("Valor unitário")).toBeVisible();
    await next(page);
    await expect(stepCounter(page)).toHaveText("3/4");
  });

  test("5) Enter: cada passo avança no último campo; na Observação quebra linha; Voltar devolve o foco ao campo de onde saiu", async ({ page }) => {
    await openFromAgenda(page);
    await page.getByRole("combobox", { name: "Buscar cliente" }).fill("maria");
    await expect(page.getByRole("option", { name: "Maria Popup" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("combobox", { name: "Buscar cliente" }).press("Enter"); // escolhe pelo teclado: foco no WhatsApp
    await expect(page.getByLabel("WhatsApp (opcional)")).toBeFocused();
    await page.getByLabel("WhatsApp (opcional)").fill("090 9999 0000");
    await page.getByLabel("WhatsApp (opcional)").press("Enter");
    await expect(stepCounter(page)).toHaveText("2/3");
    await page.getByLabel("Adicionar serviço").selectOption({ label: "Cortesia Popup" }); // valor zero: continua 3 passos
    await expect(stepCounter(page)).toHaveText("2/3");
    // Com ao menos uma linha, o seletor "Adicionar serviço" e ignorado pelo Enter (data-enter-skip): UM Enter no valor
    // da ultima linha ja e "Proximo".
    await expect(page.getByLabel("Adicionar serviço")).toHaveAttribute("data-enter-skip", "");
    await page.getByLabel("Valor unitário").press("Enter");
    await expect(stepCounter(page)).toHaveText("3/3");
    await expect(page.getByLabel("Data do atendimento")).toBeFocused();
    await page.getByLabel("Data do atendimento").press("Enter");
    const notes = page.getByLabel("Observação (opcional)");
    await expect(notes).toBeFocused();
    await notes.fill("a");
    await notes.press("Enter");
    await notes.pressSequentially("b");
    await expect(notes).toHaveValue("a\nb");
    await expect(stepCounter(page)).toHaveText("3/3");
    expect(await appointments()).toHaveLength(0);

    // Voltar ao passo 2: o foco volta ao campo de onde o usuario saiu (o valor unitario).
    await back(page);
    await expect(stepCounter(page)).toHaveText("2/3");
    await expect(page.getByLabel("Valor unitário")).toBeFocused();
    // Voltar ao passo 1: foco no WhatsApp (ultimo campo mexido ali).
    await back(page);
    await expect(page.getByLabel("WhatsApp (opcional)")).toBeFocused();
    await expect(page.getByLabel("WhatsApp (opcional)")).toHaveValue("090 9999 0000");
  });

  test("6) WhatsApp: cliente com WhatsApp vem preenchido; alterar e salvar atualiza SÓ o WhatsApp no cadastro", async ({ page }) => {
    await openFromAgenda(page);
    await expect(page.getByLabel("WhatsApp (opcional)")).toHaveCount(0); // sem cliente, o campo nem aparece
    await pickClient(page, "cliente pop", "Cliente Popup");
    const whatsapp = page.getByLabel("WhatsApp (opcional)");
    await expect(whatsapp).toHaveValue("090-1111-2222");
    await expect(popup(page).getByText("Só para você contatar o cliente; o sistema não envia mensagens.")).toBeVisible();
    await expect(popup(page).getByText("Alterar aqui atualiza o cadastro do cliente.")).toBeVisible();
    await whatsapp.fill("+81 90-5555-6666");
    await next(page);
    await page.getByLabel("Adicionar serviço").selectOption({ label: "Cortesia Popup" });
    await next(page);
    await save(page);
    await expect(popup(page)).toHaveCount(0);

    const after = await prisma.client.findUniqueOrThrow({ where: { id: seed.clientId } });
    expect(after.whatsapp).toBe("+81 90-5555-6666");
    expect([after.phone, after.email, after.city, after.notes]).toEqual(["03-1234-5678", "popup@example.com", "Tokyo", "nota original"]); // o resto do cadastro intacto

    // Conferir na pagina do cliente.
    await gotoHydrated(page, `/clientes/${seed.clientId}`);
    await expect(page.getByText("+81 90-5555-6666")).toBeVisible();
    await expect(page.getByText("03-1234-5678")).toBeVisible();
  });

  test("7) criar cliente pelo modal empilhado: clicar no fundo do modal de cliente fecha SÓ ele; o popup mantém os dados", async ({ page }) => {
    await openFromAgenda(page);
    await page.getByLabel("Título (opcional)").fill("Titulo que deve ficar");
    await popup(page).getByRole("button", { name: /Criar novo cliente/ }).click();
    await expect(clientDialog(page)).toBeVisible();
    await clientDialog(page).getByLabel("Nome", { exact: true }).fill("Nome digitado");

    await page.mouse.click(6, 6); // fundo do modal de cliente (o de cima)
    await expect(clientDialog(page)).toHaveCount(0);
    await expect(popup(page)).toBeVisible();
    await expect(page.getByLabel("Título (opcional)")).toHaveValue("Titulo que deve ficar");
    await expect(discardDialog(page)).toHaveCount(0);

    // E o fluxo normal: criar o cliente deixa-o escolhido e o foco vai para o WhatsApp.
    await createClientInPopup(page, "Cliente Criado Popup", { whatsapp: "090-7777-8888" });
    await expect(page.getByLabel("WhatsApp (opcional)")).toHaveValue("090-7777-8888");
    await expect(page.getByLabel("WhatsApp (opcional)")).toBeFocused();
  });

  test("8) fechar: clique no fundo não fecha; Esc com dado pede 'Descartar agendamento?'; Esc sem dado fecha", async ({ page }) => {
    await openFromAgenda(page);
    // Sem dado: Esc fecha direto.
    await page.keyboard.press("Escape");
    await expect(popup(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Novo agendamento", exact: true }).click();
    await waitFor(page);
    await page.mouse.click(6, 6); // clique no fundo: nao fecha
    await expect(popup(page)).toBeVisible();

    await page.getByLabel("Título (opcional)").fill("Dado preenchido");
    await page.keyboard.press("Escape");
    await expect(discardDialog(page)).toBeVisible();
    await expect(discardDialog(page).getByRole("button", { name: "Continuar editando" })).toBeVisible();
    await discardDialog(page).getByRole("button", { name: "Continuar editando" }).click();
    await expect(discardDialog(page)).toHaveCount(0);
    await expect(popup(page)).toBeVisible();
    await expect(page.getByLabel("Título (opcional)")).toHaveValue("Dado preenchido"); // dados mantidos

    // Cancelar tambem pede confirmacao; Descartar fecha.
    await popup(page).getByRole("button", { name: "Cancelar" }).click();
    await expect(discardDialog(page)).toBeVisible();
    await discardDialog(page).getByRole("button", { name: "Descartar" }).click();
    await expect(popup(page)).toHaveCount(0);
    await expect(page).not.toHaveURL(/novo=1/);
    expect(await appointments()).toHaveLength(0);
  });

  test("9) /agenda/novo?date&clientId&serviceId redireciona e abre o popup pré-preenchido; 'Agendar o próximo' abre com cliente e serviço; a URL é limpa", async ({ page }) => {
    test.setTimeout(120_000);
    const date = businessToday(5);
    await page.goto(`/agenda/novo?date=${date}&clientId=${seed.clientId}&serviceId=${seed.serviceId}`);
    await waitFor(page);
    await expect(page).toHaveURL(new RegExp(`/agenda\\?novo=1&date=${date}&clientId=${seed.clientId}&serviceId=${seed.serviceId}`));
    await expect(popup(page).getByText("Cliente Popup")).toBeVisible();
    await expect(page.getByLabel("WhatsApp (opcional)")).toHaveValue("090-1111-2222");
    await next(page);
    await expect(page.getByTestId("day-appointment-total")).toHaveText("R$ 80,00"); // servico pre-selecionado
    await next(page);
    await expect(page.getByLabel("Data do atendimento")).toHaveValue(date);

    // Fechar limpa so os parametros do popup (sem criar entrada no historico).
    const historyLength = await page.evaluate(() => window.history.length);
    await popup(page).getByRole("button", { name: "Voltar" }).click();
    await popup(page).getByRole("button", { name: "Voltar" }).click();
    await popup(page).getByRole("button", { name: "Cancelar" }).click();
    await discardDialog(page).getByRole("button", { name: "Descartar" }).click();
    await expect(popup(page)).toHaveCount(0);
    expect(new URL(page.url()).search).toBe("");
    expect(await page.evaluate(() => window.history.length)).toBe(historyLength);

    // "Agendar o proximo": concluir um atendimento de hoje e abrir o popup com o mesmo cliente e servico.
    // ("Agendar o proximo" aparece logo depois de concluir pelo modal de conclusao - agendamento com horario, legado.)
    const { year, month, day } = parseDateKey(businessToday());
    const startAt = zonedInstant(E2E_BUSINESS_TZ, year, month, day, 10, 0);
    await prisma.appointment.create({
      data: {
        businessId: seed.businessId, clientId: seed.clientId, startAt, endAt: new Date(startAt.getTime() + 30 * 60_000),
        services: { create: [{ productId: seed.serviceId, nameSnapshot: "Corte Popup", durationMinutesSnapshot: 30, position: 0 }] },
      },
    });
    await gotoHydrated(page, `/agenda?view=day&day=${businessToday()}`);
    const row = page.getByTestId("appointment-row").first();
    await row.getByRole("button", { name: "Concluir" }).click();
    await page.locator("#completeCategoryId").selectOption({ label: "Venda de serviços" });
    await page.getByRole("button", { name: "Concluir atendimento" }).click();
    await row.getByRole("button", { name: "Agendar o próximo" }).click();
    await waitFor(page);
    await expect(popup(page).getByText("Cliente Popup")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`novo=1.*clientId=${seed.clientId}.*serviceId=${seed.serviceId}`));
    await next(page);
    await expect(page.getByTestId("day-appointment-total")).toHaveText("R$ 80,00");
  });

  test("10) a edição /agenda/[id]/editar continua sendo página, como antes", async ({ page }) => {
    const category = await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE", name: "Venda de serviços" } });
    const appointment = await prisma.appointment.create({
      data: {
        businessId: seed.businessId, clientId: seed.clientId, kind: "DAY", status: "AGENDADO", autoCompleteEligible: true,
        scheduledOn: new Date(`${businessToday(3)}T00:00:00Z`), categoryId: category.id, paymentTiming: "AVISTA",
        services: { create: [{ productId: seed.serviceId, nameSnapshot: "Corte Popup", unitPrice: new Decimal(80), quantity: 1, position: 0 }] },
      },
    });
    await gotoHydrated(page, `/agenda/${appointment.id}/editar`);
    await expect(page.getByRole("heading", { name: "Editar agendamento" })).toBeVisible();
    await expect(popup(page)).toHaveCount(0);
    await expect(page.getByLabel("Título (opcional)")).toBeVisible();
    await expect(page.getByTestId("day-appointment-total")).toHaveText("R$ 80,00");
    await expect(page.getByLabel("Data do atendimento")).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar alterações" })).toBeVisible();
    await page.getByLabel("Quantidade").first().fill("2");
    await expect(page.getByTestId("day-appointment-total")).toHaveText("R$ 160,00");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page).toHaveURL(/view=day/);
  });

  test("11) celular (375 px): o popup cabe na tela e a lista do picker fica visível", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await openFromAgenda(page);
    const box = (await popup(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByRole("combobox", { name: "Buscar cliente" }).fill("mar");
    const option = page.getByRole("option", { name: "Maria Popup" });
    await expect(option).toBeVisible();
    await expect(option).toBeInViewport(); // a lista esta no fluxo do popup: nao e cortada
    await option.click();
    await expect(page.getByLabel("WhatsApp (opcional)")).toBeVisible();
    await next(page);
    await page.getByLabel("Adicionar serviço").selectOption({ label: "Corte Popup" });
    await expect(page.getByLabel("Valor unitário")).toBeVisible();
    await expect(popup(page).getByRole("button", { name: "Próximo" })).toBeVisible();
    await expect(stepCounter(page)).toBeVisible();
  });

  for (const theme of ["light", "dark"] as const) {
    test(`12) axe: 0 violações em cada passo, no modal de cliente empilhado e no 'Descartar' — tema ${theme}`, async ({ page, context, baseURL }) => {
      test.setTimeout(120_000);
      await context.addCookies([{ name: "theme", value: theme, url: baseURL! }]);
      const scan = async (label: string) => {
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} ${n.html.slice(0, 140)} :: ${(n.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 220)}`).join(" | ")}`), `${label} (${theme})`).toEqual([]);
      };

      await openFromAgenda(page);
      await scan("passo 1");
      await pickClient(page, "cliente pop", "Cliente Popup");
      await scan("passo 1 com cliente e WhatsApp");
      await next(page);
      await page.getByLabel("Adicionar serviço").selectOption({ label: "Corte Popup" });
      await scan("passo 2 (com servico)");
      await next(page);
      await scan("passo 3");
      await next(page);
      await scan("passo 4");
      await page.getByRole("button", { name: "A prazo" }).click();
      await scan("passo 4 a prazo");

      await back(page);
      await back(page);
      await back(page);
      await page.getByRole("button", { name: "Trocar" }).click();
      await popup(page).getByRole("button", { name: /Criar novo cliente/ }).click();
      await expect(clientDialog(page)).toBeVisible();
      await scan("modal de cliente empilhado");
      await clientDialog(page).getByRole("button", { name: "Cancelar" }).click();

      await page.getByLabel("Título (opcional)").focus(); // (com o foco na busca, o 1o Esc fecharia so a lista)
      await page.keyboard.press("Escape");
      await expect(discardDialog(page)).toBeVisible();
      await scan("Descartar agendamento?");
    });
  }

  test("confirmação pós-salvar aparece e some sozinha", async ({ page }) => {
    await openFromAgenda(page);
    await page.getByLabel("Título (opcional)").fill("Confirmacao");
    await next(page);
    await next(page);
    await save(page);
    await expect(savedNotice(page)).toBeVisible();
    await expect(savedNotice(page)).toHaveCount(0, { timeout: 15_000 }); // some depois de alguns segundos
  });
});

async function waitFor(page: Page) {
  await expect(popup(page)).toBeVisible();
  await expect(popup(page).getByLabel("Título (opcional)")).toBeVisible();
}

// ---------------------------------------------------------------------------------------------------------------------
// Limite de 40 caracteres em phone/whatsapp (front); o back esta em tests/integration/agenda/clientWhatsapp.test.ts.
test.describe("limite de 40 caracteres (WhatsApp/Telefone)", () => {
  test("popup: o campo tem maxlength 40; 41 caracteres (colados por script) são recusados no Próximo; 40 passam", async ({ page }) => {
    await openFromAgenda(page);
    await pickClient(page, "cliente pop", "Cliente Popup");
    const whatsapp = page.getByLabel("WhatsApp (opcional)");
    await expect(whatsapp).toHaveAttribute("maxlength", "40");
    await setUnbounded(whatsapp, "9".repeat(41)); // simula colar/preencher por script (o maxlength barra a digitacao)
    await next(page);
    await expect(popup(page).locator('p[role="alert"]')).toHaveText("Use no máximo 40 caracteres.");
    await expect(whatsapp).toHaveAttribute("aria-invalid", "true");
    await expect(whatsapp).toBeFocused();
    await expect(stepCounter(page)).toHaveText("1/3");
    await whatsapp.fill("9".repeat(40));
    await next(page);
    await expect(stepCounter(page)).toHaveText("2/3");
  });

  test("cadastro de cliente (/clientes): Telefone e WhatsApp com maxlength 40; 41 recusado, 40 salva", async ({ page }) => {
    await gotoHydrated(page, "/clientes");
    await page.getByRole("button", { name: "Novo cliente", exact: true }).first().click();
    const dialog = clientDialog(page);
    await dialog.getByLabel("Nome", { exact: true }).fill("Cliente Limite E2E");
    await expect(dialog.getByLabel("Telefone (opcional)")).toHaveAttribute("maxlength", "40");
    await expect(dialog.getByLabel("WhatsApp (opcional)")).toHaveAttribute("maxlength", "40");
    await setUnbounded(dialog.getByLabel("Telefone (opcional)"), "1".repeat(41));
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect(dialog.locator('p[role="alert"]')).toHaveText("Use no máximo 40 caracteres.");
    expect(await prisma.client.count({ where: { businessId: seed.businessId, name: "Cliente Limite E2E" } })).toBe(0);
    await dialog.getByLabel("Telefone (opcional)").fill("1".repeat(40));
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect(dialog).toHaveCount(0);
    const created = await prisma.client.findFirstOrThrow({ where: { businessId: seed.businessId, name: "Cliente Limite E2E" } });
    expect(created.phone).toBe("1".repeat(40));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Pagina de edicao: o botao inativo "A vista/A prazo" agora tem contraste AA (mesma classe do popup).
test.describe("axe na edição com o botão de pagamento inativo", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`/agenda/[id]/editar — tema ${theme}: 0 violações com 'A prazo' inativo e com 'À vista' inativo`, async ({ page, context, baseURL }) => {
      test.setTimeout(90_000);
      await context.addCookies([{ name: "theme", value: theme, url: baseURL! }]);
      const category = await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE", name: "Venda de serviços" } });
      const appointment = await prisma.appointment.create({
        data: {
          businessId: seed.businessId, clientId: seed.clientId, kind: "DAY", status: "AGENDADO", autoCompleteEligible: true,
          scheduledOn: new Date(`${businessToday(3)}T00:00:00Z`), categoryId: category.id, paymentTiming: "AVISTA",
          services: { create: [{ productId: seed.serviceId, nameSnapshot: "Corte Popup", unitPrice: new Decimal(80), quantity: 1, position: 0 }] },
        },
      });
      await gotoHydrated(page, `/agenda/${appointment.id}/editar`);
      const scan = async (label: string) => {
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} ${n.html.slice(0, 120)}`).join(" | ")}`), `${label} (${theme})`).toEqual([]);
      };
      await expect(page.getByRole("button", { name: "A prazo" })).toHaveAttribute("aria-pressed", "false"); // inativo visivel
      await scan("edicao: A prazo inativo");
      await page.getByRole("button", { name: "A prazo" }).click();
      await expect(page.getByRole("button", { name: "À vista" })).toHaveAttribute("aria-pressed", "false");
      await scan("edicao: A vista inativo");
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Botao Voltar do navegador com o popup aberto (aberto por history.pushState).
test.describe("botão Voltar do navegador", () => {
  const onAgenda = (page: Page) => expect(page.getByRole("heading", { name: "Agenda", level: 1 })).toBeVisible();
  const hasPopupParam = (page: Page) => new URL(page.url()).searchParams.has("novo");

  test("sem dado preenchido: o popup fecha e o usuário continua na Agenda", async ({ page }) => {
    await openFromAgenda(page);
    expect(hasPopupParam(page)).toBe(true);
    await page.goBack();
    await expect(popup(page)).toHaveCount(0);
    await expect(discardDialog(page)).toHaveCount(0);
    expect(hasPopupParam(page)).toBe(false);
    expect(new URL(page.url()).pathname).toBe("/agenda");
    await onAgenda(page);
  });

  test("com dado preenchido: o popup continua aberto (URL restaurada) e pergunta 'Descartar agendamento?'; Continuar editando mantém tudo; Descartar fecha e limpa a URL", async ({ page }) => {
    await openFromAgenda(page);
    await page.getByLabel("Título (opcional)").fill("Dado que nao pode sumir");
    await page.getByLabel("Título (opcional)").press("Tab");

    await page.goBack();
    await expect(popup(page)).toBeVisible();
    await expect(discardDialog(page)).toBeVisible();
    expect(hasPopupParam(page)).toBe(true); // URL do popup restaurada
    expect(new URL(page.url()).pathname).toBe("/agenda");

    await discardDialog(page).getByRole("button", { name: "Continuar editando" }).click();
    await expect(discardDialog(page)).toHaveCount(0);
    await expect(popup(page)).toBeVisible();
    await expect(page.getByLabel("Título (opcional)")).toHaveValue("Dado que nao pode sumir");

    // De novo: Voltar pergunta outra vez; Descartar fecha e deixa a URL limpa.
    await page.goBack();
    await expect(discardDialog(page)).toBeVisible();
    await discardDialog(page).getByRole("button", { name: "Descartar" }).click();
    await expect(popup(page)).toHaveCount(0);
    expect(hasPopupParam(page)).toBe(false);
    expect(new URL(page.url()).search).toBe("");
    await onAgenda(page);
    expect(await appointments()).toHaveLength(0);
  });

  test("Avançar depois de fechar NÃO reabre um popup fantasma com dados antigos: reabre VAZIO", async ({ page }) => {
    await openFromAgenda(page);
    await page.goBack(); // sem dado: fecha
    await expect(popup(page)).toHaveCount(0);
    await page.goForward();
    await expect(popup(page)).toBeVisible(); // a URL voltou a ter ?novo=1: reabre, mas do zero
    await expect(page.getByLabel("Título (opcional)")).toHaveValue("");
    await expect(stepCounter(page)).toHaveText("1/3");
    expect(await appointments()).toHaveLength(0);
  });

  test("chegando pelo link antigo /agenda/novo: o Voltar cai na própria Agenda (sem sair dela)", async ({ page }) => {
    await page.goto("about:blank");
    await page.goto("/agenda/novo");
    await waitFor(page);
    await page.goBack();
    await expect(popup(page)).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/agenda");
    expect(hasPopupParam(page)).toBe(false);
    await onAgenda(page);
  });
});

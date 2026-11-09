import { test, expect, type Page } from "@playwright/test";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { gotoHydrated } from "./helpers/hydration";
import { fillMoney } from "./helpers/money";
import { E2E_BUSINESS_TZ, businessToday } from "./helpers/businessDate";
import { assertTestDatabase, loadTestEnv } from "../testEnv";
import { dateKeyToDbDate, formatDateKey, zonedInstant, parseDateKey } from "../../src/lib/time/zoned";

// Agenda. Desde a Agenda A3 toda criacao pela tela e do fluxo POR DIA (DAY):
// cliente, servicos com valor, dia, categoria e pagamento - sem horario. Os
// agendamentos antigos COM HORARIO (TIMED) continuam visiveis e operaveis;
// como a tela nao cria mais TIMED, eles sao gravados direto no banco de
// teste para cobrir exibir / confirmar / concluir / cancelar do legado.

loadTestEnv();
assertTestDatabase();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const { Decimal } = Prisma;

const PASSWORD = "SenhaValida123";

function uniqueEmail(prefix = "agenda") {
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

// Formulario por dia: cliente novo + servicos novos (sem duracao), com preco.
async function fillNewDayAppointment(page: Page, clientName: string, services: { name: string; price: string }[]) {
  // "Criar novo cliente" abre o MESMO pop-up de cadastro da pagina Clientes.
  await page.getByRole("button", { name: "+ Criar novo cliente" }).click();
  const clientDialog = page.getByRole("dialog");
  await clientDialog.getByLabel("Nome", { exact: true }).fill(clientName);
  await clientDialog.getByRole("button", { name: "Salvar" }).click();
  await expect(clientDialog).toHaveCount(0);
  await expect(page.getByText(clientName)).toBeVisible();

  for (const [index, service] of services.entries()) {
    await page.getByRole("button", { name: "Criar novo serviço" }).click();
    await page.getByLabel("Nome do serviço").fill(service.name);
    await fillMoney(page.getByLabel("Preço (opcional)"), service.price);
    await page.getByRole("button", { name: "Criar serviço" }).click();
    await expect(page.getByLabel("Valor unitário").nth(index)).toBeVisible();
  }
  await expect(page.getByLabel("Duração (min)")).toHaveCount(0); // o fluxo por dia nao tem duracao
  await expect(page.locator("#startAt")).toHaveCount(0); // nem horario
}

function confirmDialog(page: Page) {
  return page.getByRole("alertdialog");
}

function row(page: Page, clientName: string) {
  return page.getByTestId("appointment-row").filter({ hasText: clientName });
}

test.describe("Agenda - fluxo por dia", () => {
  test("à vista: criar pela tela, ver no Dia e no Mês com os totais, editar, concluir agora e conferir Vendas e Receitas no dia do atendimento", async ({ page }) => {
    test.setTimeout(90_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await register(page, "Dono Agenda E2E", uniqueEmail());
    await completeOnboarding(page, "Empresa Agenda E2E");
    const today = businessToday();

    await gotoHydrated(page, "/agenda");
    await page.getByRole("link", { name: "Novo agendamento", exact: true }).click();
    await expect(page).toHaveURL(/\/agenda\/novo/);
    await fillNewDayAppointment(page, "Cliente Dia E2E", [{ name: "Corte Dia E2E", price: "80" }, { name: "Barba Dia E2E", price: "30" }]);

    // Padroes: hoje da empresa, categoria de receita de servicos, a vista.
    await expect(page.getByLabel("Data do atendimento")).toHaveValue(today);
    await expect(page.getByLabel("Categoria de receita").locator("option:checked")).toHaveText("Venda de serviços");
    await expect(page.getByRole("button", { name: "À vista" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("day-appointment-total")).toHaveText("110");
    await page.getByLabel("Meio de pagamento (opcional)").selectOption({ label: "Dinheiro" });
    await page.getByRole("button", { name: "Agendar" }).click();

    // Volta na aba Dia, no dia do atendimento.
    await expect(page).toHaveURL(new RegExp(`/agenda\\?view=day&day=${today}`));
    const appointment = row(page, "Cliente Dia E2E");
    await expect(appointment).toBeVisible();
    await expect(appointment.getByText("Agendado", { exact: true })).toBeVisible();
    await expect(appointment.getByText("Corte Dia E2E, Barba Dia E2E")).toBeVisible();
    await expect(appointment.getByText("· À vista · Dinheiro")).toBeVisible();
    await expect(page.getByText("Total do dia: 1 atendimento · R$110.00")).toBeVisible();
    await expect(appointment.getByRole("button", { name: "Confirmar" })).toHaveCount(0); // sem CONFIRMADO no fluxo por dia

    // Editar: 2 cortes -> total 190.
    await appointment.getByRole("link", { name: "Editar" }).click();
    await expect(page.getByRole("heading", { name: "Editar agendamento" })).toBeVisible();
    await page.getByLabel("Quantidade").first().fill("2");
    await expect(page.getByTestId("day-appointment-total")).toHaveText("190");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page).toHaveURL(new RegExp(`view=day&day=${today}`));
    await expect(row(page, "Cliente Dia E2E").getByText("Corte Dia E2E × 2, Barba Dia E2E")).toBeVisible();
    await expect(page.getByText("Total do dia: 1 atendimento · R$190.00")).toBeVisible();

    // Aba Mes: total do mes e do dia.
    await page.getByRole("link", { name: "Mês" }).click();
    await expect(page).toHaveURL(/view=month/);
    await expect(page.getByText("Total do mês: 1 atendimento · R$190.00")).toBeVisible();
    await expect(page.getByTestId(`agenda-day-${today}`).getByText("Total do dia: 1 atendimento · R$190.00")).toBeVisible();

    // Concluir agora (aba Mes - mesmo componente de linha das outras abas).
    await row(page, "Cliente Dia E2E").getByRole("button", { name: "Concluir agora" }).click();
    await confirmDialog(page).getByRole("button", { name: "Concluir agora" }).click();
    const saleLink = row(page, "Cliente Dia E2E").getByRole("link", { name: /Ver venda #\d+/ });
    await expect(saleLink).toBeVisible();
    await expect(row(page, "Cliente Dia E2E").getByText("Concluído", { exact: true })).toBeVisible();
    const saleNumber = /#(\d+)/.exec((await saleLink.textContent()) ?? "")![1];

    // Vendas: a venda, paga, no dia do atendimento.
    await gotoHydrated(page, "/vendas");
    const salesRow = page.getByRole("row", { name: /Cliente Dia E2E/ });
    await expect(salesRow.getByText(`#${saleNumber}`)).toBeVisible();
    await expect(salesRow.getByText(formatDateKey(today))).toBeVisible();
    await expect(salesRow.getByText("Paga", { exact: true })).toBeVisible();

    // Receitas: o lancamento a vista no dia do atendimento.
    await gotoHydrated(page, "/financeiro/receitas");
    const revenueRow = page.getByRole("row", { name: new RegExp(`Venda #${saleNumber}\\b`) });
    await expect(revenueRow.getByText(formatDateKey(today))).toBeVisible();
    await expect(revenueRow.getByText("R$190.00")).toBeVisible();

    expect(consoleErrors, `Erros de console encontrados: ${consoleErrors.join("; ")}`).toEqual([]);
  });

  test("a prazo: criar com parcelas pela tela; cancelar e reabrir (sem conclusão automática depois)", async ({ page }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail("agenda-prazo");
    await register(page, "Dono Prazo E2E", email);
    await completeOnboarding(page, "Empresa Prazo E2E");
    const tomorrow = businessToday(1);

    await gotoHydrated(page, `/agenda/novo?date=${tomorrow}`);
    await fillNewDayAppointment(page, "Cliente Prazo E2E", [{ name: "Pacote Prazo E2E", price: "300" }]);
    await expect(page.getByLabel("Data do atendimento")).toHaveValue(tomorrow);
    await page.getByRole("button", { name: "A prazo" }).click();
    await page.getByLabel("Nº de parcelas").fill("3");
    await page.getByRole("button", { name: "Dividir igualmente" }).click();
    await expect(page.getByText("Soma das parcelas: 300 / 300")).toBeVisible();
    // Soma diferente do total: o formulario recusa antes de enviar.
    await fillMoney(page.getByLabel("Valor", { exact: true }).first(), "50");
    await page.getByRole("button", { name: "Agendar" }).click();
    await expect(page.locator('p[role="alert"]')).toHaveText("A soma das parcelas (250) não bate com o total do atendimento (300).");
    await fillMoney(page.getByLabel("Valor", { exact: true }).first(), "100");
    await page.getByRole("button", { name: "Agendar" }).click();

    await expect(page).toHaveURL(new RegExp(`view=day&day=${tomorrow}`));
    const appointment = row(page, "Cliente Prazo E2E");
    await expect(appointment.getByText("· A prazo · 3 parcelas")).toBeVisible();
    // Antes do dia do atendimento: sem "Concluir agora" nem "Faltou".
    await expect(appointment.getByRole("button", { name: "Concluir agora" })).toHaveCount(0);
    await expect(appointment.getByRole("button", { name: "Faltou" })).toHaveCount(0);

    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { business: true } });
    const stored = await prisma.appointment.findFirstOrThrow({ where: { businessId: user.business!.id }, include: { installments: true } });
    expect([stored.kind, stored.autoCompleteEligible, stored.installments.length]).toEqual(["DAY", true, 3]);

    await appointment.getByRole("button", { name: "Cancelar" }).click();
    await confirmDialog(page).getByRole("button", { name: "Cancelar agendamento" }).click();
    await expect(appointment.getByText("Cancelado", { exact: true })).toBeVisible();
    await expect(page.getByText("Total do dia: 0 atendimentos · R$0.00")).toBeVisible();

    await appointment.getByRole("button", { name: "Reabrir" }).click();
    await expect(confirmDialog(page)).toContainText("NÃO será concluído automaticamente");
    await confirmDialog(page).getByRole("button", { name: "Reabrir" }).click();
    await expect(appointment.getByText("Agendado", { exact: true })).toBeVisible();
    const reopened = await prisma.appointment.findUniqueOrThrow({ where: { id: stored.id } });
    expect([reopened.status, reopened.autoCompleteEligible]).toEqual(["AGENDADO", false]);
  });

  // Mesmo calculo de formatAgendaMonthYear (src/lib/agenda/time.ts) no fuso
  // da empresa de teste - so para um seletor estavel do titulo do mes.
  function currentMonthLabel(): string {
    const label = new Intl.DateTimeFormat("pt-BR", { timeZone: E2E_BUSINESS_TZ, month: "long", year: "numeric" }).format(new Date());
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  test("Calendário: navega entre meses, troca de ano pelo seletor, e clica num dia com ponto", async ({ page }) => {
    test.setTimeout(60_000);
    await register(page, "Dono Calendario E2E", uniqueEmail("agenda-cal"));
    await completeOnboarding(page, "Empresa Calendario E2E");

    // Um agendamento hoje, so para o dia de hoje ter o "pontinho".
    await gotoHydrated(page, "/agenda/novo");
    await fillNewDayAppointment(page, "Cliente Calendario E2E", [{ name: "Corte Calendario E2E", price: "80" }]);
    await page.getByRole("button", { name: "Agendar" }).click();
    await expect(page).toHaveURL(/\/agenda\?view=day/);
    await page.getByRole("link", { name: "Calendário" }).click();

    // exact: cada dia da grade e um botao cujo nome contem o mes/ano.
    const monthTitle = page.getByRole("button", { name: currentMonthLabel(), exact: true });
    await expect(monthTitle).toBeVisible();

    await page.getByRole("button", { name: "Mês anterior" }).click();
    await expect(monthTitle).not.toBeVisible();
    await page.getByRole("button", { name: "Próximo mês" }).click();
    await expect(monthTitle).toBeVisible();

    await monthTitle.click();
    const yearText = page.getByText(new RegExp(`^\\d{4}$`)).first();
    const initialYear = Number(await yearText.textContent());
    await page.getByRole("button", { name: "Próximo ano" }).click();
    await expect(page.getByText(String(initialYear + 1), { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Ano anterior" }).click();
    await expect(page.getByText(String(initialYear), { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Jan", exact: true }).click();
    await expect(page.getByRole("button", { name: "Jan", exact: true })).not.toBeVisible();

    await page.getByRole("button", { name: "Hoje" }).click();
    await expect(monthTitle).toBeVisible();

    const todayCell = page.locator('button[aria-current="date"]');
    await expect(todayCell).toBeVisible();
    await expect(page.getByText("Cliente Calendario E2E")).toBeVisible();

    const otherDay = page.locator("button[data-date-key]:not([aria-current='date'])").first();
    await otherDay.click();
    await expect(page.getByText("Nenhum agendamento neste dia.")).toBeVisible();

    await todayCell.click();
    await expect(page.getByText("Cliente Calendario E2E")).toBeVisible();
  });
});

test.describe("Agenda - legado com horário (TIMED, gravado no banco)", () => {
  // A tela nao cria mais TIMED: grava dois agendamentos com horario hoje
  // (10:00 e 14:00 no fuso da empresa) para a empresa recem-criada.
  async function seedTimed(email: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { business: true } });
    const businessId = user.business!.id;
    const client = await prisma.client.create({ data: { businessId, name: "Cliente Legado E2E" } });
    const service = await prisma.product.create({
      data: { businessId, name: "Corte Legado E2E", type: "SERVICO", durationMinutes: 30, defaultPrice: new Decimal(80) },
    });
    const { year, month, day } = parseDateKey(businessToday());
    for (const hour of [10, 14]) {
      const startAt = zonedInstant(E2E_BUSINESS_TZ, year, month, day, hour, 0);
      await prisma.appointment.create({
        data: {
          businessId,
          clientId: client.id,
          startAt,
          endAt: new Date(startAt.getTime() + 30 * 60_000),
          services: { create: [{ productId: service.id, nameSnapshot: "Corte Legado E2E", durationMinutesSnapshot: 30, position: 0 }] },
        },
      });
    }
  }

  test("exibe com horário (antes dos agendamentos por dia), confirma, conclui pelo modal e cancela - como antes", async ({ page }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail("agenda-legado");
    await register(page, "Dono Legado E2E", email);
    await completeOnboarding(page, "Empresa Legado E2E");
    await seedTimed(email);

    // Um agendamento por dia no mesmo dia: os TIMED vem primeiro, pelo horario.
    await gotoHydrated(page, "/agenda/novo");
    await fillNewDayAppointment(page, "Cliente Por Dia E2E", [{ name: "Escova E2E", price: "40" }]);
    await page.getByRole("button", { name: "Agendar" }).click();
    await expect(page).toHaveURL(/view=day/);

    const rows = page.getByTestId("appointment-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("10:00–10:30");
    await expect(rows.nth(1)).toContainText("14:00–14:30");
    await expect(rows.nth(2)).toContainText("Cliente Por Dia E2E");

    const first = rows.nth(0);
    await first.getByRole("button", { name: "Confirmar" }).click();
    await expect(first.getByText("Confirmado", { exact: true })).toBeVisible();

    await first.getByRole("button", { name: "Concluir" }).click();
    await expect(page.getByRole("heading", { name: "Concluir atendimento" })).toBeVisible();
    await page.locator("#completeCategoryId").selectOption({ label: "Venda de serviços" });
    await page.getByRole("button", { name: "A prazo" }).click();
    await page.getByRole("button", { name: "Concluir atendimento" }).click();
    await expect(page.getByRole("link", { name: /ver venda #\d+/i })).toBeVisible();

    const second = rows.nth(1);
    await second.getByRole("button", { name: "Cancelar" }).click();
    await confirmDialog(page).getByRole("button", { name: "Cancelar agendamento" }).click();
    await expect(second.getByText("Cancelado", { exact: true })).toBeVisible();
  });

  // Agenda A4: depois de concluir pelo modal, o Desfazer aparece na linha sem
  // recarregar a pagina (a linha recarrega os dados como no fluxo por dia).
  test("concluir pelo modal (à vista) mostra Desfazer sem recarregar; desfazer volta para Agendado", async ({ page }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail("agenda-legado-desfazer");
    await register(page, "Dono Legado Desfazer E2E", email);
    await completeOnboarding(page, "Empresa Legado Desfazer E2E");
    await seedTimed(email);

    await gotoHydrated(page, `/agenda?view=day&day=${businessToday()}`);
    const first = page.getByTestId("appointment-row").nth(0);
    await expect(first).toContainText("10:00–10:30");
    await first.getByRole("button", { name: "Concluir" }).click();
    await page.locator("#completeCategoryId").selectOption({ label: "Venda de serviços" });
    await page.getByRole("button", { name: "Concluir atendimento" }).click();
    await expect(first.getByRole("link", { name: /ver venda #\d+/i })).toBeVisible();

    // Sem reload: o Desfazer ja esta la e, com os dados recarregados, o
    // dialogo mostra o valor recebido a vista.
    await expect(first.getByText("Concluído", { exact: true })).toBeVisible();
    await first.getByRole("button", { name: "Desfazer" }).click();
    const dialog = confirmDialog(page);
    await expect(dialog.getByTestId("undo-received-amount")).toContainText("R$80.00");
    await dialog.getByLabel("Concluí por engano").check();
    await dialog.getByRole("button", { name: "Desfazer conclusão" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 }); // 1a chamada da rota /undo compila no `next dev`
    await expect(first.getByText("Agendado", { exact: true })).toBeVisible();
    await expect(first.getByRole("button", { name: "Concluir" })).toBeVisible();

    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { business: true } });
    const sales = await prisma.sale.findMany({ where: { businessId: user.business!.id } });
    expect(sales.map((s) => s.status)).toEqual(["CANCELLED"]);
  });
});

test.describe("Agenda - desfazer conclusão (A4)", () => {
  // Saldo inicial configurado (500, 30 dias atras): o Caixa mostra 500 + o
  // que for recebido.
  async function configureOpeningBalance(email: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { business: true } });
    await prisma.business.update({
      where: { id: user.business!.id },
      data: { openingBalance: new Decimal(500), openingBalanceOn: dateKeyToDbDate(businessToday(-30)) },
    });
    return user.business!.id;
  }

  async function expectCash(page: Page, amount: string) {
    await gotoHydrated(page, "/caixa");
    await expect(page.getByText("Caixa atual (histórico e realizado)").locator("xpath=following-sibling::p[1]")).toHaveText(amount);
  }

  async function createAndCompleteToday(page: Page, clientName: string) {
    await gotoHydrated(page, "/agenda/novo");
    await fillNewDayAppointment(page, clientName, [{ name: `Serviço ${clientName}`, price: "100" }]);
    await page.getByRole("button", { name: "Agendar" }).click();
    await expect(page).toHaveURL(/view=day/);
    return completeNow(page, clientName);
  }

  async function completeNow(page: Page, clientName: string) {
    await row(page, clientName).getByRole("button", { name: "Concluir agora" }).click();
    await confirmDialog(page).getByRole("button", { name: "Concluir agora" }).click();
    const saleLink = row(page, clientName).getByRole("link", { name: /Ver venda #\d+/ });
    await expect(saleLink).toBeVisible();
    return /#(\d+)/.exec((await saleLink.textContent()) ?? "")![1];
  }

  async function undo(page: Page, clientName: string, option: string) {
    await row(page, clientName).getByRole("button", { name: "Desfazer" }).click();
    const dialog = confirmDialog(page);
    await expect(dialog).toContainText("não será mais concluído automaticamente");
    await dialog.getByLabel(option).check();
    return dialog;
  }

  // O dialogo fecha quando a rota responde. Espera maior: a primeira chamada
  // da rota /undo no `next dev` inclui a compilacao dela.
  async function confirmUndo(page: Page) {
    await confirmDialog(page).getByRole("button", { name: "Desfazer conclusão" }).click();
    await expect(confirmDialog(page)).toHaveCount(0, { timeout: 30_000 });
  }

  test("concluir agora -> desfazer (o cliente não veio): Caixa e receita do dia voltam ao valor anterior", async ({ page }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail("agenda-desfazer");
    await register(page, "Dono Desfazer E2E", email);
    await completeOnboarding(page, "Empresa Desfazer E2E");
    const businessId = await configureOpeningBalance(email);
    await expectCash(page, "R$500.00");

    const saleNumber = await createAndCompleteToday(page, "Cliente Desfazer E2E");
    await expectCash(page, "R$600.00");
    await gotoHydrated(page, "/financeiro/receitas");
    await expect(page.getByRole("row", { name: new RegExp(`Venda #${saleNumber}\\b`) })).toBeVisible();

    await gotoHydrated(page, `/agenda?view=day&day=${businessToday()}`);
    const dialog = await undo(page, "Cliente Desfazer E2E", "O cliente não veio");
    await expect(dialog.getByTestId("undo-received-amount")).toHaveText(
      "O recebimento de R$100.00 será estornado: o valor sai do Caixa e do Dashboard."
    );
    await expect(dialog).toContainText(`A venda #${saleNumber} será cancelada.`);
    await confirmUndo(page);
    await expect(row(page, "Cliente Desfazer E2E").getByText("Faltou", { exact: true })).toBeVisible();
    await expect(row(page, "Cliente Desfazer E2E").getByRole("button", { name: "Reabrir" })).toBeVisible();

    await expectCash(page, "R$500.00");
    await gotoHydrated(page, "/financeiro/receitas");
    await expect(page.getByRole("row", { name: new RegExp(`Venda #${saleNumber}\\b`) })).toHaveCount(0);

    const sale = await prisma.sale.findFirstOrThrow({ where: { businessId, saleNumber: Number(saleNumber) } });
    expect(sale.status).toBe("CANCELLED");
  });

  // Agenda A5: conclusao AUTOMATICA na carga de pagina (aqui, o Dashboard).
  test("conclusão automática: DAY de ontem elegível é concluído ao abrir o Dashboard; desfazer devolve o Caixa e não reconclui", async ({ page }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail("agenda-auto");
    await register(page, "Dono Auto E2E", email);
    await completeOnboarding(page, "Empresa Auto E2E");
    const businessId = await configureOpeningBalance(email);
    const yesterday = businessToday(-1);

    const category = await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE", name: "Venda de serviços" } });
    const client = await prisma.client.create({ data: { businessId, name: "Cliente Auto E2E" } });
    const product = await prisma.product.create({ data: { businessId, name: "Corte Auto E2E", type: "SERVICO", defaultPrice: new Decimal(70) } });
    const seeded = await prisma.appointment.create({
      data: {
        businessId, clientId: client.id, kind: "DAY", status: "AGENDADO", autoCompleteEligible: true,
        scheduledOn: dateKeyToDbDate(yesterday), categoryId: category.id, paymentTiming: "AVISTA", paymentMethod: "PIX",
        services: { create: [{ productId: product.id, nameSnapshot: "Corte Auto E2E", unitPrice: new Decimal(70), quantity: 1, position: 0 }] },
      },
    });

    await gotoHydrated(page, "/dashboard");
    await expect.poll(async () => (await prisma.appointment.findUniqueOrThrow({ where: { id: seeded.id } })).status).toBe("CONCLUIDO");

    await gotoHydrated(page, `/agenda?view=day&day=${yesterday}`);
    const appointment = row(page, "Cliente Auto E2E");
    await expect(appointment.getByText("Concluído", { exact: true })).toBeVisible();
    const saleNumber = /#(\d+)/.exec((await appointment.getByRole("link", { name: /Ver venda #\d+/ }).textContent()) ?? "")![1];

    // 90 dias: ontem pode ser do mes anterior (o padrao da lista e o mes corrente).
    await gotoHydrated(page, "/financeiro/receitas?period=LAST_90_DAYS");
    const revenueRow = page.getByRole("row", { name: new RegExp(`Venda #${saleNumber}\\b`) });
    await expect(revenueRow.getByText(formatDateKey(yesterday))).toBeVisible();
    await expect(revenueRow.getByText("R$70.00")).toBeVisible();
    await expectCash(page, "R$570.00");

    await gotoHydrated(page, `/agenda?view=day&day=${yesterday}`);
    await undo(page, "Cliente Auto E2E", "O cliente não veio");
    await confirmUndo(page);
    await expect(appointment.getByText("Faltou", { exact: true })).toBeVisible();
    await expectCash(page, "R$500.00");

    // Recarregar (Dashboard e Agenda) nao reconclui: fica Faltou, so a venda cancelada.
    await gotoHydrated(page, "/dashboard");
    await gotoHydrated(page, `/agenda?view=day&day=${yesterday}`);
    await expect(appointment.getByText("Faltou", { exact: true })).toBeVisible();
    const sales = await prisma.sale.findMany({ where: { businessId } });
    expect(sales.map((s) => s.status)).toEqual(["CANCELLED"]);
  });

  test("concluir -> desfazer (concluí por engano) -> concluir de novo: uma venda nova ativa e a antiga cancelada", async ({ page }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail("agenda-reconcluir");
    await register(page, "Dono Reconcluir E2E", email);
    await completeOnboarding(page, "Empresa Reconcluir E2E");
    const businessId = await configureOpeningBalance(email);

    const firstNumber = await createAndCompleteToday(page, "Cliente Reconcluir E2E");
    await undo(page, "Cliente Reconcluir E2E", "Concluí por engano");
    await confirmUndo(page);
    await expect(row(page, "Cliente Reconcluir E2E").getByText("Agendado", { exact: true })).toBeVisible();

    const secondNumber = await completeNow(page, "Cliente Reconcluir E2E");
    expect(secondNumber).not.toBe(firstNumber);

    const sales = await prisma.sale.findMany({ where: { businessId }, orderBy: { saleNumber: "asc" } });
    expect(sales.map((s) => [s.saleNumber, s.status])).toEqual([
      [Number(firstNumber), "CANCELLED"],
      [Number(secondNumber), "CONFIRMED"],
    ]);
    const appointment = await prisma.appointment.findFirstOrThrow({ where: { businessId } });
    expect([appointment.status, appointment.saleId, appointment.completionSeq, appointment.autoCompleteEligible]).toEqual([
      "CONCLUIDO", sales[1].id, 1, false,
    ]);
    await expectCash(page, "R$600.00");
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

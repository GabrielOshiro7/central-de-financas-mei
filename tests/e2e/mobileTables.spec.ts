import { test, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { gotoHydrated } from "./helpers/hydration";

// Lote 3 do audit de UX: abaixo de 768px cada linha de tabela vira um card
// (CSS puro em .rtable, src/app/globals.css). Os specs de desktop continuam
// rodando em 1280px; este arquivo prova que a versão estreita funciona de
// verdade: cabeçalho oculto, linha com cara de card, nada rolando na
// horizontal, campos essenciais visíveis, rótulo da coluna disponível pra
// leitor de tela e a ação principal da linha funcionando com um clique.
test.use({ viewport: { width: 390, height: 844 } });

const PASSWORD = "SenhaValida123";

function isoDate(daysFromToday = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function ok(response: Awaited<ReturnType<APIRequestContext["post"]>>, what: string) {
  expect(response.ok(), `${what}: ${response.status()} ${await response.text()}`).toBe(true);
  return response.json().catch(() => ({}));
}

// Cadastro, onboarding e dados via API (a UI desses fluxos já é coberta
// pelos specs de desktop) - o que interessa aqui é só a tabela.
async function setupBusiness(page: Page, label: string) {
  const request = page.context().request;
  const email = `mobile-${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
  await ok(
    await request.post("/api/auth/register", { data: { name: "Mobile E2E", email, password: PASSWORD, confirmPassword: PASSWORD } }),
    "register"
  );
  const answers: [number, unknown][] = [
    [1, { businessType: "LOJA" }],
    [2, { revenueModel: ["venda_produtos"] }],
    [3, { name: "Empresa Mobile E2E" }],
    [4, { yearsInBusiness: "DE_1_A_3_ANOS" }],
    [5, { employeeCount: 3 }],
    [6, { currency: "BRL", averageMonthlyRevenue: 10000 }],
  ];
  for (const [step, data] of answers) await ok(await request.post("/api/onboarding/answer", { data: { step, data } }), `answer ${step}`);
  await ok(await request.post("/api/onboarding/complete"), "complete");

  const category = async (type: "REVENUE" | "COST" | "EXPENSE", name: string): Promise<string> => {
    const json = await ok(await request.post("/api/financeiro/categories", { data: { type, name } }), `categoria ${name}`);
    return json.category?.id ?? json.id;
  };
  return { request, category };
}

async function createClientAndSale(page: Page, label: string) {
  const { request, category } = await setupBusiness(page, label);
  const revenue = await category("REVENUE", "Venda Mobile E2E");
  const client = await ok(
    await request.post("/api/clientes", { data: { name: "Cliente Mobile E2E", phone: "11 99999-0000" } }),
    "cliente"
  );
  const clientId: string = client.client?.id ?? client.id;
  const sale = await ok(
    await request.post("/api/vendas", {
      data: {
        clientRequestId: `mobile-${label}-${Date.now()}`,
        status: "CONFIRMED",
        clientId,
        categoryId: revenue,
        saleDate: isoDate(),
        items: [{ description: "Item mobile E2E", quantity: 2, unitPrice: 100 }],
        paymentMethod: "PIX",
        installments: [
          { dueDate: isoDate(), amount: 100 },
          { dueDate: isoDate(30), amount: 100 },
        ],
      },
    }),
    "venda"
  );
  return { clientId, saleId: (sale.sale?.id ?? sale.id) as string };
}

// O layout de card em si: cabeçalho fora da tela, <tr> como bloco com cantos
// arredondados, e a tabela inteira cabendo na largura (sem rolagem lateral).
async function expectCards(page: Page, table: Locator) {
  await expect(table.locator("thead")).toBeHidden();
  const card = table.locator("tbody tr").first();
  await expect(card).toBeVisible();
  const style = await card.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { display: cs.display, radius: cs.borderTopLeftRadius };
  });
  expect(style.display).toBe("grid");
  expect(style.radius).not.toBe("0px");
  const box = await table.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  return card;
}

// Rótulo da coluna lido por leitor de tela (span .rt-sr), não só o visual.
async function expectCellLabel(card: Locator, label: string, value: RegExp | string) {
  const cell = card.getByRole("cell", { name: new RegExp(`^${label}: `) });
  await expect(cell).toBeVisible();
  await expect(cell).toContainText(value);
}

test.describe("tabelas em tela estreita (390px)", () => {
  test.setTimeout(60_000);

  test("sidebar recolhida não vaza rótulos por cima do conteúdo", async ({ page }) => {
    await setupBusiness(page, "sidebar");
    await gotoHydrated(page, "/dashboard");
    const aside = page.locator("aside");
    await expect(aside.getByText("OrganizAI", { exact: true })).toBeHidden();
    await expect(aside.getByText("Sair", { exact: true })).toBeHidden();
    await expect(aside.getByText("Empresa Mobile E2E")).toBeHidden();
    expect((await aside.boundingBox())!.width).toBeLessThanOrEqual(73);
  });

  test("1. lançamentos (Despesas): card e Editar abre o formulário", async ({ page }) => {
    const { request, category } = await setupBusiness(page, "tx");
    const expense = await category("EXPENSE", "Despesa Mobile Cat");
    await ok(
      await request.post("/api/financeiro/transactions", {
        data: { type: "EXPENSE", occurredAt: isoDate(), description: "Despesa mobile E2E", categoryId: expense, amount: 120 },
      }),
      "lançamento"
    );
    await gotoHydrated(page, "/financeiro/despesas");
    const card = await expectCards(page, page.getByRole("table"));
    await expect(card.getByText("Despesa mobile E2E")).toBeVisible();
    await expectCellLabel(card, "Valor", /120/);
    await expectCellLabel(card, "Data", /\d{2}\/\d{2}\/\d{4}/);
    // "Tipo" (2ª coluna) é redundante com a aba e some no card.
    await expect(card.locator("td").nth(1)).toBeHidden();

    await card.getByRole("button", { name: "Editar" }).click();
    await expect(page.getByRole("dialog").getByLabel("Descrição")).toHaveValue("Despesa mobile E2E");
  });

  test("2 e 3. contas a pagar e contas recorrentes: Marcar como pago e Pausar", async ({ page }) => {
    const { request, category } = await setupBusiness(page, "bill");
    const cost = await category("COST", "Custo Mobile Cat");
    await ok(
      await request.post("/api/financeiro/bills", {
        data: {
          direction: "PAYABLE",
          categoryId: cost,
          description: "Conta mobile E2E",
          amount: 300,
          dueDate: isoDate(5),
          counterpartyName: "Fornecedor Mobile",
        },
      }),
      "conta"
    );
    await ok(
      await request.post("/api/financeiro/bills/recurring", {
        data: {
          direction: "PAYABLE",
          categoryId: cost,
          description: "Aluguel recorrente mobile E2E",
          amount: 900,
          frequency: "MONTHLY",
          dayOfMonth: 28,
          startDate: isoDate(40),
        },
      }),
      "conta recorrente"
    );
    await gotoHydrated(page, "/financeiro/pagar");

    const bills = page.getByRole("table").filter({ hasText: "Conta mobile E2E" });
    const billCard = await expectCards(page, bills);
    await expect(billCard.getByText("Conta mobile E2E")).toBeVisible();
    await expectCellLabel(billCard, "Valor", /300/);
    await expectCellLabel(billCard, "Vencimento", /\d{2}\/\d{2}\/\d{4}/);
    await expectCellLabel(billCard, "Status", "Pendente");
    await billCard.getByRole("button", { name: "Marcar como pago" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expectCellLabel(billCard, "Status", "Pago");

    // A ocorrência materializada da recorrência também aparece na tabela de
    // contas - a de recorrentes é a da seção "Contas recorrentes".
    const recurring = page.getByRole("heading", { name: "Contas recorrentes" }).locator("xpath=..").getByRole("table");
    const recurringCard = await expectCards(page, recurring);
    await expectCellLabel(recurringCard, "Valor", /900/);
    await expectCellLabel(recurringCard, "Frequência", /Mensal/);
    await recurringCard.getByRole("button", { name: "Pausar" }).click();
    await expectCellLabel(recurringCard, "Status", "Pausada");
  });

  test("4. lançamentos recorrentes: card e Pausar", async ({ page }) => {
    const { request, category } = await setupBusiness(page, "rec");
    const expense = await category("EXPENSE", "Assinatura Mobile Cat");
    await ok(
      await request.post("/api/financeiro/recurring", {
        data: {
          type: "EXPENSE",
          categoryId: expense,
          description: "Assinatura recorrente mobile E2E",
          amount: 50,
          frequency: "MONTHLY",
          dayOfMonth: 28,
          startDate: isoDate(40),
        },
      }),
      "lançamento recorrente"
    );
    await gotoHydrated(page, "/financeiro/recorrentes");
    const card = await expectCards(page, page.getByRole("table"));
    await expect(card.getByText("Assinatura recorrente mobile E2E")).toBeVisible();
    await expectCellLabel(card, "Valor", /50/);
    await expectCellLabel(card, "Tipo", "Despesa");
    await card.getByRole("button", { name: "Pausar" }).click();
    await expectCellLabel(card, "Status", "Pausada");
  });

  test("5. clientes: card e Ver abre o cliente", async ({ page }) => {
    const { request } = await setupBusiness(page, "cli");
    const client = await ok(
      await request.post("/api/clientes", { data: { name: "Cliente Lista Mobile E2E", phone: "11 98888-0000" } }),
      "cliente"
    );
    const clientId: string = client.client?.id ?? client.id;
    await gotoHydrated(page, "/clientes");
    const card = await expectCards(page, page.getByRole("table"));
    await expect(card.getByText("Cliente Lista Mobile E2E")).toBeVisible();
    await expectCellLabel(card, "Contato", "11 98888-0000");
    await expectCellLabel(card, "Status", "Ativo");
    await card.getByRole("link", { name: "Ver" }).click();
    await expect(page).toHaveURL(new RegExp(`/clientes/${clientId}$`));
  });

  test("6. vendas: o card inteiro abre a venda", async ({ page }) => {
    const { saleId } = await createClientAndSale(page, "sale");
    await gotoHydrated(page, "/vendas");
    const card = await expectCards(page, page.getByRole("table"));
    await expectCellLabel(card, "Cliente", "Cliente Mobile E2E");
    await expectCellLabel(card, "Valor", /200/);
    await expectCellLabel(card, "Pagamento", "Não paga");
    // Clique no meio do card, longe do link "Ver": o card todo é o alvo.
    await card.click({ position: { x: 24, y: 24 } });
    await expect(page).toHaveURL(new RegExp(`/vendas/${saleId}$`));
  });

  test("7 e 9. detalhe da venda: itens em card e Registrar recebimento da parcela", async ({ page }) => {
    const { saleId } = await createClientAndSale(page, "detail");
    await gotoHydrated(page, `/vendas/${saleId}`);

    const items = page.getByRole("table").filter({ hasText: "Item mobile E2E" });
    const itemCard = await expectCards(page, items);
    await expect(itemCard.getByText("Item mobile E2E")).toBeVisible();
    await expectCellLabel(itemCard, "Quantidade", "2");
    await expectCellLabel(itemCard, "Subtotal", /200/);

    const bills = page.getByRole("table").filter({ has: page.getByRole("button", { name: "Registrar recebimento" }) });
    const billCard = await expectCards(page, bills);
    await expectCellLabel(billCard, "Valor", /100/);
    await expectCellLabel(billCard, "Status", "Pendente");
    await billCard.getByRole("button", { name: "Registrar recebimento" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expectCellLabel(billCard, "Status", "Recebido");
  });

  test("8. histórico de vendas do cliente: o card abre a venda", async ({ page }) => {
    const { clientId, saleId } = await createClientAndSale(page, "hist");
    await gotoHydrated(page, `/clientes/${clientId}`);
    const card = await expectCards(page, page.getByRole("table"));
    await expect(card.getByRole("link", { name: /Venda #\d+/ })).toBeVisible();
    await expectCellLabel(card, "Total", /200/);
    await expectCellLabel(card, "Status", "Confirmada");
    await card.click({ position: { x: 24, y: 24 } });
    await expect(page).toHaveURL(new RegExp(`/vendas/${saleId}$`));
  });
});

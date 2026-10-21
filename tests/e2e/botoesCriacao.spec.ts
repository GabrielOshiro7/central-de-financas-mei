import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { gotoHydrated } from "./helpers/hydration";

// Botões de criação de nível de página fora do Financeiro (Vendas, Agenda,
// Clientes, Contas a pagar/receber) no modelo compartilhado de
// src/components/CreateButton.tsx: contorno + ícone Plus decorativo. O "+"
// saiu do texto - o nome acessível é só o rótulo.

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

// Cadastro, onboarding, um cliente e uma venda via API (a UI desses fluxos já
// é coberta pelos outros specs). Com a venda e o cliente, Vendas e Clientes
// mostram o botão no cabeçalho; Contas a pagar/receber ficam vazias e mostram
// o botão no estado vazio (o outro lugar onde o NewBillButton aparece).
async function setup(page: Page) {
  const request = page.context().request;
  const email = `criar-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
  await ok(
    await request.post("/api/auth/register", { data: { name: "Criar E2E", email, password: PASSWORD, confirmPassword: PASSWORD } }),
    "register"
  );
  const answers: [number, unknown][] = [
    [1, { businessType: "LOJA" }],
    [2, { revenueModel: ["venda_produtos"] }],
    [3, { name: "Empresa Criar E2E" }],
    [4, { yearsInBusiness: "DE_1_A_3_ANOS" }],
    [5, { employeeCount: 3 }],
    [6, { currency: "BRL", averageMonthlyRevenue: 10000 }],
  ];
  for (const [step, data] of answers) await ok(await request.post("/api/onboarding/answer", { data: { step, data } }), `answer ${step}`);
  await ok(await request.post("/api/onboarding/complete"), "complete");

  const category = await ok(
    await request.post("/api/financeiro/categories", { data: { type: "REVENUE", name: "Venda Criar E2E" } }),
    "categoria"
  );
  const client = await ok(await request.post("/api/clientes", { data: { name: "Cliente Criar E2E" } }), "cliente");
  await ok(
    await request.post("/api/vendas", {
      data: {
        clientRequestId: `criar-${Date.now()}`,
        status: "CONFIRMED",
        clientId: client.client?.id ?? client.id,
        categoryId: category.category?.id ?? category.id,
        saleDate: isoDate(),
        items: [{ description: "Item Criar E2E", quantity: 1, unitPrice: 100 }],
        paymentMethod: "PIX",
        installments: [{ dueDate: isoDate(), amount: 100 }],
      },
    }),
    "venda"
  );
}

type Case = {
  path: string;
  label: string;
  role: "button" | "link";
  // Mesmo destino/formulário de antes da mudança.
  expectDestination: (page: Page) => Promise<void>;
};

const CASES: Case[] = [
  {
    path: "/vendas",
    label: "Nova venda",
    role: "link",
    expectDestination: async (page) => {
      await expect(page).toHaveURL(/\/vendas\/nova$/);
      await expect(page.getByRole("heading", { name: "Nova venda", level: 1 })).toBeVisible();
    },
  },
  {
    path: "/agenda",
    label: "Novo agendamento",
    role: "link",
    expectDestination: async (page) => {
      await expect(page).toHaveURL(/\/agenda\/novo$/);
      await expect(page.getByRole("heading", { name: "Novo agendamento", level: 1 })).toBeVisible();
    },
  },
  {
    path: "/clientes",
    label: "Novo cliente",
    role: "button",
    expectDestination: async (page) => {
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("heading", { name: "Novo cliente" })).toBeVisible();
    },
  },
  {
    path: "/financeiro/pagar",
    label: "Nova conta a pagar",
    role: "button",
    expectDestination: async (page) => {
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("heading", { name: "Nova conta a pagar" })).toBeVisible();
    },
  },
  {
    path: "/financeiro/receber",
    label: "Nova conta a receber",
    role: "button",
    expectDestination: async (page) => {
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("heading", { name: "Nova conta a receber" })).toBeVisible();
    },
  },
];

test.describe("botões de criação de página - contorno + ícone Plus", () => {
  test("cada página tem o botão com nome sem '+', ícone decorativo e o mesmo destino de antes", async ({ page }) => {
    await setup(page);
    for (const c of CASES) {
      await gotoHydrated(page, c.path);
      const target = page.getByRole(c.role, { name: c.label, exact: true });
      await expect(target).toHaveCount(1);
      await expect(target).toBeVisible();
      // Nome acessível sem "+": o "+" virou ícone com aria-hidden.
      await expect(page.getByRole(c.role, { name: `+ ${c.label}`, exact: true })).toHaveCount(0);
      await expect(target).not.toHaveAccessibleName(/\+/);
      await expect(target.locator('svg[aria-hidden="true"]')).toHaveCount(1);

      await target.click();
      await c.expectDestination(page);
    }
  });

  test("375px: botões visíveis e sem rolagem lateral", async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width: 375, height: 812 });
    for (const c of CASES) {
      await gotoHydrated(page, c.path);
      const target = page.getByRole(c.role, { name: c.label, exact: true });
      await expect(target).toBeVisible();
      const box = await target.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `rolagem lateral em ${c.path}`).toBeLessThanOrEqual(0);
    }
  });
});

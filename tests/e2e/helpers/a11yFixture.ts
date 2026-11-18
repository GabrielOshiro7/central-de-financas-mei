import type { APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";
import { businessToday } from "./businessDate";

// Dados realistas para a auditoria de acessibilidade: cliente, produto/servico, vendas, lancamentos,
// contas (pendente e paga), recorrentes e agendamentos (pendente e concluido), criados pelas
// proprias APIs do app (mesmo caminho dos specs de negocio). Varias linhas por lista: e preciso para
// enxergar problemas de nomes repetidos ("Editar", "Ver") e de tabelas com conteudo.
async function ok(response: Awaited<ReturnType<APIRequestContext["post"]>>, what: string) {
  expect(response.ok(), `${what}: ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json().catch(() => ({}))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const idOf = (body: Record<string, any>, key: string): string => (body[key]?.id ?? body.id) as string; // eslint-disable-line @typescript-eslint/no-explicit-any

export type A11yFixture = {
  clientId: string;
  saleId: string;
  pendingAppointmentId: string;
  completedAppointmentId: string;
  today: string;
};

export async function seedA11yData(request: APIRequestContext): Promise<A11yFixture> {
  const today = businessToday();
  const revenue = idOf(await ok(await request.post("/api/financeiro/categories", { data: { type: "REVENUE", name: "Vendas A11y" } }), "categoria receita"), "category");
  const cost = idOf(await ok(await request.post("/api/financeiro/categories", { data: { type: "COST", name: "Custos A11y" } }), "categoria custo"), "category");
  const expense = idOf(await ok(await request.post("/api/financeiro/categories", { data: { type: "EXPENSE", name: "Despesas A11y" } }), "categoria despesa"), "category");

  const client = await ok(
    await request.post("/api/clientes", {
      data: { name: "Cliente Acessibilidade", tradeName: "Acessível Ltda", clientType: "PESSOA_JURIDICA", phone: "11 3333-0000", email: "cliente@example.com", city: "São Paulo", country: "Brasil", notes: "Cliente de teste" },
    }),
    "cliente"
  );
  const clientId = idOf(client, "client");
  await ok(await request.post("/api/clientes", { data: { name: "Segundo Cliente A11y", phone: "11 4444-0000" } }), "cliente 2");
  const product = await ok(await request.post("/api/produtos", { data: { name: "Corte A11y", type: "SERVICO", defaultPrice: 80, durationMinutes: 30 } }), "servico");
  const productId = product.id as string;

  let saleId = "";
  for (const [i, price] of [100, 250].entries()) {
    const sale = await ok(
      await request.post("/api/vendas", {
        data: {
          clientRequestId: `a11y-${Date.now()}-${i}`,
          status: "CONFIRMED",
          clientId,
          categoryId: revenue,
          saleDate: businessToday(-i),
          items: [{ description: `Item A11y ${i + 1}`, quantity: 1, unitPrice: price }],
          paymentMethod: "PIX",
          installments: [{ dueDate: businessToday(i + 3), amount: price }],
        },
      }),
      `venda ${i + 1}`
    );
    if (i === 0) saleId = idOf(sale, "sale");
  }

  for (const [type, categoryId, description, amount] of [
    ["REVENUE", revenue, "Receita A11y", 500],
    ["REVENUE", revenue, "Outra receita A11y", 320],
    ["COST", cost, "Custo A11y", 150],
    ["EXPENSE", expense, "Despesa A11y", 90],
    ["EXPENSE", expense, "Outra despesa A11y", 45],
  ] as const) {
    await ok(await request.post("/api/financeiro/transactions", { data: { type, occurredAt: today, description, categoryId, amount } }), `lancamento ${description}`);
  }

  for (const [i, direction] of (["PAYABLE", "PAYABLE", "RECEIVABLE", "RECEIVABLE"] as const).entries()) {
    const bill = await ok(
      await request.post("/api/financeiro/bills", {
        data: { direction, categoryId: direction === "PAYABLE" ? cost : revenue, description: `Conta A11y ${i + 1}`, amount: 100 + i * 10, dueDate: businessToday(i + 2), counterpartyName: `Contraparte ${i + 1}` },
      }),
      `conta ${i + 1}`
    );
    if (i % 2 === 1) await ok(await request.post(`/api/financeiro/bills/${idOf(bill, "bill")}/settle`, { data: { paidOn: today } }), `liquidar conta ${i + 1}`);
  }

  await ok(await request.post("/api/financeiro/recurring", { data: { type: "EXPENSE", categoryId: expense, description: "Assinatura A11y", amount: 50, frequency: "MONTHLY", dayOfMonth: 28, startDate: businessToday(40) } }), "recorrente");
  await ok(
    await request.post("/api/financeiro/bills/recurring", { data: { direction: "PAYABLE", categoryId: cost, description: "Aluguel A11y", amount: 900, frequency: "MONTHLY", dayOfMonth: 5, startDate: businessToday(40) } }),
    "conta recorrente"
  );

  const dayInput = (title: string) => ({
    clientId,
    title,
    scheduledOn: today,
    services: [{ productId, quantity: 1, unitPrice: 80 }],
    categoryId: revenue,
    paymentTiming: "AVISTA",
    paymentMethod: "PIX",
    notes: "Observação de teste",
  });
  const pending = await ok(await request.post("/api/agenda", { data: dayInput("Atendimento pendente A11y") }), "agendamento pendente");
  const done = await ok(await request.post("/api/agenda", { data: dayInput("Atendimento concluído A11y") }), "agendamento a concluir");
  await ok(
    await request.post(`/api/agenda/${done.id}/complete`, {
      data: {
        categoryId: revenue,
        items: [{ productId, description: "Corte A11y", quantity: 1, unitPrice: 80 }],
        paymentMethod: "PIX",
        installments: [{ dueDate: today, amount: 80, paidNow: true }],
      },
    }),
    "concluir agendamento"
  );

  return { clientId, saleId, pendingAppointmentId: pending.id as string, completedAppointmentId: done.id as string, today };
}

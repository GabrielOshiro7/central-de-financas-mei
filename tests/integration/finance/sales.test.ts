import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createClient } from "@/lib/clients/mutations";
import { createSale, confirmSale, updateSale, updateSaleNotes, cancelSale, type CreateSaleInput } from "@/lib/sales/mutations";
import { settleBill } from "@/lib/finance/bills/mutations";
import { getFinancialSummaryForRange } from "@/lib/finance/queries";
import { getSalesSummary } from "@/lib/sales/queries";
import { processClock } from "../../helpers/processClock";

const { Decimal } = Prisma;

describe("vendas (Etapa 6)", () => {
  let userId: string;
  let businessId: string;
  let revenueCategoryId: string;
  let clientId: string;

  beforeAll(async () => {
    const revenueCategory = await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } });
    revenueCategoryId = revenueCategory.id;

    const user = await prisma.user.create({
      data: { name: "Teste Vendas", email: `vendas-${Date.now()}@example.com`, passwordHash: await hashPassword("SenhaValida123") },
    });
    userId = user.id;

    const business = await prisma.business.create({ data: { userId, name: "Empresa Vendas", currency: "BRL" } });
    businessId = business.id;

    const client = await createClient(businessId, { name: "Cliente Teste", clientType: "PESSOA_FISICA" });
    if (!client.ok) throw new Error("setup do cliente falhou");
    clientId = client.value.id;
  });

  beforeEach(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.bill.deleteMany({ where: { businessId } });
    await prisma.sale.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.bill.deleteMany({ where: { businessId } });
    await prisma.sale.deleteMany({ where: { businessId } });
    await prisma.client.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  function baseInput(overrides: Partial<CreateSaleInput> = {}): CreateSaleInput {
    return {
      clientRequestId: randomUUID(),
      status: "CONFIRMED",
      clientId,
      categoryId: revenueCategoryId,
      saleDate: new Date(2026, 5, 10),
      items: [{ description: "Serviço A", quantity: 1, unitPrice: 500 }],
      discount: null,
      paymentMethod: "PIX",
      installments: [{ dueDate: new Date(2026, 5, 10), amount: 500, paidNow: true }],
      notes: null,
      ...overrides,
    };
  }

  it("Cenário 1 - venda à vista: gera exatamente 1 Bill PAID + 1 FinancialEntry, sem duplicar", async () => {
    const result = await createSale(businessId, userId, baseInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const bills = await prisma.bill.findMany({ where: { saleId: result.value.id } });
    expect(bills).toHaveLength(1);
    expect(bills[0].status).toBe("PAID");
    expect(bills[0].paidAt?.getTime()).toBe(new Date(2026, 5, 10).getTime());
    expect(bills[0].categoryId).toBe(revenueCategoryId);

    const entries = await prisma.financialEntry.findMany({ where: { billId: bills[0].id } });
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("REVENUE");
    expect(entries[0].amount.toString()).toBe("500");
    expect(entries[0].source).toBe("BILL");
  });

  it("Cenário 2 - venda a prazo (3x): 3 Bills PENDING somando o total, 0 FinancialEntry até receber", async () => {
    const result = await createSale(
      businessId,
      userId,
      baseInput({
        items: [{ description: "Produto B", quantity: 1, unitPrice: 1200 }],
        installments: [
          { dueDate: new Date(2026, 6, 1), amount: 400 },
          { dueDate: new Date(2026, 7, 1), amount: 400 },
          { dueDate: new Date(2026, 8, 1), amount: 400 },
        ],
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    let bills = await prisma.bill.findMany({ where: { saleId: result.value.id }, orderBy: { dueDate: "asc" } });
    expect(bills).toHaveLength(3);
    expect(bills.every((b) => b.status === "PENDING")).toBe(true);
    const sum = bills.reduce((t, b) => t.plus(b.amount), new Decimal(0));
    expect(sum.toString()).toBe("1200");

    let entries = await prisma.financialEntry.findMany({ where: { bill: { saleId: result.value.id } } });
    expect(entries).toHaveLength(0);

    // Recebe a primeira parcela reaproveitando settleBill (Etapa 5) sem nenhum código novo.
    const settle = await settleBill(businessId, userId, bills[0].id, new Date(2026, 6, 1));
    expect(settle.ok).toBe(true);

    bills = await prisma.bill.findMany({ where: { saleId: result.value.id } });
    expect(bills.filter((b) => b.status === "PAID")).toHaveLength(1);
    expect(bills.filter((b) => b.status === "PENDING")).toHaveLength(2);

    entries = await prisma.financialEntry.findMany({ where: { bill: { saleId: result.value.id } } });
    expect(entries).toHaveLength(1);
  });

  it("Cenário 6 - desconto percentual: 1000 - 10% = 900, validado pelo backend", async () => {
    const result = await createSale(
      businessId,
      userId,
      baseInput({
        items: [{ description: "Item com desconto", quantity: 1, unitPrice: 1000 }],
        discount: { type: "PERCENTAGE", value: 10 },
        installments: [{ dueDate: new Date(2026, 5, 10), amount: 900, paidNow: true }],
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: result.value.id } });
    expect(sale.subtotal.toString()).toBe("1000");
    expect(sale.discountAmount.toString()).toBe("100");
    expect(sale.total.toString()).toBe("900");
  });

  it("rejeita quando a soma das parcelas não bate com o total", async () => {
    const result = await createSale(
      businessId,
      userId,
      baseInput({
        items: [{ description: "Produto", quantity: 1, unitPrice: 1000 }],
        installments: [{ dueDate: new Date(2026, 5, 10), amount: 900 }],
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/soma das parcelas/i);
  });

  it("rejeita quando o desconto é maior que o subtotal (total nunca fica negativo)", async () => {
    const result = await createSale(
      businessId,
      userId,
      baseInput({
        items: [{ description: "Item", quantity: 1, unitPrice: 100 }],
        discount: { type: "FIXED", value: 500 },
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/desconto/i);
  });

  it("Cenário 3 - cancelamento bloqueado quando já existe parcela paga", async () => {
    const result = await createSale(businessId, userId, baseInput());
    if (!result.ok) return;

    const cancel = await cancelSale(businessId, result.value.id);
    expect(cancel.ok).toBe(false);
    if (!cancel.ok) expect(cancel.error).toMatch(/já tem parcela recebida/i);

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: result.value.id } });
    expect(sale.status).toBe("CONFIRMED");
  });

  it("Cenário 3 - cancelamento permitido e cancela as parcelas pendentes quando nenhuma foi paga", async () => {
    const result = await createSale(
      businessId,
      userId,
      baseInput({
        items: [{ description: "Produto a prazo", quantity: 1, unitPrice: 1000 }],
        installments: [
          { dueDate: new Date(2026, 6, 1), amount: 500 },
          { dueDate: new Date(2026, 7, 1), amount: 500 },
        ],
      })
    );
    if (!result.ok) return;

    const cancel = await cancelSale(businessId, result.value.id);
    expect(cancel.ok).toBe(true);

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: result.value.id } });
    expect(sale.status).toBe("CANCELLED");

    const bills = await prisma.bill.findMany({ where: { saleId: result.value.id } });
    expect(bills.every((b) => b.status === "CANCELLED")).toBe(true);
  });

  it("edição após pagamento: só notas podem mudar, Bill/FinancialEntry pagos permanecem intactos", async () => {
    const result = await createSale(businessId, userId, baseInput());
    if (!result.ok) return;

    const before = await prisma.bill.findFirstOrThrow({ where: { saleId: result.value.id } });
    const beforeEntry = await prisma.financialEntry.findFirstOrThrow({ where: { billId: before.id } });

    const blocked = await updateSale(businessId, result.value.id, {
      clientId,
      categoryId: revenueCategoryId,
      saleDate: new Date(2026, 5, 10),
      items: [{ description: "Tentando mudar", quantity: 1, unitPrice: 999 }],
      discount: null,
      paymentMethod: "PIX",
      notes: "tentativa",
    });
    expect(blocked.ok).toBe(false);

    const notesUpdate = await updateSaleNotes(businessId, result.value.id, "Observação atualizada");
    expect(notesUpdate.ok).toBe(true);

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: result.value.id } });
    expect(sale.notes).toBe("Observação atualizada");
    expect(sale.total.toString()).toBe("500");

    const afterBill = await prisma.bill.findUniqueOrThrow({ where: { id: before.id } });
    const afterEntry = await prisma.financialEntry.findUniqueOrThrow({ where: { id: beforeEntry.id } });
    expect(afterBill.amount.toString()).toBe(before.amount.toString());
    expect(afterEntry.amount.toString()).toBe(beforeEntry.amount.toString());
  });

  it("edição antes de qualquer pagamento: recalcula totais e substitui as parcelas PENDING", async () => {
    const result = await createSale(
      businessId,
      userId,
      baseInput({
        items: [{ description: "Produto a prazo", quantity: 1, unitPrice: 1000 }],
        installments: [
          { dueDate: new Date(2026, 6, 1), amount: 500 },
          { dueDate: new Date(2026, 7, 1), amount: 500 },
        ],
      })
    );
    if (!result.ok) return;

    const update = await updateSale(businessId, result.value.id, {
      clientId,
      categoryId: revenueCategoryId,
      saleDate: new Date(2026, 5, 10),
      items: [{ description: "Produto a prazo (editado)", quantity: 2, unitPrice: 300 }],
      discount: null,
      paymentMethod: "PIX",
      installments: [{ dueDate: new Date(2026, 6, 15), amount: 600 }],
      notes: null,
    });
    expect(update.ok).toBe(true);

    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: result.value.id } });
    expect(sale.total.toString()).toBe("600");

    const bills = await prisma.bill.findMany({ where: { saleId: result.value.id } });
    expect(bills).toHaveLength(1);
    expect(bills[0].amount.toString()).toBe("600");
    expect(bills[0].status).toBe("PENDING"); // editar nunca fabrica uma Bill já PAID
  });

  it("idempotência: duas criações simultâneas com o mesmo clientRequestId não duplicam a venda (Promise.all)", async () => {
    const input = baseInput();
    const [r1, r2] = await Promise.all([createSale(businessId, userId, input), createSale(businessId, userId, input)]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) expect(r1.value.id).toBe(r2.value.id);

    const sales = await prisma.sale.findMany({ where: { businessId, clientRequestId: input.clientRequestId } });
    expect(sales).toHaveLength(1);

    const bills = await prisma.bill.findMany({ where: { saleId: sales[0].id } });
    expect(bills).toHaveLength(1);
  });

  it("saleNumber é alocado de forma sequencial e sem colisão sob criação concorrente", async () => {
    const inputs = Array.from({ length: 5 }, () => baseInput({ clientRequestId: randomUUID() }));
    const results = await Promise.all(inputs.map((input) => createSale(businessId, userId, input)));
    expect(results.every((r) => r.ok)).toBe(true);

    const numbers = results.map((r) => (r.ok ? r.value.saleNumber : -1));
    expect(new Set(numbers).size).toBe(5);
  });

  it("rascunho (DRAFT) não gera nenhum Bill até ser confirmado, e confirmar é idempotente", async () => {
    const draft = await createSale(businessId, userId, baseInput({ status: "DRAFT", installments: undefined }));
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    let bills = await prisma.bill.findMany({ where: { saleId: draft.value.id } });
    expect(bills).toHaveLength(0);

    const confirmInput = {
      installments: [{ dueDate: new Date(2026, 5, 10), amount: 500, paidNow: true }],
      paymentMethod: "PIX",
    };
    const confirm = await confirmSale(businessId, draft.value.id, confirmInput);
    expect(confirm.ok).toBe(true);

    bills = await prisma.bill.findMany({ where: { saleId: draft.value.id } });
    expect(bills).toHaveLength(1);
    expect(bills[0].status).toBe("PAID");

    const confirmAgain = await confirmSale(businessId, draft.value.id, confirmInput);
    expect(confirmAgain.ok).toBe(true);
    bills = await prisma.bill.findMany({ where: { saleId: draft.value.id } });
    expect(bills).toHaveLength(1);
  });

  it("Cenário 5 - período sem vendas: indicadores retornam zero sem erro", async () => {
    const summary = await getSalesSummary(businessId, { start: new Date(2020, 0, 1), end: new Date(2020, 1, 1) }, processClock());
    expect(summary.salesCount).toBe(0);
    expect(summary.totalRevenue.toNumber()).toBe(0);
    expect(summary.averageTicket).toBeNull();
  });

  it("consistência cruzada: receita do financeiro no período bate com a soma das Bills pagas geradas por vendas", async () => {
    await createSale(businessId, userId, baseInput({ clientRequestId: randomUUID() }));
    await createSale(
      businessId,
      userId,
      baseInput({
        clientRequestId: randomUUID(),
        items: [{ description: "Outra venda à vista", quantity: 1, unitPrice: 250 }],
        installments: [{ dueDate: new Date(2026, 5, 10), amount: 250, paidNow: true }],
      })
    );

    const range = { start: new Date(2026, 5, 1), end: new Date(2026, 6, 1) };
    const financialSummary = await getFinancialSummaryForRange(businessId, range);

    const paidBills = await prisma.bill.findMany({
      where: { businessId, status: "PAID", saleId: { not: null } },
      select: { amount: true },
    });
    const paidBillsTotal = paidBills.reduce((t, b) => t.plus(b.amount), new Decimal(0));

    expect(financialSummary.revenue.toString()).toBe(paidBillsTotal.toString());
    expect(financialSummary.revenue.toString()).toBe("750");
  });

  it("isolamento entre empresas: venda/cliente/Bill de uma empresa nunca são acessíveis a partir de outra (Cenário 4)", async () => {
    const userB = await prisma.user.create({
      data: { name: "Usuario B", email: `vendas-b-${Date.now()}@example.com`, passwordHash: await hashPassword("SenhaValida123") },
    });
    const businessB = await prisma.business.create({ data: { userId: userB.id, name: "Empresa B", currency: "BRL" } });
    const clientB = await createClient(businessB.id, { name: "Cliente Teste", clientType: "PESSOA_FISICA" });
    if (!clientB.ok) throw new Error("setup do cliente B falhou");

    const saleB = await createSale(businessB.id, userB.id, {
      clientRequestId: randomUUID(),
      status: "CONFIRMED",
      clientId: clientB.value.id,
      categoryId: revenueCategoryId,
      saleDate: new Date(2026, 5, 10),
      items: [{ description: "Venda da empresa B", quantity: 1, unitPrice: 500 }],
      discount: null,
      paymentMethod: "PIX",
      installments: [{ dueDate: new Date(2026, 5, 10), amount: 500, paidNow: true }],
      notes: null,
    });
    expect(saleB.ok).toBe(true);
    if (!saleB.ok) return;

    // businessId da empresa A nunca deve conseguir achar/alterar a venda da empresa B.
    const crossUpdate = await updateSale(businessId, saleB.value.id, {
      clientId,
      categoryId: revenueCategoryId,
      saleDate: new Date(2026, 5, 10),
      items: [{ description: "Hackeado", quantity: 1, unitPrice: 1 }],
      discount: null,
      notes: null,
    });
    expect(crossUpdate.ok).toBe(false);

    const crossCancel = await cancelSale(businessId, saleB.value.id);
    expect(crossCancel.ok).toBe(false);

    const listA = await prisma.sale.findMany({ where: { businessId } });
    expect(listA.every((s) => s.businessId === businessId)).toBe(true);

    await prisma.financialEntry.deleteMany({ where: { businessId: businessB.id } });
    await prisma.bill.deleteMany({ where: { businessId: businessB.id } });
    await prisma.sale.deleteMany({ where: { businessId: businessB.id } });
    await prisma.client.deleteMany({ where: { businessId: businessB.id } });
    await prisma.business.delete({ where: { id: businessB.id } });
    await prisma.user.delete({ where: { id: userB.id } });
  });
});

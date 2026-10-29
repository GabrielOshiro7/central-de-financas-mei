import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { getOverdueAmountForDueRange } from "@/lib/finance/bills/queries";
import { hasFinancialEntriesBefore } from "@/lib/finance/queries";
import { processClock } from "../../helpers/processClock";
import { dbDateOfInstant } from "@/lib/time/zoned";

// Getters novos adicionados para a Etapa 7 (Insights) - testados isoladamente
// aqui, antes do modulo insights/ existir, seguindo o mesmo esqueleto de
// setup de bills.test.ts.
describe("getters de suporte a Insights (Etapa 7)", () => {
  let userId: string;
  let businessId: string;
  let revenueCategoryId: string;

  beforeAll(async () => {
    const revenueCategory = await prisma.category.findFirstOrThrow({
      where: { businessId: null, type: "REVENUE" },
    });
    revenueCategoryId = revenueCategory.id;

    const user = await prisma.user.create({
      data: {
        name: "Teste Insights Getters",
        email: `insights-getters-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    userId = user.id;

    const business = await prisma.business.create({
      data: { userId, name: "Empresa Insights Getters", currency: "BRL" },
    });
    businessId = business.id;
  });

  beforeEach(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.bill.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    await prisma.financialEntry.deleteMany({ where: { businessId } });
    await prisma.bill.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  describe("getOverdueAmountForDueRange", () => {
    const now = new Date(2026, 8, 15); // 15/09/2026
    const septRange = { start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) };

    it("soma só bills PENDING com dueDate dentro do range E já vencidas hoje", async () => {
      await prisma.bill.createMany({
        data: [
          {
            businessId,
            categoryId: revenueCategoryId,
            description: "Vencida em setembro, dentro do range",
            amount: "300",
            dueDate: new Date(2026, 8, 5), dueOn: dbDateOfInstant(new Date(2026, 8, 5), "Asia/Tokyo"),
            status: "PENDING",
          },
          {
            businessId,
            categoryId: revenueCategoryId,
            description: "A vencer em setembro (ainda não vencida hoje)",
            amount: "500",
            dueDate: new Date(2026, 8, 20), dueOn: dbDateOfInstant(new Date(2026, 8, 20), "Asia/Tokyo"),
            status: "PENDING",
          },
          {
            businessId,
            categoryId: revenueCategoryId,
            description: "Vencida em agosto, fora do range",
            amount: "999",
            dueDate: new Date(2026, 7, 25), dueOn: dbDateOfInstant(new Date(2026, 7, 25), "Asia/Tokyo"),
            status: "PENDING",
          },
          {
            businessId,
            categoryId: revenueCategoryId,
            description: "Vencimento em setembro mas já paga",
            amount: "777",
            dueDate: new Date(2026, 8, 10), dueOn: dbDateOfInstant(new Date(2026, 8, 10), "Asia/Tokyo"),
            status: "PAID",
            paidAt: new Date(2026, 8, 10), paidOn: dbDateOfInstant(new Date(2026, 8, 10), "Asia/Tokyo"),
          },
        ],
      });

      const total = await getOverdueAmountForDueRange(businessId, "RECEIVABLE", septRange, processClock(now));
      expect(total.toString()).toBe("300");
    });

    it("retorna zero quando não há nenhuma bill vencida no range", async () => {
      const total = await getOverdueAmountForDueRange(businessId, "RECEIVABLE", septRange, processClock(now));
      expect(total.toString()).toBe("0");
    });
  });

  describe("hasFinancialEntriesBefore", () => {
    it("retorna false quando não há nenhum lançamento", async () => {
      const result = await hasFinancialEntriesBefore(businessId, new Date(2026, 8, 1), "Asia/Tokyo");
      expect(result).toBe(false);
    });

    it("retorna true só quando existe lançamento estritamente anterior à data informada", async () => {
      await prisma.financialEntry.create({
        data: {
          businessId,
          userId,
          type: "REVENUE",
          categoryId: revenueCategoryId,
          description: "Lançamento de agosto",
          amount: "100",
          occurredAt: new Date(2026, 7, 20), occurredOn: dbDateOfInstant(new Date(2026, 7, 20), "Asia/Tokyo"),
        },
      });

      await expect(hasFinancialEntriesBefore(businessId, new Date(2026, 8, 1), "Asia/Tokyo")).resolves.toBe(true);
      await expect(hasFinancialEntriesBefore(businessId, new Date(2026, 7, 1), "Asia/Tokyo")).resolves.toBe(false);
    });
  });
});

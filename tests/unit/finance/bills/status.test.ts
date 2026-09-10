import { describe, it, expect } from "vitest";
import { billDirectionForType, deriveBillStatus } from "@/lib/finance/bills/status";

describe("billDirectionForType - direção derivada de category.type, nunca armazenada", () => {
  it("REVENUE -> RECEIVABLE", () => {
    expect(billDirectionForType("REVENUE")).toBe("RECEIVABLE");
  });
  it("COST -> PAYABLE", () => {
    expect(billDirectionForType("COST")).toBe("PAYABLE");
  });
  it("EXPENSE -> PAYABLE", () => {
    expect(billDirectionForType("EXPENSE")).toBe("PAYABLE");
  });
});

describe("deriveBillStatus - 'Atrasado' nunca é persistido, sempre derivado de status + dueDate", () => {
  const today = new Date(2026, 5, 15);

  it("PENDING com vencimento futuro -> PENDING", () => {
    const status = deriveBillStatus({ status: "PENDING", dueDate: new Date(2026, 5, 20) }, today);
    expect(status).toBe("PENDING");
  });

  it("PENDING com vencimento hoje -> PENDING (ainda não atrasado)", () => {
    const status = deriveBillStatus({ status: "PENDING", dueDate: new Date(2026, 5, 15) }, today);
    expect(status).toBe("PENDING");
  });

  it("PENDING com vencimento passado -> OVERDUE, mesmo sem o usuário marcar nada", () => {
    const status = deriveBillStatus({ status: "PENDING", dueDate: new Date(2026, 5, 14) }, today);
    expect(status).toBe("OVERDUE");
  });

  it("PAID permanece PAID mesmo com dueDate no passado (não vira OVERDUE depois de confirmado)", () => {
    const status = deriveBillStatus({ status: "PAID", dueDate: new Date(2026, 0, 1) }, today);
    expect(status).toBe("PAID");
  });

  it("CANCELLED permanece CANCELLED independente da data", () => {
    const status = deriveBillStatus({ status: "CANCELLED", dueDate: new Date(2026, 5, 1) }, today);
    expect(status).toBe("CANCELLED");
  });
});

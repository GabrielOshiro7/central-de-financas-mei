import { describe, it, expect } from "vitest";
import { billDirectionForType, deriveBillStatus } from "@/lib/finance/bills/status";
import { processClock } from "../../../helpers/processClock";
import { dateKeyToDbDate } from "@/lib/time/zoned";

// Vencimento = o dia gravado em dueOn (@db.Date, Etapa F6b-2).
const day = dateKeyToDbDate;

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

describe("deriveBillStatus - 'Atrasado' nunca é persistido, sempre derivado de status + dueOn", () => {
  const today = new Date(2026, 5, 15);

  it("PENDING com vencimento futuro -> PENDING", () => {
    const status = deriveBillStatus({ status: "PENDING", dueOn: day("2026-06-20") }, processClock(today));
    expect(status).toBe("PENDING");
  });

  it("PENDING com vencimento hoje -> PENDING (ainda não atrasado)", () => {
    const status = deriveBillStatus({ status: "PENDING", dueOn: day("2026-06-15") }, processClock(today));
    expect(status).toBe("PENDING");
  });

  it("PENDING com vencimento passado -> OVERDUE, mesmo sem o usuário marcar nada", () => {
    const status = deriveBillStatus({ status: "PENDING", dueOn: day("2026-06-14") }, processClock(today));
    expect(status).toBe("OVERDUE");
  });

  it("PAID permanece PAID mesmo com dueOn no passado (não vira OVERDUE depois de confirmado)", () => {
    const status = deriveBillStatus({ status: "PAID", dueOn: day("2026-01-01") }, processClock(today));
    expect(status).toBe("PAID");
  });

  it("CANCELLED permanece CANCELLED independente da data", () => {
    const status = deriveBillStatus({ status: "CANCELLED", dueOn: day("2026-06-01") }, processClock(today));
    expect(status).toBe("CANCELLED");
  });
});

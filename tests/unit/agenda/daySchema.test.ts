import { describe, it, expect } from "vitest";
import { dayAppointmentInputSchema, isNoValueDayInput } from "@/lib/agenda/schema";

// Agendamento DAY sem valor (total zero): regras do Zod que espelham as CHECKs
// do banco e dependem do total.
const schema = dayAppointmentInputSchema("BRL");
const base = { scheduledOn: "2026-10-20" };
const paid = {
  ...base,
  clientId: "c1",
  services: [{ productId: "p1", quantity: 2, unitPrice: 30 }],
  categoryId: "cat1",
  paymentTiming: "AVISTA" as const,
};
const messages = (input: unknown) => {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe("dayAppointmentInputSchema - sem valor (total zero)", () => {
  it("aceita só título, só cliente, só serviço de valor 0", () => {
    expect(messages({ ...base, title: "Reunião" })).toEqual([]);
    expect(messages({ ...base, clientId: "c1" })).toEqual([]);
    expect(messages({ ...base, services: [{ productId: "p1", quantity: 1, unitPrice: 0 }] })).toEqual([]);
  });

  it("recusa sem título, cliente e serviço", () => {
    expect(messages(base)).toEqual(["Informe ao menos um título, cliente ou serviço."]);
    expect(messages({ ...base, title: "  ", clientId: "", services: [] })).toEqual(["Informe ao menos um título, cliente ou serviço."]);
  });

  it("título com mais de 120 caracteres é recusado; 120 passa", () => {
    expect(messages({ ...base, title: "x".repeat(121) })).toEqual(["O título pode ter no máximo 120 caracteres."]);
    expect(messages({ ...base, title: "x".repeat(120) })).toEqual([]);
  });

  it("categoria, pagamento e parcelas não são exigidos nem validados", () => {
    expect(messages({ ...base, title: "R", paymentTiming: "APRAZO", installments: [] })).toEqual([]);
    expect(messages({ ...base, title: "R", paymentTiming: "AVISTA", installments: [{ dueOn: "2026-10-20", amount: 5 }] })).toEqual([]);
  });

  it("isNoValueDayInput: total zero com ou sem serviços", () => {
    expect(isNoValueDayInput({ services: [] })).toBe(true);
    expect(isNoValueDayInput({ services: [{ quantity: 3, unitPrice: 0 }] })).toBe(true);
    expect(isNoValueDayInput({ services: [{ quantity: 1, unitPrice: 0.01 }] })).toBe(false);
  });
});

describe("dayAppointmentInputSchema - com valor (total > 0)", () => {
  it("aceita o payload completo", () => {
    expect(messages(paid)).toEqual([]);
  });

  it("exige cliente, categoria e condição de pagamento", () => {
    expect(messages({ ...paid, clientId: "" })).toEqual(["Selecione um cliente."]);
    expect(messages({ ...paid, categoryId: "" })).toEqual(["Selecione uma categoria de receita."]);
    expect(messages({ ...paid, paymentTiming: undefined })).toEqual(["Escolha a condição de pagamento."]);
    // Título não substitui nada disso.
    expect(messages({ ...paid, title: "T", clientId: undefined, categoryId: undefined, paymentTiming: undefined })).toEqual([
      "Selecione um cliente.",
      "Selecione uma categoria de receita.",
      "Escolha a condição de pagamento.",
    ]);
  });

  it("a prazo continua exigindo parcelas que somam o total", () => {
    expect(messages({ ...paid, paymentTiming: "APRAZO", installments: [] })).toEqual(["Informe ao menos uma parcela."]);
    expect(messages({ ...paid, paymentTiming: "APRAZO", installments: [{ dueOn: "2026-11-20", amount: 59 }] })).toEqual([
      "A soma das parcelas não bate com o total do atendimento.",
    ]);
    expect(messages({ ...paid, paymentTiming: "APRAZO", installments: [{ dueOn: "2026-11-20", amount: 60 }] })).toEqual([]);
  });

  it("continua estrito (campo desconhecido, como horário, é recusado)", () => {
    expect(messages({ ...paid, startAt: "2026-10-20T09:00" }).length).toBeGreaterThan(0);
  });
});

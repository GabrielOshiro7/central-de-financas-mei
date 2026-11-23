import { describe, it, expect } from "vitest";
import {
  ERROR_AT_LEAST_ONE,
  ERROR_NEEDS_CLIENT,
  counterLabel,
  counterSpokenLabel,
  hasFilledData,
  stepsFor,
  validateAllSteps,
  validateStep,
  type AppointmentDraft,
} from "@/lib/agenda/newAppointmentSteps";

// Logica pura do popup "Novo agendamento" em passos: quantidade de passos, contador, validacao por passo e "ha dado
// preenchido".
const BASELINE = { scheduledOn: "2026-11-20", categoryId: "cat-padrao" };

function draft(overrides: Partial<AppointmentDraft> = {}): AppointmentDraft {
  return {
    title: "",
    clientId: "",
    whatsapp: "",
    rows: [],
    scheduledOn: BASELINE.scheduledOn,
    notes: "",
    categoryId: BASELINE.categoryId,
    paymentTiming: "AVISTA",
    paymentMethod: "",
    installments: [{ dueDateInput: BASELINE.scheduledOn, amount: "" }],
    ...overrides,
  };
}

const row = (unitPrice: string, quantity = "1") => ({ productId: `p-${unitPrice}`, quantity, unitPrice });

describe("passos e contador", () => {
  it("3 passos sem valor; 4 com valor (o Pagamento so existe com total > 0)", () => {
    expect(stepsFor(0)).toEqual(["cliente", "servicos", "data"]);
    expect(stepsFor(60)).toEqual(["cliente", "servicos", "data", "pagamento"]);
    expect(stepsFor(0.01)).toHaveLength(4);
  });

  it('o contador mostra "1/3", "2/3", "3/3" sem valor e "x/4" com valor; o texto falado e "Passo X de N"', () => {
    expect([0, 1, 2].map((i) => counterLabel(i, stepsFor(0).length))).toEqual(["1/3", "2/3", "3/3"]);
    expect([0, 1, 2, 3].map((i) => counterLabel(i, stepsFor(50).length))).toEqual(["1/4", "2/4", "3/4", "4/4"]);
    expect(counterSpokenLabel(1, 4)).toBe("Passo 2 de 4");
  });
});

describe("validacao por passo", () => {
  it("passo 1 (Cliente): nada e obrigatorio ali", () => {
    expect(validateStep("cliente", draft(), 0, 2)).toBeNull();
  });

  it("passo 2: sem titulo, cliente nem servico -> 'Informe ao menos um titulo, cliente ou servico.'", () => {
    expect(validateStep("servicos", draft(), 0, 2)).toEqual({ step: "servicos", message: ERROR_AT_LEAST_ONE });
    expect(validateStep("servicos", draft({ title: "Reuniao" }), 0, 2)).toBeNull();
    expect(validateStep("servicos", draft({ clientId: "c1" }), 0, 2)).toBeNull();
    expect(validateStep("servicos", draft({ rows: [row("0")] }), 0, 2)).toBeNull(); // servico de valor 0, sem cliente: ok
  });

  it("passo 2: quantidade ou valor vazios -> erro", () => {
    expect(validateStep("servicos", draft({ clientId: "c1", rows: [row("")] }), 0, 2)?.message).toMatch(/quantidade e valor/i);
    expect(validateStep("servicos", draft({ clientId: "c1", rows: [row("10", "0")] }), 10, 2)?.message).toMatch(/quantidade e valor/i);
  });

  it("passo 2: com valor e SEM cliente bloqueia, pedindo para voltar e escolher o cliente", () => {
    const error = validateStep("servicos", draft({ rows: [row("60")] }), 60, 2);
    expect(error).toEqual({ step: "servicos", message: ERROR_NEEDS_CLIENT, needsClient: true });
    expect(error?.message).toBe("Escolha um cliente para agendamentos com valor.");
    expect(validateStep("servicos", draft({ rows: [row("60")], clientId: "c1" }), 60, 2)).toBeNull();
  });

  it("passo 3 (Data): data obrigatoria e valida", () => {
    expect(validateStep("data", draft({ scheduledOn: "" }), 0, 2)).toEqual({ step: "data", message: "Informe a data do atendimento.", fieldId: "scheduledOn" });
    expect(validateStep("data", draft({ scheduledOn: "2026-02-30" }), 0, 2)?.fieldId).toBe("scheduledOn");
    expect(validateStep("data", draft(), 0, 2)).toBeNull();
  });

  it("passo 4 (Pagamento): categoria obrigatoria; a prazo exige parcelas completas somando o total", () => {
    const base = { clientId: "c1", rows: [row("100")] };
    expect(validateStep("pagamento", draft({ ...base, categoryId: "" }), 100, 2)).toEqual({ step: "pagamento", message: "Selecione uma categoria de receita.", fieldId: "categoryId" });
    expect(validateStep("pagamento", draft(base), 100, 2)).toBeNull(); // a vista
    const prazo = { ...base, paymentTiming: "APRAZO" as const };
    expect(validateStep("pagamento", draft({ ...prazo, installments: [{ dueDateInput: "2026-12-20", amount: "" }] }), 100, 2)?.message).toMatch(/parcelas/i);
    expect(validateStep("pagamento", draft({ ...prazo, installments: [{ dueDateInput: "2026-12-20", amount: "60" }, { dueDateInput: "2027-01-20", amount: "30" }] }), 100, 2)?.message).toMatch(/soma das parcelas/i);
    expect(validateStep("pagamento", draft({ ...prazo, installments: [{ dueDateInput: "2026-12-20", amount: "60" }, { dueDateInput: "2027-01-20", amount: "40" }] }), 100, 2)).toBeNull();
  });

  it("passo 4 sem valor nao valida nada (nem existe)", () => {
    expect(validateStep("pagamento", draft({ categoryId: "" }), 0, 2)).toBeNull();
  });

  it("validateAllSteps devolve o primeiro erro, na ordem dos passos", () => {
    expect(validateAllSteps(draft({ rows: [row("60")], scheduledOn: "" }), 60, 2)?.step).toBe("servicos"); // valor sem cliente vem antes da data
    expect(validateAllSteps(draft({ clientId: "c1", rows: [row("60")], scheduledOn: "" }), 60, 2)?.step).toBe("data");
    expect(validateAllSteps(draft({ clientId: "c1", rows: [row("60")], categoryId: "" }), 60, 2)?.step).toBe("pagamento");
    expect(validateAllSteps(draft({ title: "Reuniao" }), 0, 2)).toBeNull();
  });
});

describe("hasFilledData (Descartar agendamento?)", () => {
  it("formulario intocado: nao ha dado", () => {
    expect(hasFilledData(draft(), BASELINE)).toBe(false);
  });

  it.each<[string, Partial<AppointmentDraft>]>([
    ["titulo", { title: "Reuniao" }],
    ["cliente", { clientId: "c1" }],
    ["servico", { rows: [row("10")] }],
    ["data diferente da inicial", { scheduledOn: "2026-11-21" }],
    ["observacao", { notes: "anotei" }],
    ["meio de pagamento", { paymentMethod: "PIX" }],
    ["a prazo", { paymentTiming: "APRAZO" }],
    ["categoria diferente da padrao", { categoryId: "outra" }],
    ["valor de parcela", { installments: [{ dueDateInput: "2026-11-20", amount: "10" }] }],
  ])("%s conta como dado preenchido", (_name, overrides) => {
    expect(hasFilledData(draft(overrides), BASELINE)).toBe(true);
  });

  it("espacos em branco no titulo/observacao nao contam", () => {
    expect(hasFilledData(draft({ title: "   ", notes: "  " }), BASELINE)).toBe(false);
  });
});

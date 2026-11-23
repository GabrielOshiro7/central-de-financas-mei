import { describe, it, expect } from "vitest";
import { clientSchema } from "@/lib/clients/schema";
import { dayAppointmentInputSchema } from "@/lib/agenda/schema";
import { CLIENT_CONTACT_MAX_LENGTH, CLIENT_CONTACT_TOO_LONG } from "@/lib/clients/options";
import { validateStep, type AppointmentDraft } from "@/lib/agenda/newAppointmentSteps";

// phone e whatsapp: texto livre, mas com no maximo 40 caracteres (cadastro/edicao do cliente, clientWhatsapp do
// agendamento e o passo 1 do popup). 40 passa, 41 e recusado com "Use no máximo 40 caracteres.".
const base = { name: "Fulano", clientType: "PESSOA_FISICA" as const };
const issues = (input: unknown) => {
  const result = clientSchema().safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("clientSchema: limite de 40 caracteres em phone e whatsapp", () => {
  it("a constante e a mensagem", () => {
    expect(CLIENT_CONTACT_MAX_LENGTH).toBe(40);
    expect(CLIENT_CONTACT_TOO_LONG).toBe("Use no máximo 40 caracteres.");
  });

  it.each(["phone", "whatsapp"] as const)("%s: 40 passa, 41 e recusado, vazio e ausente passam", (field) => {
    expect(issues({ ...base, [field]: "9".repeat(40) })).toEqual([]);
    expect(issues({ ...base, [field]: "9".repeat(41) })).toEqual([`${field}: Use no máximo 40 caracteres.`]);
    expect(issues({ ...base, [field]: "" })).toEqual([]);
    expect(issues(base)).toEqual([]);
  });

  it("o limite vale depois de aparar os espacos (espacos nas pontas nao contam)", () => {
    expect(issues({ ...base, phone: `  ${"9".repeat(40)}  ` })).toEqual([]);
  });

  it("formatos livres continuam aceitos dentro do limite (nada de validar por pais)", () => {
    for (const phone of ["090-1234-5678", "+81 90 1234 5678", "+55 (11) 91234-5678", "ramal 12 / recepção"]) {
      expect(issues({ ...base, phone, whatsapp: phone })).toEqual([]);
    }
  });
});

describe("clientWhatsapp do agendamento reaproveita a mesma regra", () => {
  const create = dayAppointmentInputSchema("BRL", { allowClientWhatsapp: true });
  const payload = { scheduledOn: "2026-10-20", clientId: "c1", services: [] };
  const messages = (clientWhatsapp: string) => {
    const result = create.safeParse({ ...payload, clientWhatsapp });
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };

  it("40 passa e 41 e recusado", () => {
    expect(messages("9".repeat(40))).toEqual([]);
    expect(messages("9".repeat(41))).toEqual(["Use no máximo 40 caracteres."]);
  });
});

describe("passo 1 do popup: WhatsApp com mais de 40 caracteres e recusado no 'Proximo'", () => {
  const draft = (whatsapp: string): AppointmentDraft => ({
    title: "", clientId: "c1", whatsapp, rows: [], scheduledOn: "2026-11-20", notes: "", categoryId: "cat",
    paymentTiming: "AVISTA", paymentMethod: "", installments: [{ dueDateInput: "2026-11-20", amount: "" }],
  });

  it("40 passa; 41 devolve o erro no campo clientWhatsapp", () => {
    expect(validateStep("cliente", draft("9".repeat(40)), 0, 2)).toBeNull();
    expect(validateStep("cliente", draft("9".repeat(41)), 0, 2)).toEqual({ step: "cliente", message: "Use no máximo 40 caracteres.", fieldId: "clientWhatsapp" });
  });
});

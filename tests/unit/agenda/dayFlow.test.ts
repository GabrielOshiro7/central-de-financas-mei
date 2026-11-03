import { describe, it, expect } from "vitest";
import type { AppointmentStatus } from "@prisma/client";
import { autoCompleteEligibleAfter, canTransitionDay, requireTimed } from "@/lib/agenda/calculations";
import { dayCompletionRequestId } from "@/lib/agenda/dayCompletion";

// Agenda A2: regras puras do fluxo DAY.
const STATUSES: AppointmentStatus[] = ["AGENDADO", "CONFIRMADO", "CONCLUIDO", "CANCELADO", "FALTOU"];
const ALLOWED = new Set(["AGENDADO>CANCELADO", "AGENDADO>FALTOU", "CANCELADO>AGENDADO", "FALTOU>AGENDADO"]);

describe("canTransitionDay - os 25 pares (dia do atendimento = hoje)", () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const key = `${from}>${to}`;
      it(`${key}: ${ALLOWED.has(key) ? "permitido" : "recusado"}`, () => {
        expect(canTransitionDay(from, to, { scheduledOn: "2026-10-20", today: "2026-10-20" }).ok).toBe(ALLOWED.has(key));
      });
    }
  }

  it("CONFIRMADO não existe no fluxo DAY (nem de nem para)", () => {
    for (const s of STATUSES) {
      expect(canTransitionDay("AGENDADO", "CONFIRMADO", { scheduledOn: "2026-10-20", today: "2026-10-20" }).ok).toBe(false);
      expect(canTransitionDay("CONFIRMADO", s, { scheduledOn: "2026-10-20", today: "2026-10-20" }).ok).toBe(false);
    }
  });

  it("falta só a partir do dia; reabrir só se o dia não passou", () => {
    expect(canTransitionDay("AGENDADO", "FALTOU", { scheduledOn: "2026-10-21", today: "2026-10-20" })).toEqual({
      ok: false,
      error: "Só é possível marcar falta a partir do dia do atendimento.",
    });
    expect(canTransitionDay("AGENDADO", "FALTOU", { scheduledOn: "2026-10-19", today: "2026-10-20" }).ok).toBe(true);
    expect(canTransitionDay("CANCELADO", "AGENDADO", { scheduledOn: "2026-10-19", today: "2026-10-20" }).ok).toBe(false);
    expect(canTransitionDay("FALTOU", "AGENDADO", { scheduledOn: "2026-10-21", today: "2026-10-20" }).ok).toBe(true);
  });
});

describe("autoCompleteEligibleAfter (decisão 7)", () => {
  it.each([
    ["AGENDADO", "CANCELADO", false],
    ["AGENDADO", "FALTOU", false],
    ["CANCELADO", "AGENDADO", false],
    ["FALTOU", "AGENDADO", false],
    ["AGENDADO", "CONCLUIDO", undefined],
    ["AGENDADO", "CONFIRMADO", undefined],
  ] as const)("%s -> %s: %s", (from, to, expected) => {
    expect(autoCompleteEligibleAfter(from, to)).toBe(expected);
  });
});

describe("requireTimed", () => {
  it("devolve o mesmo objeto quando há horário; erro quando não há", () => {
    const timed = { id: "a", startAt: new Date(0), endAt: new Date(1) };
    expect(requireTimed(timed)).toBe(timed);
    expect(() => requireTimed({ id: "b", startAt: null, endAt: null })).toThrow(/sem horário/);
  });
});

describe("dayCompletionRequestId (decisão 5)", () => {
  it("inclui o contador de conclusões", () => {
    expect(dayCompletionRequestId("abc", 0)).toBe("agenda:abc:0");
    expect(dayCompletionRequestId("abc", 2)).toBe("agenda:abc:2");
  });
});

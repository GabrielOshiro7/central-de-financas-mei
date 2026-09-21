import { describe, it, expect } from "vitest";
import type { AppointmentStatus } from "@prisma/client";
import { canTransition, computeEndAt, detectOverlap } from "@/lib/agenda/calculations";

const ALL_STATUSES: AppointmentStatus[] = ["AGENDADO", "CONFIRMADO", "CONCLUIDO", "CANCELADO", "FALTOU"];

// Espelha a tabela de TRANSITIONS de calculations.ts, mas escrita
// independentemente aqui: se alguem alterar a tabela sem alterar este teste
// (ou vice-versa), a exaustividade abaixo pega a divergencia.
const EXPECTED_ALLOWED: Record<AppointmentStatus, AppointmentStatus[]> = {
  AGENDADO: ["CONFIRMADO", "CONCLUIDO", "CANCELADO", "FALTOU"],
  CONFIRMADO: ["CONCLUIDO", "CANCELADO", "FALTOU"],
  CONCLUIDO: [],
  CANCELADO: ["AGENDADO"],
  FALTOU: ["AGENDADO"],
};

const PAST = new Date("2026-01-01T00:00:00Z");
const NOW_AFTER_PAST = new Date("2026-01-02T00:00:00Z");
const FUTURE = new Date("2026-01-03T00:00:00Z");
const NOW_BEFORE_FUTURE = new Date("2026-01-02T00:00:00Z");

describe("canTransition - todos os 25 pares (5x5)", () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const shouldAllow = EXPECTED_ALLOWED[from].includes(to);
      // startAt no passado em relacao a `now` pra isolar exatamente a regra
      // de grafo de estados neste teste (inclusive quando to==="FALTOU",
      // que tambem exige isso) - a regra de tempo tem testes dedicados
      // abaixo, com casos passado/futuro.
      const ctx = { startAt: PAST, now: NOW_AFTER_PAST };

      it(`${from} -> ${to}: ${shouldAllow ? "permitido" : "rejeitado"}`, () => {
        const result = canTransition(from, to, ctx);
        expect(result.ok).toBe(shouldAllow);
      });
    }
  }
});

describe("canTransition - regra de tempo para FALTOU", () => {
  it("rejeita marcar falta se startAt ainda nao passou", () => {
    const result = canTransition("AGENDADO", "FALTOU", { startAt: FUTURE, now: NOW_BEFORE_FUTURE });
    expect(result.ok).toBe(false);
  });

  it("permite marcar falta se startAt ja passou", () => {
    const result = canTransition("AGENDADO", "FALTOU", { startAt: PAST, now: NOW_AFTER_PAST });
    expect(result.ok).toBe(true);
  });

  it("permite marcar falta no instante exato de startAt (nao estritamente futuro)", () => {
    const result = canTransition("AGENDADO", "FALTOU", { startAt: PAST, now: PAST });
    expect(result.ok).toBe(true);
  });

  it("usa relogio real por padrao quando now nao e passado (now e opcional)", () => {
    const startInThePast = new Date("2000-01-01T00:00:00Z");
    const result = canTransition("AGENDADO", "FALTOU", { startAt: startInThePast });
    expect(result.ok).toBe(true);
  });
});

describe("canTransition - estados terminais e reabertura", () => {
  it("CONCLUIDO nunca tem transicao de saida, mesmo para AGENDADO", () => {
    for (const to of ALL_STATUSES) {
      const result = canTransition("CONCLUIDO", to, { startAt: PAST, now: NOW_AFTER_PAST });
      expect(result.ok).toBe(false);
    }
  });

  it("CANCELADO e FALTOU podem reabrir so para AGENDADO, nunca para CONFIRMADO/CONCLUIDO direto", () => {
    expect(canTransition("CANCELADO", "AGENDADO", { startAt: PAST, now: NOW_AFTER_PAST }).ok).toBe(true);
    expect(canTransition("FALTOU", "AGENDADO", { startAt: PAST, now: NOW_AFTER_PAST }).ok).toBe(true);
    expect(canTransition("CANCELADO", "CONFIRMADO", { startAt: PAST, now: NOW_AFTER_PAST }).ok).toBe(false);
    expect(canTransition("FALTOU", "CONCLUIDO", { startAt: PAST, now: NOW_AFTER_PAST }).ok).toBe(false);
  });
});

describe("computeEndAt", () => {
  it("soma as duracoes dos servicos em minutos", () => {
    const startAt = new Date("2026-01-01T10:00:00Z");
    const endAt = computeEndAt(startAt, [{ durationMinutesSnapshot: 30 }, { durationMinutesSnapshot: 45 }]);
    expect(endAt.toISOString()).toBe("2026-01-01T11:15:00.000Z");
  });

  it("sem servicos, endAt === startAt", () => {
    const startAt = new Date("2026-01-01T10:00:00Z");
    expect(computeEndAt(startAt, []).getTime()).toBe(startAt.getTime());
  });
});

describe("detectOverlap - intervalo semiaberto [start, end)", () => {
  const baseExisting = { id: "existing-1", startAt: new Date("2026-01-01T10:00:00Z"), endAt: new Date("2026-01-01T11:00:00Z"), status: "AGENDADO" as AppointmentStatus };

  it("encostar (end do candidato == start do existente) NAO e sobreposicao", () => {
    const candidate = { startAt: new Date("2026-01-01T09:00:00Z"), endAt: new Date("2026-01-01T10:00:00Z") };
    expect(detectOverlap(candidate, [baseExisting])).toEqual([]);
  });

  it("encostar do outro lado (start do candidato == end do existente) tambem NAO e sobreposicao", () => {
    const candidate = { startAt: new Date("2026-01-01T11:00:00Z"), endAt: new Date("2026-01-01T12:00:00Z") };
    expect(detectOverlap(candidate, [baseExisting])).toEqual([]);
  });

  it("candidato contido dentro do existente e sobreposicao", () => {
    const candidate = { startAt: new Date("2026-01-01T10:15:00Z"), endAt: new Date("2026-01-01T10:45:00Z") };
    expect(detectOverlap(candidate, [baseExisting])).toEqual([baseExisting]);
  });

  it("existente contido dentro do candidato e sobreposicao", () => {
    const candidate = { startAt: new Date("2026-01-01T09:30:00Z"), endAt: new Date("2026-01-01T11:30:00Z") };
    expect(detectOverlap(candidate, [baseExisting])).toEqual([baseExisting]);
  });

  it("sobreposicao parcial (comeca antes, termina dentro) e detectada", () => {
    const candidate = { startAt: new Date("2026-01-01T09:30:00Z"), endAt: new Date("2026-01-01T10:30:00Z") };
    expect(detectOverlap(candidate, [baseExisting])).toEqual([baseExisting]);
  });

  it("atravessa meia-noite e ainda detecta sobreposicao corretamente", () => {
    const overnightExisting = {
      id: "overnight-1",
      startAt: new Date("2026-01-01T23:00:00Z"),
      endAt: new Date("2026-01-02T01:00:00Z"),
      status: "CONFIRMADO" as AppointmentStatus,
    };
    const candidateInsideOvernight = { startAt: new Date("2026-01-02T00:30:00Z"), endAt: new Date("2026-01-02T00:45:00Z") };
    expect(detectOverlap(candidateInsideOvernight, [overnightExisting])).toEqual([overnightExisting]);

    const candidateAfterOvernightEnds = { startAt: new Date("2026-01-02T01:00:00Z"), endAt: new Date("2026-01-02T02:00:00Z") };
    expect(detectOverlap(candidateAfterOvernightEnds, [overnightExisting])).toEqual([]);
  });

  it("ignora agendamentos CANCELADO e FALTOU", () => {
    const cancelled = { ...baseExisting, id: "cancelled-1", status: "CANCELADO" as AppointmentStatus };
    const noShow = { ...baseExisting, id: "noshow-1", status: "FALTOU" as AppointmentStatus };
    const candidate = { startAt: new Date("2026-01-01T10:15:00Z"), endAt: new Date("2026-01-01T10:45:00Z") };
    expect(detectOverlap(candidate, [cancelled, noShow])).toEqual([]);
  });

  it("conta AGENDADO, CONFIRMADO e CONCLUIDO", () => {
    const candidate = { startAt: new Date("2026-01-01T10:15:00Z"), endAt: new Date("2026-01-01T10:45:00Z") };
    for (const status of ["AGENDADO", "CONFIRMADO", "CONCLUIDO"] as AppointmentStatus[]) {
      const appt = { ...baseExisting, status };
      expect(detectOverlap(candidate, [appt])).toEqual([appt]);
    }
  });

  it("exclui o proprio agendamento via excludeId (usado em remarcar)", () => {
    const candidate = { startAt: new Date("2026-01-01T10:15:00Z"), endAt: new Date("2026-01-01T10:45:00Z") };
    expect(detectOverlap(candidate, [baseExisting], { excludeId: baseExisting.id })).toEqual([]);
    expect(detectOverlap(candidate, [baseExisting], { excludeId: "outro-id" })).toEqual([baseExisting]);
  });
});

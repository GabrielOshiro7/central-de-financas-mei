import { describe, it, expect } from "vitest";
import type { AppointmentStatus } from "@prisma/client";
import { AGENDA_STATUS_LABELS, AGENDA_STATUS_BADGE } from "@/lib/agenda/options";
import { expectNoBrandStatusColor, expectOnlyNeutralColors } from "../helpers/brandStatusPalette";

const ALL_STATUSES: AppointmentStatus[] = ["AGENDADO", "CONFIRMADO", "CONCLUIDO", "CANCELADO", "FALTOU"];

describe("agenda status labels", () => {
  it("todo status tem label em portugues, nao vazio", () => {
    for (const status of ALL_STATUSES) {
      expect(AGENDA_STATUS_LABELS[status]).toBeTruthy();
      expect(typeof AGENDA_STATUS_LABELS[status]).toBe("string");
    }
  });
});

describe("agenda status badge - selo neutro, com icone e texto", () => {
  it("todo status do agendamento tem um selo mapeado", () => {
    for (const status of ALL_STATUSES) {
      expect(AGENDA_STATUS_BADGE[status]).toBeDefined();
    }
  });

  it("todo selo tem texto (label nao vazio)", () => {
    for (const status of ALL_STATUSES) {
      expect(AGENDA_STATUS_BADGE[status].label).toBeTruthy();
    }
  });

  it("todo selo tem icone definido", () => {
    for (const status of ALL_STATUSES) {
      expect(AGENDA_STATUS_BADGE[status].icon).toBeDefined();
    }
  });

  it("nenhum selo usa Musgo/Âmbar/Terracota (nem tons claros/escuros equivalentes)", () => {
    for (const status of ALL_STATUSES) {
      expectNoBrandStatusColor(AGENDA_STATUS_BADGE[status].className);
    }
  });

  it("todos os selos usam apenas tons neutros (gray/neutral)", () => {
    for (const status of ALL_STATUSES) {
      expectOnlyNeutralColors(AGENDA_STATUS_BADGE[status].className);
    }
  });

  it("cada status tem um icone distinto (nao reaproveita o mesmo icone pra dois status)", () => {
    const icons = ALL_STATUSES.map((status) => AGENDA_STATUS_BADGE[status].icon);
    expect(new Set(icons).size).toBe(ALL_STATUSES.length);
  });
});

import { describe, it, expect } from "vitest";
import type { AppointmentStatus } from "@prisma/client";
import { AGENDA_STATUS_LABELS, AGENDA_STATUS_BADGE } from "@/lib/agenda/options";

const ALL_STATUSES: AppointmentStatus[] = ["AGENDADO", "CONFIRMADO", "CONCLUIDO", "CANCELADO", "FALTOU"];

// Hexes/tons usados pela paleta Musgo/Âmbar/Terracota em outras partes do
// app (ver src/components/vendas/SaleTable.tsx SALE_STATUS_BADGE_STYLE /
// PAYMENT_STATUS_BADGE_STYLE) - selo de status de agendamento nao pode usar
// nenhum deles, nem os tons claros/escuros equivalentes.
const FORBIDDEN_STATUS_COLOR_TOKENS = [
  "#3f6b4a",
  "#8a570c",
  "#a8402a",
  "#a5690f",
  "#E3EEE6",
  "#FBEDD9",
  "#FBE4DE",
  "#8FD4A0",
  "#F0B24A",
  "#F0917C",
  "#332510",
  "#1C2E21",
  "#33201B",
  "emerald",
  "amber",
  "rose",
];

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
      const className = AGENDA_STATUS_BADGE[status].className.toLowerCase();
      for (const token of FORBIDDEN_STATUS_COLOR_TOKENS) {
        expect(className).not.toContain(token.toLowerCase());
      }
    }
  });

  it("todos os selos usam apenas tons neutros (gray/neutral)", () => {
    for (const status of ALL_STATUSES) {
      const className = AGENDA_STATUS_BADGE[status].className;
      // So permite classes de cor gray-*/neutral-* (texto, borda, fundo) -
      // qualquer outra família de cor Tailwind (ex. amber-*, emerald-*,
      // rose-*, blue-*) indicaria uma cor de status vazando pro selo de
      // agendamento.
      const colorClassPattern = /\b(?:text|bg|border)-([a-z]+)-\d+/g;
      const matches = [...className.matchAll(colorClassPattern)];
      expect(matches.length).toBeGreaterThan(0);
      for (const match of matches) {
        expect(["gray", "neutral"]).toContain(match[1]);
      }
    }
  });

  it("cada status tem um icone distinto (nao reaproveita o mesmo icone pra dois status)", () => {
    const icons = ALL_STATUSES.map((status) => AGENDA_STATUS_BADGE[status].icon);
    expect(new Set(icons).size).toBe(ALL_STATUSES.length);
  });
});

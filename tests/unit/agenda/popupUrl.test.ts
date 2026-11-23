import { describe, it, expect } from "vitest";
import { isPopupOpen, novoRedirectSearch, parsePopupPrefill, searchWithPopup, searchWithoutPopup } from "@/lib/agenda/popupUrl";
import { phoneSearchDigits } from "@/lib/clients/phoneSearch";
import { servicesTotal } from "@/components/agenda/ServiceRows";

describe("URL do popup Novo agendamento", () => {
  it("abre com ?novo=1", () => {
    expect(isPopupOpen(new URLSearchParams("novo=1"))).toBe(true);
    expect(isPopupOpen(new URLSearchParams("view=day"))).toBe(false);
    expect(isPopupOpen(new URLSearchParams("novo=0"))).toBe(false);
  });

  it("pre-preenchimento: date valida, clientId e serviceId repetido", () => {
    expect(parsePopupPrefill(new URLSearchParams("novo=1&date=2026-11-24&clientId=c1&serviceId=s1&serviceId=s2"))).toEqual({
      date: "2026-11-24",
      clientId: "c1",
      serviceIds: ["s1", "s2"],
    });
  });

  it("data invalida (formato, dia inexistente, ano fora de 2000-2100) e ignorada, como antes", () => {
    for (const date of ["24/11/2026", "2026-13-01", "1999-01-01", "2101-01-01", "abc", ""]) {
      expect(parsePopupPrefill(new URLSearchParams({ novo: "1", date })).date, date).toBeUndefined();
    }
    expect(parsePopupPrefill(new URLSearchParams("novo=1")).serviceIds).toEqual([]);
  });

  it("searchWithPopup preserva view/month/day e troca o pre-preenchimento antigo", () => {
    const current = new URLSearchParams("view=day&day=2026-11-20&novo=1&date=2026-11-01&clientId=velho");
    const next = new URLSearchParams(searchWithPopup(current, { date: "2026-11-24", clientId: "c1", serviceIds: ["s1", "s2"] }));
    expect(next.get("view")).toBe("day");
    expect(next.get("day")).toBe("2026-11-20");
    expect(next.get("novo")).toBe("1");
    expect(next.get("date")).toBe("2026-11-24");
    expect(next.get("clientId")).toBe("c1");
    expect(next.getAll("serviceId")).toEqual(["s1", "s2"]);
  });

  it("searchWithoutPopup tira so novo/date/clientId/serviceId", () => {
    const next = new URLSearchParams(searchWithoutPopup(new URLSearchParams("view=calendar&month=2026-11&day=2026-11-20&novo=1&date=2026-11-24&clientId=c1&serviceId=s1&serviceId=s2")));
    expect([...next.keys()].sort()).toEqual(["day", "month", "view"]);
    expect(searchWithoutPopup(new URLSearchParams("novo=1&date=2026-11-24"))).toBe("");
  });

  it("/agenda/novo -> query de /agenda?novo=1 repassando date, clientId e serviceId (repetido)", () => {
    expect(novoRedirectSearch({ date: "2026-11-24" })).toBe("novo=1&date=2026-11-24");
    const search = new URLSearchParams(novoRedirectSearch({ clientId: "c1", serviceId: ["s1", "s2"], outro: "x" }));
    expect(search.get("novo")).toBe("1");
    expect(search.get("clientId")).toBe("c1");
    expect(search.getAll("serviceId")).toEqual(["s1", "s2"]);
    expect(search.has("outro")).toBe(false);
    expect(novoRedirectSearch({})).toBe("novo=1");
  });
});

describe("phoneSearchDigits", () => {
  it("so termo que parece telefone vira busca por digitos", () => {
    expect(phoneSearchDigits("090-1234")).toBe("0901234");
    expect(phoneSearchDigits("+55 (11) 9.8888")).toBe("551198888");
    expect(phoneSearchDigits("  123  ")).toBe("123");
  });

  it("nome (com letras), vazio e so pontuacao nao viram busca por telefone", () => {
    for (const term of ["Sala 3", "joao", "", "   ", "+-()", "1; DROP TABLE", "%", "_"]) {
      expect(phoneSearchDigits(term), term).toBeNull();
    }
  });
});

describe("servicesTotal (previa do total)", () => {
  it("soma quantidade x valor unitario e arredonda nas casas da moeda", () => {
    const rows = [
      { productId: "a", quantity: "2", unitPrice: "12000" },
      { productId: "b", quantity: "1", unitPrice: "0" },
    ];
    expect(servicesTotal(rows, 0)).toBe(24000);
    expect(servicesTotal([{ productId: "a", quantity: "3", unitPrice: "0.1" }], 2)).toBe(0.3);
    expect(servicesTotal([], 2)).toBe(0);
  });
});

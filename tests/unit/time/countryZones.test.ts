import { describe, it, expect } from "vitest";
import {
  COUNTRY_ZONES,
  DEFAULT_COUNTRY,
  DEFAULT_TIME_ZONE,
  findCountry,
  isSupportedCountry,
  isZoneOfCountry,
  timeZoneCity,
  timeZoneLabel,
  zoneForCountry,
} from "@/lib/time/countryZones";
import { isIanaTimeZoneName } from "@/lib/time/schema";

// Tabela pais -> fusos (Etapa F7).
describe("COUNTRY_ZONES", () => {
  const supported = new Set(Intl.supportedValuesOf("timeZone"));
  const canonical = (tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;

  it("todo fuso da tabela é um nome IANA aceito pelo timeZoneSchema e conhecido pelo runtime (direto ou pelo alias do ICU)", () => {
    const bad = COUNTRY_ZONES.flatMap((c) => c.zones)
      .map((z) => z.timeZone)
      .filter((tz) => !isIanaTimeZoneName(tz) || !(supported.has(tz) || supported.has(canonical(tz))));
    expect(bad).toEqual([]);
  });

  it("códigos ISO de 2 letras maiúsculas, sem repetição; nomes e rótulos preenchidos e sem repetição dentro do país", () => {
    const codes = COUNTRY_ZONES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of COUNTRY_ZONES) {
      expect(c.code, c.name).toMatch(/^[A-Z]{2}$/);
      expect(c.name.trim(), c.code).not.toBe("");
      expect(c.zones.length, c.code).toBeGreaterThan(0);
      const labels = c.zones.map((z) => z.label);
      expect(new Set(labels).size, c.code).toBe(labels.length);
      const zones = c.zones.map((z) => z.timeZone);
      expect(new Set(zones).size, c.code).toBe(zones.length);
    }
  });

  it("um fuso IANA pertence a no máximo um país (o rótulo da Agenda sai só do fuso)", () => {
    const all = COUNTRY_ZONES.flatMap((c) => c.zones.map((z) => z.timeZone));
    expect(new Set(all).size).toBe(all.length);
  });

  it("ordenada pelo nome em português", () => {
    const names = COUNTRY_ZONES.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "pt-BR")));
  });

  it("padrão Japão / Asia/Tokyo, e o Japão tem um único fuso", () => {
    expect(DEFAULT_COUNTRY).toBe("JP");
    expect(DEFAULT_TIME_ZONE).toBe("Asia/Tokyo");
    expect(findCountry("JP")?.zones).toEqual([{ timeZone: "Asia/Tokyo", label: "Tóquio" }]);
  });

  it("Brasil: Brasília (padrão), Manaus, Cuiabá, Rio Branco e Fernando de Noronha", () => {
    expect(findCountry("BR")?.zones.map((z) => [z.timeZone, z.label])).toEqual([
      ["America/Sao_Paulo", "Brasília"],
      ["America/Manaus", "Manaus"],
      ["America/Cuiaba", "Cuiabá"],
      ["America/Rio_Branco", "Rio Branco"],
      ["America/Noronha", "Fernando de Noronha"],
    ]);
  });
});

describe("consultas da tabela", () => {
  it.each([
    ["JP", "Asia/Tokyo", true],
    ["BR", "America/Sao_Paulo", true],
    ["BR", "America/Manaus", true],
    ["BR", "Asia/Tokyo", false], // fuso de outro país
    ["JP", "America/Sao_Paulo", false],
    ["BR", "America/Belem", false], // IANA válido do Brasil, mas não é um fuso de referência da tabela
    ["US", "America/New_York", true],
    ["EU", "Europe/Paris", false], // "EU" não é país
    ["XX", "UTC", false],
  ])("isZoneOfCountry(%s, %s) = %s", (country, tz, expected) => {
    expect(isZoneOfCountry(country, tz)).toBe(expected);
  });

  it.each([["JP", true], ["BR", true], ["EU", false], ["UN", false], ["jp", false], ["", false], ["XX", false]])(
    "isSupportedCountry(%j) = %s",
    (code, expected) => {
      expect(isSupportedCountry(code)).toBe(expected);
    }
  );

  it("zoneForCountry mantém o fuso atual se for do país, senão usa o padrão do país", () => {
    expect(zoneForCountry("BR", "America/Manaus")).toBe("America/Manaus");
    expect(zoneForCountry("BR", "Asia/Tokyo")).toBe("America/Sao_Paulo");
    expect(zoneForCountry("JP", "America/Sao_Paulo")).toBe("Asia/Tokyo");
    expect(zoneForCountry("EU", "Europe/Paris")).toBeUndefined();
  });

  it("timeZoneLabel / timeZoneCity: rótulo da tabela; fora dela, a cidade do id IANA", () => {
    expect(timeZoneLabel("Asia/Tokyo")).toBe("Tóquio");
    expect(timeZoneLabel("America/Sao_Paulo")).toBe("Brasília");
    expect(timeZoneLabel("America/New_York")).toBe("Nova York (Leste)");
    expect(timeZoneCity("America/New_York")).toBe("Nova York");
    expect(timeZoneCity("Europe/Lisbon")).toBe("Lisboa");
    expect(timeZoneCity("Asia/Tokyo")).toBe("Tóquio");
    expect(timeZoneLabel("America/Port_of_Spain")).toBe("Port of Spain");
    expect(timeZoneCity("UTC")).toBe("UTC");
  });
});

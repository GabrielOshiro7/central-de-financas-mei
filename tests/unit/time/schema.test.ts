import { describe, it, expect } from "vitest";
import { businessTimeZoneSchema, countryCodeSchema, isCountryCode, isIanaTimeZoneName, timeZoneSchema } from "@/lib/time/schema";

describe("timeZoneSchema", () => {
  it.each(["Asia/Tokyo", "America/Sao_Paulo", "America/Manaus", "UTC", "America/Argentina/Buenos_Aires", "America/Port-au-Prince", "Etc/GMT-9"])(
    "aceita %s",
    (tz) => {
      expect(timeZoneSchema.safeParse(tz).success).toBe(true);
    }
  );

  it.each(["Tokyo", "GMT+9", "", "   ", "+09:00", "asia/tokyo", "EST", "Marte/Olympus"])("recusa %j", (tz) => {
    const result = timeZoneSchema.safeParse(tz);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toMatch(/Fuso horário inválido/);
  });

  it("recusa o que não é string", () => {
    expect(timeZoneSchema.safeParse(9).success).toBe(false);
    expect(timeZoneSchema.safeParse(null).success).toBe(false);
  });

  it("todo fuso que o runtime anuncia (Intl.supportedValuesOf) passa", () => {
    const rejected = Intl.supportedValuesOf("timeZone").filter((tz) => !isIanaTimeZoneName(tz));
    expect(rejected).toEqual([]);
  });
});

describe("countryCodeSchema", () => {
  it.each(["JP", "BR", "US", "PT", "IN"])("aceita %s", (code) => {
    expect(countryCodeSchema.safeParse(code).success).toBe(true);
  });

  // F7: o país precisa estar na tabela país -> fusos. "EU"/"UN" (regiões que
  // o Intl conhece mas não são países) eram aceitos na F2; "AQ" é um código de
  // país real sem fuso mapeado na tabela.
  it.each(["jp", "JPN", "J", "", "12", "XX", "ZZ", "AA", "EU", "UN", "AQ"])("recusa %j", (code) => {
    const result = countryCodeSchema.safeParse(code);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toMatch(/País inválido/);
  });

  it("isCountryCode exige maiúsculas", () => {
    expect(isCountryCode("JP")).toBe(true);
    expect(isCountryCode("jp")).toBe(false);
  });
});

describe("businessTimeZoneSchema (país + fuso, Etapa F7)", () => {
  it.each([
    ["JP", "Asia/Tokyo"],
    ["BR", "America/Sao_Paulo"],
    ["BR", "America/Rio_Branco"],
    ["US", "Pacific/Honolulu"],
    ["PT", "Atlantic/Azores"],
  ])("aceita %s + %s", (country, timezone) => {
    expect(businessTimeZoneSchema.safeParse({ country, timezone }).success).toBe(true);
  });

  it("apara espaços como os schemas de cada campo", () => {
    expect(businessTimeZoneSchema.parse({ country: " BR ", timezone: " America/Manaus " })).toEqual({
      country: "BR",
      timezone: "America/Manaus",
    });
  });

  it.each([
    [{ country: "BR", timezone: "Asia/Tokyo" }, "timezone", /não pertence ao país/],
    [{ country: "JP", timezone: "America/Sao_Paulo" }, "timezone", /não pertence ao país/],
    [{ country: "BR", timezone: "America/Belem" }, "timezone", /não pertence ao país/],
    [{ country: "EU", timezone: "Europe/Paris" }, "country", /País inválido/],
    [{ country: "br", timezone: "America/Sao_Paulo" }, "country", /País inválido/],
    [{ country: "BR", timezone: "america/sao_paulo" }, "timezone", /Fuso horário inválido/],
    [{ country: "BR", timezone: "GMT-3" }, "timezone", /Fuso horário inválido/],
    [{ country: "JP", timezone: "" }, "timezone", /Fuso horário inválido/],
  ])("recusa %j", (input, path, message) => {
    const result = businessTimeZoneSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual([path]);
      expect(result.error.issues[0].message).toMatch(message);
    }
  });

  it("recusa campo ausente, tipo errado e campo extra", () => {
    expect(businessTimeZoneSchema.safeParse({ country: "JP" }).success).toBe(false);
    expect(businessTimeZoneSchema.safeParse({ timezone: "Asia/Tokyo" }).success).toBe(false);
    expect(businessTimeZoneSchema.safeParse({ country: 81, timezone: "Asia/Tokyo" }).success).toBe(false);
    expect(businessTimeZoneSchema.safeParse({ country: "JP", timezone: "Asia/Tokyo", businessId: "x" }).success).toBe(false);
    expect(businessTimeZoneSchema.safeParse(null).success).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { countryCodeSchema, isCountryCode, isIanaTimeZoneName, timeZoneSchema } from "@/lib/time/schema";

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

  it.each(["jp", "JPN", "J", "", "12", "XX", "ZZ", "AA"])("recusa %j", (code) => {
    const result = countryCodeSchema.safeParse(code);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toMatch(/País inválido/);
  });

  it("isCountryCode exige maiúsculas", () => {
    expect(isCountryCode("JP")).toBe(true);
    expect(isCountryCode("jp")).toBe(false);
  });
});

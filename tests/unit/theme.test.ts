import { describe, it, expect } from "vitest";
import { DEFAULT_THEME, parseTheme, preferenceFromTheme, themeFromPreference, themePreferenceSchema } from "@/lib/theme";

describe("tema", () => {
  it("o padrão é claro; só 'dark' explícito vira escuro (cookie ausente, vazio ou lixo = claro)", () => {
    expect(DEFAULT_THEME).toBe("light");
    expect(parseTheme(undefined)).toBe("light");
    expect(parseTheme(null)).toBe("light");
    expect(parseTheme("")).toBe("light");
    expect(parseTheme("system")).toBe("light");
    expect(parseTheme("DARK")).toBe("light");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
  });

  it("conversões banco <-> interface", () => {
    expect(themeFromPreference(null)).toBeNull();
    expect(themeFromPreference("LIGHT")).toBe("light");
    expect(themeFromPreference("DARK")).toBe("dark");
    expect(preferenceFromTheme("light")).toBe("LIGHT");
    expect(preferenceFromTheme("dark")).toBe("DARK");
  });

  it("schema da rota aceita só LIGHT/DARK e nenhum campo extra", () => {
    expect(themePreferenceSchema.safeParse({ theme: "DARK" }).success).toBe(true);
    expect(themePreferenceSchema.safeParse({ theme: "LIGHT" }).success).toBe(true);
    expect(themePreferenceSchema.safeParse({ theme: "dark" }).success).toBe(false);
    expect(themePreferenceSchema.safeParse({ theme: "DARK", extra: 1 }).success).toBe(false);
  });
});

import { z } from "zod";

// Tema do app (claro/escuro). Um unico mecanismo: o atributo `data-theme` na <html>
// (casa com o `@custom-variant dark` de globals.css). O SERVIDOR le o cookie "theme"
// e ja renderiza a <html> com o tema certo (sem script que troque depois, sem
// "piscar"); o padrao e CLARO - o app nao segue prefers-color-scheme.
//
// A escolha do usuario logado tambem vai para o banco (User.themePreference), para
// valer em outro navegador/dispositivo: o login devolve o tema salvo e o cliente o
// aplica (cookie + atributo).
export type Theme = "light" | "dark";

export const THEME_COOKIE = "theme";
export const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 ano
export const DEFAULT_THEME: Theme = "light";

export function parseTheme(value: string | null | undefined): Theme {
  return value === "dark" ? "dark" : "light";
}

// Valores do banco (enum ThemePreference) <-> tema da interface.
export type ThemePreferenceValue = "LIGHT" | "DARK";

export function themeFromPreference(preference: ThemePreferenceValue | null | undefined): Theme | null {
  if (preference === "DARK") return "dark";
  if (preference === "LIGHT") return "light";
  return null;
}

export function preferenceFromTheme(theme: Theme): ThemePreferenceValue {
  return theme === "dark" ? "DARK" : "LIGHT";
}

export const themePreferenceSchema = z.object({ theme: z.enum(["LIGHT", "DARK"], { message: "Tema inválido." }) }).strict();

// Opcoes do cookie gravado pelo servidor (rotas de login / preferencia). O cookie NAO
// e httpOnly: o botao de tema o grava imediatamente no navegador.
export const themeCookieOptions = {
  path: "/",
  maxAge: THEME_COOKIE_MAX_AGE_SECONDS,
  sameSite: "lax" as const,
};

"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE_SECONDS, preferenceFromTheme, type Theme } from "@/lib/theme";

// Tema do app - ver src/lib/theme.ts. O servidor ja renderiza a <html> com
// data-theme (lido do cookie "theme"); este provider so guarda o tema atual para os
// componentes (ex.: o icone do botao) e aplica as trocas: atributo no <html>, cookie
// (imediato, para a proxima renderizacao no servidor sair certa) e, para usuario
// logado, a preferencia no banco.
type SetThemeOptions = {
  // Salva a escolha no banco (usuario logado). Visitante: so cookie.
  persist?: boolean;
};

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme, options?: SetThemeOptions) => Promise<boolean>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function applyThemeToDocument(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function ThemeProvider({ initialTheme, children }: { initialTheme: Theme; children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const setTheme = useCallback(async (next: Theme, options: SetThemeOptions = {}) => {
    setThemeState(next);
    applyThemeToDocument(next);
    if (!options.persist) return true;
    try {
      const res = await fetch("/api/account/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: preferenceFromTheme(next) }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme precisa estar dentro de <ThemeProvider>.");
  return context;
}

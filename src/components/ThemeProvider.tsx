"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * attribute="data-theme": casa com o `@custom-variant dark` em globals.css
 * (seletor por atributo, não a classe ".dark" padrão do next-themes).
 * defaultTheme="system" + enableSystem: primeira visita usa
 * prefers-color-scheme; depois disso, a escolha manual do usuário
 * (persistida em localStorage pelo próprio next-themes) tem prioridade.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="data-theme" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}

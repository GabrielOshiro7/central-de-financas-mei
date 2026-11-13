"use client";

import { useEffect } from "react";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/lib/theme";

// Roda uma vez por carga do app autenticado ((app)/layout).
//
// 1) Migracao do legado: o mecanismo antigo guardava o tema so no navegador
//    (localStorage "theme": "light" | "dark" | "system", do next-themes). Se o
//    usuario ainda NAO tem escolha no banco e o navegador tem "light"/"dark", a
//    escolha vai para o banco (e para o cookie) e so ENTAO o item antigo e removido.
//    Se ja ha escolha no banco, ela vence e o item antigo e apenas removido.
// 2) Sincronia: com escolha salva no banco diferente do tema aplicado (ex.: cookie
//    ausente), aplica a salva.
export function ThemeSync({ savedTheme }: { savedTheme: Theme | null }) {
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    let legacy: string | null = null;
    try {
      legacy = localStorage.getItem("theme");
    } catch {
      return;
    }

    const removeLegacy = () => {
      try {
        localStorage.removeItem("theme");
      } catch {}
    };

    if (legacy !== null) {
      if (savedTheme === null && (legacy === "light" || legacy === "dark")) {
        void setTheme(legacy, { persist: true }).then((ok) => {
          if (ok) removeLegacy(); // so apaga depois de gravar no banco
        });
        return;
      }
      removeLegacy();
    }

    if (savedTheme !== null && savedTheme !== theme) {
      void setTheme(savedTheme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez por carga
  }, []);

  return null;
}

import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { Sidebar } from "@/components/nav/Sidebar";
import { ThemeSync } from "@/components/ThemeSync";
import { themeFromPreference } from "@/lib/theme";
import { countUnreadInsights } from "@/lib/insights/reads";
import { clockFor } from "@/lib/time/zoned";

// Tipografia do app autenticado (Inter) - escopada só a esta subárvore via
// `inter.className`, não ao body inteiro, para não mudar a landing pública
// (que não usa esta fonte). PolySans (pedida junto com Inter) é uma fonte
// comercial sem licença/arquivo neste repo - usando só Inter até isso ser
// resolvido.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

// O script anti-flash que lê `sidebar-collapsed` do localStorage vive no
// root layout (src/app/layout.tsx), não aqui - precisa da estratégia
// `beforeInteractive` do next/script, que só é permitida no root layout.

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, business } = await requireOnboardedUser();
  // Insights nao lidos (uma contagem no banco) - contador ao lado da lampada da barra
  // lateral; revalidado por router.refresh() ao marcar/desmarcar.
  const unreadInsights = await countUnreadInsights(user.id, business.id, clockFor(business));

  return (
    <div data-app-shell="" className={`${inter.className} min-h-screen bg-page`}>
      <Sidebar businessName={business.name ?? "Minha empresa"} unreadInsights={unreadInsights} />
      <ThemeSync savedTheme={themeFromPreference(user.themePreference)} />
      {/* overflow-x-clip: recorta nas bordas do main o fundo full-bleed da
          barra do Financeiro (.subnav-backdrop). "clip" (e não "hidden") não
          cria container de rolagem, então o sticky da barra continua preso à
          rolagem da página. */}
      <main className="min-h-screen overflow-x-clip pl-(--sidebar-w) transition-[padding-left,background-color,border-color,color] duration-250 ease-in-out">
        <div className="mx-auto max-w-5xl px-6 py-10">{children}</div>
      </main>
    </div>
  );
}

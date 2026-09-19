import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { Sidebar } from "@/components/nav/Sidebar";

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
  const { business } = await requireOnboardedUser();

  return (
    <div className={`${inter.className} min-h-screen bg-[#FAF9F6] dark:bg-neutral-950`}>
      <Sidebar businessName={business.name ?? "Minha empresa"} />
      <main className="min-h-screen pl-(--sidebar-w) transition-[padding-left,background-color,border-color,color] duration-250 ease-in-out">
        <div className="mx-auto max-w-5xl px-6 py-10">{children}</div>
      </main>
    </div>
  );
}

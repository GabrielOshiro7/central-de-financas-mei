import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { BRAND_NAME } from "@/lib/brand";

// Logo acima do cartao (login, cadastro, esqueci a senha, redefinir senha e /reaceite). A logo aparece
// aqui UMA vez so, para todas as telas que usam este layout.
//  - "link":   logo que leva a "/" (nome acessivel do link = BRAND_NAME). Padrao.
//  - "static": logo sem link (/reaceite e onboarding: dali so se sai pelos botoes da propria tela).
//  - "none":   sem logo (opcao disponivel; nenhuma tela usa hoje).
export type AuthBrand = "link" | "static" | "none";

// Altura da logo completa nestas telas (px). Em 320 px de largura ela cabe com folga (cerca de 185 px de largura).
const AUTH_LOGO_HEIGHT = 36;

export function AuthCard({
  title,
  subtitle,
  children,
  brand = "link",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  brand?: AuthBrand;
}) {
  return (
    // <main>: regiao principal da pagina (WCAG 1.3.1 / 2.4.1 - leitores de tela pulam direto ao conteudo).
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 dark:bg-neutral-950">
      <div className="w-full max-w-sm">
      {brand !== "none" && (
        // Centralizada, 24 px (mb-6) acima do cartao. A parte escura da logo herda a cor de texto principal do
        // app: o token --foreground (text-foreground, o mesmo do <body>), que vale #111111 no claro e #D9DADC no
        // escuro; o laranja e o token de acento. A logo NAO e um titulo: o h1 da tela continua sendo o do cartao
        // (o h1 usa o tom de titulo, mais claro no escuro, e por isso nao serve de referencia para a logo).
        <div className="mb-6 flex justify-center text-foreground">
          {brand === "link" ? (
            <Link href="/" title={BRAND_NAME} className="inline-flex">
              <BrandLogo height={AUTH_LOGO_HEIGHT} className="block" />
            </Link>
          ) : (
            <BrandLogo height={AUTH_LOGO_HEIGHT} className="block" />
          )}
        </div>
      )}
      <div className="border border-gray-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-center text-xl font-semibold text-gray-900 dark:text-neutral-100">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-center text-sm text-gray-500 dark:text-neutral-400">
            {subtitle}
          </p>
        )}
        <div className="mt-6">{children}</div>
      </div>
      <LegalLinks className="mt-4 text-gray-500 dark:text-neutral-400" />
      </div>
    </main>
  );
}

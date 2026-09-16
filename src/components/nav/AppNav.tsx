"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { ThemeToggle } from "@/components/ThemeToggle";

// "Minha empresa" saiu do menu principal na Etapa 5.1 - o conteudo mudou
// para dentro de Configuracoes (secao "Empresa"). Ordem base fixada pelo
// prompt da Etapa 5.1 (nao e decisao livre): Dashboard, Financeiro, Caixa,
// Assistente, Configuracoes. Clientes/Vendas (Etapa 6) foram inseridos logo
// apos Financeiro - sao a camada comercial que alimenta o financeiro, mesma
// vizinhanca conceitual. Insights (Etapa 7) foi inserido logo apos Vendas -
// e uma camada de leitura sobre o financeiro/comercial, faz sentido ficar
// junto dessa vizinhanca antes de Caixa.
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/financeiro", label: "Financeiro", icon: "💰" },
  { href: "/clientes", label: "Clientes", icon: "👥" },
  { href: "/vendas", label: "Vendas", icon: "🛒" },
  { href: "/insights", label: "Insights", icon: "💡" },
  { href: "/caixa", label: "Caixa", icon: "🏦" },
  { href: "/assistente", label: "Assistente", icon: "🤖" },
  { href: "/configuracoes", label: "Configurações", icon: "⚙️" },
];

export function AppNav({ businessName }: { businessName: string }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-gray-900 dark:text-neutral-100">{businessName}</span>
          <nav className="flex flex-wrap gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                      : "text-gray-600 hover:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  }`}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle className="text-gray-600 dark:text-neutral-400" />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}

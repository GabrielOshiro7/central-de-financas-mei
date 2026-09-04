"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/empresa", label: "Minha empresa", icon: "🏢" },
  { href: "/financeiro", label: "Financeiro", icon: "💰" },
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
        <LogoutButton />
      </div>
    </header>
  );
}

"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Currency } from "@prisma/client";
import { TransactionFormModal, type CategoryOption } from "@/components/financeiro/TransactionFormModal";

const TABS = [
  { href: "/financeiro", label: "Visão geral" },
  { href: "/financeiro/receitas", label: "Receitas" },
  { href: "/financeiro/custos", label: "Custos" },
  { href: "/financeiro/despesas", label: "Despesas" },
  { href: "/financeiro/recorrentes", label: "Recorrentes" },
  { href: "/financeiro/importar", label: "Importação" },
];

export function FinanceiroShell({
  categories,
  currency,
  children,
}: {
  categories: CategoryOption[];
  currency: Currency | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-900">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "text-gray-600 hover:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          + Novo lançamento
        </button>
      </div>

      {children}

      <TransactionFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        categories={categories}
        currency={currency}
      />
    </div>
  );
}

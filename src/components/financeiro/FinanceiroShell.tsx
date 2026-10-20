"use client";

import { type ReactNode, useState } from "react";
import type { Currency } from "@prisma/client";
import { FinanceiroTabBar } from "@/components/financeiro/FinanceiroTabBar";
import { TransactionFormModal, type CategoryOption } from "@/components/financeiro/TransactionFormModal";

export function FinanceiroShell({
  categories,
  currency,
  children,
}: {
  categories: CategoryOption[];
  currency: Currency | null;
  children: ReactNode;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <FinanceiroTabBar
        action={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold whitespace-nowrap text-white transition hover:bg-gray-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {/* Em tela estreita só o "+" fica visível, pra sobrar espaço
                pras abas; o nome acessível continua "+ Novo lançamento". */}
            +<span className="sr-only sm:not-sr-only"> Novo lançamento</span>
          </button>
        }
      />

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

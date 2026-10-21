"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { Currency, FinancialEntryType } from "@prisma/client";
import { TransactionFormModal, type CategoryOption } from "@/components/financeiro/TransactionFormModal";
import { CREATE_BUTTON_CLASS, CreateButtonContent } from "@/components/CreateButton";

// Botão de criação contextual do Financeiro (substitui o "+ Novo lançamento"
// global da barra de abas). Estilo e conteúdo vêm do modelo compartilhado de
// botão de criação (src/components/CreateButton.tsx).
export function NewTransactionButton({
  label,
  categories,
  currency,
  defaultType,
  lockType = false,
  lockRecurring = false,
  className = "",
}: {
  label: string;
  categories: CategoryOption[];
  currency: Currency | null;
  defaultType?: FinancialEntryType;
  lockType?: boolean;
  lockRecurring?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${CREATE_BUTTON_CLASS} ${className}`}>
        <CreateButtonContent label={label} />
      </button>
      {/* Portal no <body>: o botão também é usado dentro de estados vazios
          (text-center, text-sm, cor apagada) e o modal herdaria esse estilo.
          Montar só quando aberto também garante formulário limpo a cada
          abertura. */}
      {open &&
        createPortal(
          <TransactionFormModal
            open
            onClose={() => setOpen(false)}
            categories={categories}
            currency={currency}
            defaultType={defaultType}
            lockType={lockType}
            lockRecurring={lockRecurring}
          />,
          document.body
        )}
    </>
  );
}

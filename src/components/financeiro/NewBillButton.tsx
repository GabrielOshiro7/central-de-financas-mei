"use client";

import { useState } from "react";
import type { Currency } from "@prisma/client";
import { BillFormModal, type BillCategoryOption } from "@/components/financeiro/BillFormModal";
import type { BillDirection } from "@/lib/finance/bills/status";

export function NewBillButton({
  direction,
  categories,
  currency,
}: {
  direction: BillDirection;
  categories: BillCategoryOption[];
  currency: Currency | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {direction === "PAYABLE" ? "+ Nova conta a pagar" : "+ Nova conta a receber"}
      </button>

      <BillFormModal
        open={open}
        onClose={() => setOpen(false)}
        direction={direction}
        categories={categories}
        currency={currency}
      />
    </>
  );
}

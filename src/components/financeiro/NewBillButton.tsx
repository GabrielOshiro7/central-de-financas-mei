"use client";

import { useState } from "react";
import type { Currency } from "@prisma/client";
import { BillFormModal, type BillCategoryOption } from "@/components/financeiro/BillFormModal";
import type { BillDirection } from "@/lib/finance/bills/status";
import { CREATE_BUTTON_CLASS, CreateButtonContent } from "@/components/CreateButton";

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
        className={CREATE_BUTTON_CLASS}
      >
        <CreateButtonContent label={direction === "PAYABLE" ? "Nova conta a pagar" : "Nova conta a receber"} />
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

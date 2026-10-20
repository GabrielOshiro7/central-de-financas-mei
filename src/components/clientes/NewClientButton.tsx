"use client";

import { useState } from "react";
import { ClientFormModal } from "@/components/clientes/ClientFormModal";

export function NewClientButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        + Novo cliente
      </button>

      <ClientFormModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

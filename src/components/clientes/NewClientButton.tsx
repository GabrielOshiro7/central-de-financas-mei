"use client";

import { useState } from "react";
import { ClientFormModal } from "@/components/clientes/ClientFormModal";
import { CREATE_BUTTON_CLASS, CreateButtonContent } from "@/components/CreateButton";

export function NewClientButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={CREATE_BUTTON_CLASS}
      >
        <CreateButtonContent label="Novo cliente" />
      </button>

      <ClientFormModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

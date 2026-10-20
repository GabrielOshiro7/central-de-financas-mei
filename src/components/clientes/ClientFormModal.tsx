"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ClientType } from "@prisma/client";
import { FormField } from "@/components/FormField";
import { SubmitButton } from "@/components/SubmitButton";
import { CLIENT_TYPE_OPTIONS } from "@/lib/clients/options";

export type ClientFormInitial = {
  id: string;
  name: string;
  tradeName: string;
  clientType: ClientType;
  document: string;
  phone: string;
  whatsapp: string;
  email: string;
  addressLine: string;
  city: string;
  state: string;
  country: string;
  notes: string;
};

// Cadastro/edicao de cliente (Etapa 6). So `name` e obrigatorio - o restante
// e deliberadamente opcional (nao assume CPF/CNPJ nem formato de telefone de
// nenhum pais especifico, ver clientSchema).
export function ClientFormModal({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial?: ClientFormInitial | null;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const isEditing = Boolean(initial);

  const [name, setName] = useState(initial?.name ?? "");
  const [tradeName, setTradeName] = useState(initial?.tradeName ?? "");
  const [clientType, setClientType] = useState<ClientType>(initial?.clientType ?? "PESSOA_FISICA");
  const [document, setDocument] = useState(initial?.document ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [addressLine, setAddressLine] = useState(initial?.addressLine ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [state, setState] = useState(initial?.state ?? "");
  const [country, setCountry] = useState(initial?.country ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) return null;

  function reset() {
    setName("");
    setTradeName("");
    setClientType("PESSOA_FISICA");
    setDocument("");
    setPhone("");
    setWhatsapp("");
    setEmail("");
    setAddressLine("");
    setCity("");
    setState("");
    setCountry("");
    setNotes("");
    setError(null);
  }

  function handleClose() {
    if (!isEditing) reset();
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Digite o nome do cliente.");
      return;
    }

    setPending(true);
    try {
      const url = isEditing ? `/api/clientes/${initial!.id}` : "/api/clientes";
      const payload = {
        name,
        tradeName: tradeName || undefined,
        clientType,
        document: document || undefined,
        phone: phone || undefined,
        whatsapp: whatsapp || undefined,
        email: email || undefined,
        addressLine: addressLine || undefined,
        city: city || undefined,
        state: state || undefined,
        country: country || undefined,
        notes: notes || undefined,
      };

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Não foi possível salvar o cliente.");
        return;
      }
      if (!isEditing) reset();
      onSaved?.();
      router.refresh();
      onClose();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={handleClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto bg-white p-6 shadow-lg dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
          {isEditing ? "Editar cliente" : "Novo cliente"}
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4" noValidate>
          <FormField id="name" label="Nome" placeholder="Ex.: João Silva" value={name} onChange={(e) => setName(e.target.value)} />

          <FormField
            id="tradeName"
            label="Nome fantasia (opcional)"
            value={tradeName}
            onChange={(e) => setTradeName(e.target.value)}
          />

          <div>
            <label htmlFor="clientType" className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300">
              Tipo
            </label>
            <select
              id="clientType"
              value={clientType}
              onChange={(e) => setClientType(e.target.value as ClientType)}
              className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {CLIENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <FormField
            id="document"
            label="Documento (CPF/CNPJ/outro, opcional)"
            value={document}
            onChange={(e) => setDocument(e.target.value)}
          />

          <FormField id="phone" label="Telefone (opcional)" value={phone} onChange={(e) => setPhone(e.target.value)} />

          <FormField id="whatsapp" label="WhatsApp (opcional)" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />

          <FormField id="email" label="E-mail (opcional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

          <FormField
            id="addressLine"
            label="Endereço (opcional)"
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
          />

          <div className="flex gap-3">
            <div className="flex-1">
              <FormField id="city" label="Cidade (opcional)" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="flex-1">
              <FormField id="state" label="Estado/Província (opcional)" value={state} onChange={(e) => setState(e.target.value)} />
            </div>
          </div>

          <FormField id="country" label="País (opcional)" value={country} onChange={(e) => setCountry(e.target.value)} />

          <div>
            <label htmlFor="notes" className="mb-1 block text-sm font-medium text-gray-700 dark:text-neutral-300">
              Observações (opcional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Cancelar
            </button>
            <div className="flex-1">
              <SubmitButton pending={pending} pendingText="Salvando...">
                Salvar
              </SubmitButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

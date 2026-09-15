"use client";

import { useState, type FormEvent } from "react";
import { FormField } from "@/components/FormField";
import { SubmitButton } from "@/components/SubmitButton";

// Modal generico de reautenticacao (step-up/"sudo mode") - um componente
// so, reaproveitado por qualquer acao sensivel (Etapa sessao-expiracao-
// reauth, secao 3). Quem chama passa a acao pretendida e recebe onConfirmed
// so depois que a senha foi validada no servidor (POST /api/auth/reauth) -
// nunca executa a acao original antes disso.
export function ReauthModal({
  open,
  actionLabel,
  onConfirmed,
  onCancel,
}: {
  open: boolean;
  actionLabel: string;
  onConfirmed: () => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!password) {
      setError("Digite sua senha.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/auth/reauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Não foi possível confirmar a senha.");
        return;
      }

      setPassword("");
      onConfirmed();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  function handleCancel() {
    setPassword("");
    setError(null);
    onCancel();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={handleCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirme sua senha"
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Confirme sua senha</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-neutral-400">
          Por segurança, confirme sua senha para {actionLabel}.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4" noValidate>
          <FormField
            id="reauth-password"
            label="Senha"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={pending}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Cancelar
            </button>
            <SubmitButton pending={pending} pendingText="Confirmando...">
              Confirmar
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}

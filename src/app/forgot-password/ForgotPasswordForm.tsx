"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { FormField } from "@/components/FormField";
import { SubmitButton } from "@/components/SubmitButton";
import { forgotPasswordSchema } from "@/lib/validation/auth";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json();

      // A resposta e sempre generica, mesmo em erro de validacao de rate
      // limit no backend, entao so tratamos falha de rede aqui.
      setMessage(data.message ?? "Se este e-mail existir, você receberá um link.");
    } catch {
      setError("Erro de conexao. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  if (message) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-gray-700 dark:text-neutral-300">{message}</p>
        <Link
          href="/login"
          className="text-center text-sm font-medium text-gray-900 hover:underline dark:text-neutral-100"
        >
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <FormField
        id="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <SubmitButton pending={pending} pendingText="Enviando...">
        Enviar link
      </SubmitButton>

      <Link
        href="/login"
        className="text-center text-sm text-gray-500 hover:underline dark:text-neutral-400"
      >
        Voltar para o login
      </Link>
    </form>
  );
}

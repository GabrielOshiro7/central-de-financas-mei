"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/FormField";
import { SubmitButton } from "@/components/SubmitButton";
import { loginSchema } from "@/lib/validation/auth";

export function LoginForm({ sessionMessage }: { sessionMessage?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email, password, rememberMe });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Não foi possível entrar.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Erro de conexao. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {sessionMessage && (
        <p
          role="status"
          className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:bg-neutral-800/60 dark:text-neutral-300"
        >
          {sessionMessage}
        </p>
      )}
      <FormField
        id="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <FormField
        id="password"
        label="Senha"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-neutral-300">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 dark:border-neutral-700"
        />
        Lembrar de mim
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <SubmitButton pending={pending} pendingText="Entrando...">
        Entrar
      </SubmitButton>

      <div className="flex flex-col items-center gap-2 text-sm text-gray-500 dark:text-neutral-400">
        <Link href="/forgot-password" className="hover:underline">
          Esqueci minha senha
        </Link>
        <p>
          Ainda não tenho uma conta →{" "}
          <Link href="/register" className="font-medium text-gray-900 hover:underline dark:text-neutral-100">
            Criar conta
          </Link>
        </p>
      </div>
    </form>
  );
}

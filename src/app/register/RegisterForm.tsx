"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/FormField";
import { SubmitButton } from "@/components/SubmitButton";
import { registerSchema } from "@/lib/validation/auth";
import { useEnterToNextField } from "@/components/forms/useEnterToNextField";
import { LEGAL_PATHS, REGISTER_ACCEPT_LEAD, REGISTER_ACCEPT_PRIVACY_LABEL, REGISTER_ACCEPT_TERMS_LABEL } from "@/content/legal/meta";

export function RegisterForm() {
  const enterNav = useEnterToNextField<HTMLFormElement>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return; // guarda contra envio duplo (Enter repetido / duplo clique)
    setError(null);

    const parsed = registerSchema.safeParse({ name, email, password, confirmPassword, acceptTerms });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados invalidos.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Não foi possível criar a conta.");
        setPending(false);
        return;
      }

      // Sucesso: o formulario navega para outra tela. O pending NAO volta a false aqui (o botao fica travado
      // ate a tela trocar): um Enter/clique nesse intervalo nao manda um segundo envio. So os caminhos de
      // erro (resposta nao-ok, excecao) destravam o botao.
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Erro de conexao. Tente novamente.");
      setPending(false);
    }
  }

  return (
    <form {...enterNav} onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <FormField
        id="name"
        label="Nome"
        type="text"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <FormField
        id="email"
        label="E-mail"
        hint="Usado para entrar na sua conta e recuperar a senha."
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <FormField
        id="password"
        label="Senha"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <FormField
        id="confirmPassword"
        label="Confirmar senha"
        type="password"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />

      <label htmlFor="acceptTerms" className="flex items-start gap-2 text-sm text-gray-700 dark:text-neutral-300">
        <input
          id="acceptTerms"
          type="checkbox"
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 border-gray-300 dark:border-neutral-600"
        />
        <span>
          {REGISTER_ACCEPT_LEAD}{" "}
          <Link href={LEGAL_PATHS.terms} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 underline dark:text-neutral-100">
            {REGISTER_ACCEPT_TERMS_LABEL}
          </Link>{" "}
          e a{" "}
          <Link href={LEGAL_PATHS.privacy} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 underline dark:text-neutral-100">
            {REGISTER_ACCEPT_PRIVACY_LABEL}
          </Link>
        </span>
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <SubmitButton pending={pending} pendingText="Criando conta...">
        Criar conta
      </SubmitButton>

      <p className="text-center text-sm text-gray-500 dark:text-neutral-400">
        Já tenho uma conta →{" "}
        <Link href="/login" className="font-medium text-gray-900 hover:underline dark:text-neutral-100">
          Entrar
        </Link>
      </p>
    </form>
  );
}

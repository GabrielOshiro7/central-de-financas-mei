"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";
import { LogoutButton } from "@/components/LogoutButton";
import { legalAcceptSchema } from "@/lib/validation/auth";
import { LEGAL_PATHS, REGISTER_ACCEPT_LEAD, REGISTER_ACCEPT_PRIVACY_LABEL, REGISTER_ACCEPT_TERMS_LABEL } from "@/content/legal/meta";

// Caixa de aceite + botao do reaceite. O texto da caixa e IGUAL ao do cadastro (declaracao de ter a
// idade minima + aceite dos dois documentos): vem das constantes REGISTER_ACCEPT_* de meta.ts, e a idade
// vem so de MINIMUM_AGE.
// Aceitar grava data/hora e as versoes vigentes (servidor) e
// libera o app; "Sair" encerra a sessao (o usuario nao fica preso nesta tela).
export function ReacceptForm() {
  const router = useRouter();
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return; // guarda contra envio duplo (Enter repetido / duplo clique)
    setError(null);

    const parsed = legalAcceptSchema.safeParse({ acceptTerms });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/legal/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível registrar o aceite.");
        setPending(false);
        return;
      }
      // Sucesso: o formulario navega para outra tela. O pending NAO volta a false aqui (o botao fica travado
      // ate a tela trocar): um Enter/clique nesse intervalo nao manda um segundo envio. So os caminhos de
      // erro (resposta nao-ok, excecao) destravam o botao.
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
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

      <SubmitButton pending={pending} pendingText="Registrando...">
        Aceitar e continuar
      </SubmitButton>

      <div className="flex justify-center">
        <LogoutButton />
      </div>
    </form>
  );
}

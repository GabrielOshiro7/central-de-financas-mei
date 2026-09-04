import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/cookies";
import { LogoutButton } from "./LogoutButton";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-neutral-800 dark:bg-neutral-900">
        <span className="font-semibold text-gray-900 dark:text-neutral-100">
          Nome do Sistema
        </span>
        <LogoutButton />
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">
          Bem-vindo, {user.name}
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">
          {user.email}
        </p>
        <p className="mt-8 text-sm text-gray-500 dark:text-neutral-400">
          Esta é a base de autenticação da Etapa 1. As funcionalidades de
          empresa, produtos, vendas e financeiro chegam nas próximas etapas.
        </p>
      </main>
    </div>
  );
}

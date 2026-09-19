"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * `icon`/`labelClassName` existem só para o uso na Sidebar (ícone sempre no
 * DOM, texto escondido via CSS no estado recolhido — ver `.sidebar-label`
 * em globals.css) sem duplicar a lógica de logout num segundo componente.
 * O `aria-label` fixo garante o mesmo nome acessível ("Sair") mesmo quando
 * o texto visível vira "Saindo..." durante o pending.
 */
export function LogoutButton({
  className = "border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800",
  icon,
  labelClassName,
}: {
  className?: string;
  icon?: ReactNode;
  labelClassName?: string;
} = {}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={pending}
      aria-label="Sair"
      title="Sair"
      className={`inline-flex items-center gap-2 ${className}`}
    >
      {icon}
      <span className={labelClassName}>{pending ? "Saindo..." : "Sair"}</span>
    </button>
  );
}

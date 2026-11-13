"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Circle, CircleCheck } from "lucide-react";

// Corpo do card + rodape com o botão lido/não lido (canto inferior direito).
// Atualização otimista: o estado muda na hora e volta ao último valor CONFIRMADO se a
// gravação falhar; depois um router.refresh() revalida a rota/layout (contador da barra
// lateral) sem recarregar a página inteira. Cliques/teclas rápidos não se perdem: as
// gravações vão em fila, na ordem. Card lido: só levemente atenuado (opacidade do conteúdo) - sem mudar
// o layout.
export function InsightReadShell({
  insightKey,
  initialRead,
  footerLeft,
  children,
}: {
  insightKey: string;
  initialRead: boolean;
  footerLeft?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [read, setRead] = useState(initialRead);
  const latest = useRef(initialRead); // o que o usuário vê (otimista)
  const confirmed = useRef(initialRead); // o que o servidor já gravou
  const queue = useRef<Promise<void>>(Promise.resolve());

  async function save(next: boolean) {
    try {
      const res = await fetch("/api/insights/read", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insightKey, read: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      confirmed.current = next;
    } catch {
      // Reverte para o último valor confirmado.
      latest.current = confirmed.current;
      setRead(confirmed.current);
    }
  }

  function toggle() {
    const next = !latest.current;
    latest.current = next;
    setRead(next); // otimista
    queue.current = queue.current.then(() => save(next)).then(() => router.refresh());
  }

  return (
    <>
      <div data-testid="insight-body" data-read={read} className={`flex flex-col gap-3 transition-opacity ${read ? "opacity-60" : ""}`}>
        {children}
      </div>
      <div className="mt-auto flex items-end justify-between gap-2">
        <div>{footerLeft}</div>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={read}
          aria-label={read ? "Marcar como não lido" : "Marcar como lido"}
          title={read ? "Marcar como não lido" : "Marcar como lido"}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 dark:focus-visible:outline-neutral-100"
        >
          {read ? (
            <CircleCheck size={18} strokeWidth={2} className="text-ember" aria-hidden="true" />
          ) : (
            <Circle size={18} strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>
      </div>
    </>
  );
}

"use client";

export type FilterPillOption = { value: string; label: string; count?: number };

// Grupo de pilulas de filtro (uma selecionada por vez) - o estilo dos filtros de
// vencimento de Contas a pagar/receber, compartilhado com os filtros de pagamento
// de Vendas. Sempre neutro (cinza): a paleta de status nao entra em botoes.
// `count` (opcional) aparece junto ao rotulo: "Atrasadas (3)".
export function FilterPills({
  options,
  value,
  onChange,
  label,
}: {
  options: FilterPillOption[];
  value: string;
  onChange: (value: string) => void;
  // Nome acessivel do grupo.
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            value === option.value
              ? "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-400"
          }`}
        >
          {option.label}
          {option.count !== undefined ? ` (${option.count})` : ""}
        </button>
      ))}
    </div>
  );
}

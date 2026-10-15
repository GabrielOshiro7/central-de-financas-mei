import { Bot } from "lucide-react";

// `hasFinancialData`: o dashboard passa quando a empresa ja tem lancamentos
// (mesma condicao hasAnyEntriesEver que decide o estado vazio da pagina) -
// ai o convite "depois que voce cadastrar" deixa de ser verdade.
export function AssistantPanel({ hasFinancialData = false }: { hasFinancialData?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-neutral-100">
        <Bot size={16} strokeWidth={1.75} aria-hidden="true" />
        Assistente de IA
      </h2>
      <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">
        {hasFinancialData
          ? "O assistente ainda não está disponível."
          : "Depois que você cadastrar seus dados financeiros, poderei ajudar a analisar sua empresa."}
      </p>
      <button
        type="button"
        disabled
        className="mt-4 cursor-not-allowed rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-500 dark:bg-neutral-800 dark:text-neutral-500"
      >
        Perguntar ao assistente
      </button>
    </div>
  );
}

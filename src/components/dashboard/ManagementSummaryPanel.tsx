// "Resumo do período" (secao 24 da Etapa 4) - texto gerado por regras
// deterministicas (generateSummaryText em insights.ts), nao por IA.
export function ManagementSummaryPanel({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Resumo do período</h2>
      <p className="mt-2 text-sm text-gray-700 dark:text-neutral-300">{text}</p>
    </div>
  );
}

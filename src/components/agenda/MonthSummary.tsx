import type { AppointmentStatus } from "@prisma/client";

// So contagens (secao 6 do redesign) - nenhum valor em dinheiro aqui de
// proposito. Rotulos no plural, diferentes de AGENDA_STATUS_LABELS
// (options.ts, singular, usado no selo de status de cada agendamento) -
// contexto de resumo é diferente do contexto de selo, copy própria.
const SUMMARY_ROWS: { key: AppointmentStatus; label: string }[] = [
  { key: "AGENDADO", label: "Agendados" },
  { key: "CONFIRMADO", label: "Confirmados" },
  { key: "CONCLUIDO", label: "Concluídos" },
  { key: "FALTOU", label: "Faltas" },
  { key: "CANCELADO", label: "Cancelados" },
];

export function MonthSummary({ counts }: { counts: Record<AppointmentStatus, number> }) {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <div className="text-2xl font-bold text-gray-900 dark:text-neutral-100">{total}</div>
        <div className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-neutral-400">Total</div>
      </div>
      {SUMMARY_ROWS.map(({ key, label }) => (
        <div key={key} className="rounded-xl border border-gray-200 bg-white p-4 text-center dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-2xl font-bold text-gray-900 dark:text-neutral-100">{counts[key]}</div>
          <div className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-neutral-400">{label}</div>
        </div>
      ))}
    </div>
  );
}

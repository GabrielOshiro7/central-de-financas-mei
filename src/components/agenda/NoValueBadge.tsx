// Selo "Sem valor" dos agendamentos por dia (DAY) de total zero (ex.: reuniao).
// Sempre neutro (cinza) - nunca as cores da paleta de status (Musgo/Ambar/
// Terracota), como o AppointmentStatusBadge.
export function NoValueBadge() {
  return (
    <span
      data-testid="no-value-badge"
      className="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-600 dark:border-neutral-700 dark:text-neutral-400"
    >
      Sem valor
    </span>
  );
}

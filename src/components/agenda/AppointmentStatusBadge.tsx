import type { AppointmentStatus } from "@prisma/client";
import { AGENDA_STATUS_BADGE } from "@/lib/agenda/options";

// Selo unico de status do agendamento - SEMPRE neutro (nunca Musgo/Âmbar/
// Terracota, ver AGENDA_STATUS_BADGE em src/lib/agenda/options.ts e o teste
// que garante isso), diferenciado por icone + texto (e peso da borda/texto
// quando necessario), nunca so por cor.
export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const badge = AGENDA_STATUS_BADGE[status];
  const Icon = badge.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
      <Icon size={13} strokeWidth={2} aria-hidden="true" />
      {badge.label}
    </span>
  );
}

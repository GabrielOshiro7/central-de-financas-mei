import type { AppointmentStatus } from "@prisma/client";
import { CalendarClock, CalendarCheck, CircleCheck, CircleX, CalendarX, type LucideIcon } from "lucide-react";

export const AGENDA_STATUS_LABELS: Record<AppointmentStatus, string> = {
  AGENDADO: "Agendado",
  CONFIRMADO: "Confirmado",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
  FALTOU: "Faltou",
};

export type AgendaStatusBadge = {
  label: string;
  icon: LucideIcon;
  // Classes SEMPRE neutras (cinza) - Musgo/Âmbar/Terracota sao reservadas a
  // KPI, selo de status de pagamento, selo de prioridade de insight e linha
  // de grafico (ver regra de design da Etapa 8); nunca a selo de status de
  // agendamento. Diferenciacao vem de icone + texto + peso da borda/texto,
  // nunca de cor de status - CANCELADO usa texto mais apagado
  // (text-gray-400) so por ser um estado "encerrado sem acao", nao por
  // semantica de cor de status.
  className: string;
};

export const AGENDA_STATUS_BADGE: Record<AppointmentStatus, AgendaStatusBadge> = {
  AGENDADO: {
    label: AGENDA_STATUS_LABELS.AGENDADO,
    icon: CalendarClock,
    className: "border border-gray-300 text-gray-700 dark:border-neutral-700 dark:text-neutral-300",
  },
  CONFIRMADO: {
    label: AGENDA_STATUS_LABELS.CONFIRMADO,
    icon: CalendarCheck,
    className: "border border-gray-400 font-semibold text-gray-900 dark:border-neutral-500 dark:text-neutral-100",
  },
  CONCLUIDO: {
    label: AGENDA_STATUS_LABELS.CONCLUIDO,
    icon: CircleCheck,
    className: "border border-gray-900 bg-gray-100 text-gray-900 dark:border-neutral-100 dark:bg-neutral-800 dark:text-neutral-100",
  },
  CANCELADO: {
    label: AGENDA_STATUS_LABELS.CANCELADO,
    icon: CircleX,
    className: "border border-gray-200 text-gray-400 dark:border-neutral-800 dark:text-neutral-600",
  },
  FALTOU: {
    label: AGENDA_STATUS_LABELS.FALTOU,
    icon: CalendarX,
    className: "border border-gray-300 text-gray-500 dark:border-neutral-700 dark:text-neutral-400",
  },
};

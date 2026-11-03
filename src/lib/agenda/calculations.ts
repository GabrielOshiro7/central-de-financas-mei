import type { AppointmentStatus } from "@prisma/client";
import { agendaDateKey } from "@/lib/agenda/time";
import { compareKeys, type DateKey, type TimeZone } from "@/lib/time/zoned";

// Tabela EXPLICITA de pares permitidos (nunca uma funcao "generica" com
// regras soltas) - cada aresta e uma decisao deliberada da Etapa 8, testada
// exaustivamente nos 25 pares (ver calculations.test.ts). CONCLUIDO nunca
// tem nenhuma aresta de saida - mesmo se a Sale vinculada for cancelada
// depois (a UI so deriva "venda cancelada" a partir da Sale, nunca reabre o
// agendamento por causa disso; ver comentario em Appointment no
// schema.prisma). CANCELADO/FALTOU podem reabrir para AGENDADO (decisao
// aprovada da Etapa 8), nunca para CONFIRMADO/CONCLUIDO diretamente.
const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  AGENDADO: ["CONFIRMADO", "CONCLUIDO", "CANCELADO", "FALTOU"],
  CONFIRMADO: ["CONCLUIDO", "CANCELADO", "FALTOU"],
  CONCLUIDO: [],
  CANCELADO: ["AGENDADO"],
  FALTOU: ["AGENDADO"],
};

// Fluxo DAY (Agenda A2, plano 4.3; decisao: sem CONFIRMADO). AGENDADO ->
// CONCLUIDO nao passa por aqui: so por completeDayAppointment (manual agora,
// automatica no Prompt 4). CONCLUIDO -> CANCELADO/FALTOU e o Desfazer, de
// outra etapa - por enquanto sem aresta.
const DAY_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  AGENDADO: ["CANCELADO", "FALTOU"],
  CONFIRMADO: [],
  CONCLUIDO: [],
  CANCELADO: ["AGENDADO"],
  FALTOU: ["AGENDADO"],
};

export type TransitionResult = { ok: true } | { ok: false; error: string };

// Validacao de mudanca de status do fluxo DAY, por DIA de calendario no fuso
// da empresa (`today` = todayKey do relogio da empresa): falta so a partir
// do dia do atendimento; reabrir so se o dia ainda nao passou (data passada
// pede nova data ou "Concluir agora" - UI de outra etapa).
export function canTransitionDay(
  from: AppointmentStatus,
  to: AppointmentStatus,
  ctx: { scheduledOn: DateKey; today: DateKey }
): TransitionResult {
  if (!DAY_TRANSITIONS[from].includes(to)) {
    return { ok: false, error: `Não é possível mudar o status de ${from} para ${to}.` };
  }
  if (to === "FALTOU" && compareKeys(ctx.scheduledOn, ctx.today) > 0) {
    return { ok: false, error: "Só é possível marcar falta a partir do dia do atendimento." };
  }
  if (to === "AGENDADO" && compareKeys(ctx.scheduledOn, ctx.today) < 0) {
    return { ok: false, error: "A data deste atendimento já passou: escolha uma nova data para reabri-lo." };
  }
  return { ok: true };
}

// Decisao 7 (Agenda A1/A2): cancelar, marcar falta ou reabrir tiram o
// agendamento da conclusao automatica PARA SEMPRE (o Desfazer, de outra
// etapa, tambem). Devolve o valor a gravar, ou undefined para nao mexer.
// Nunca devolve true - so a criacao DAY grava true.
export function autoCompleteEligibleAfter(from: AppointmentStatus, to: AppointmentStatus): false | undefined {
  if (to === "CANCELADO" || to === "FALTOU") return false;
  if (to === "AGENDADO" && (from === "CANCELADO" || from === "FALTOU")) return false;
  return undefined;
}

// startAt/endAt sao anulaveis desde a Agenda A1 (o fluxo DAY nao tem
// horario), mas TODO agendamento TIMED tem os dois - garantido no banco pela
// CHECK appointments_timed_fields_check. As leituras do fluxo TIMED passam
// por aqui para voltar a ter Date obrigatorio, em vez de `!` espalhado.
export function requireTimed<T extends { id: string; startAt: Date | null; endAt: Date | null }>(
  appointment: T
): T & { startAt: Date; endAt: Date } {
  if (!appointment.startAt || !appointment.endAt) {
    throw new Error(`Agendamento ${appointment.id} sem horário: não é do fluxo com horário.`);
  }
  return appointment as T & { startAt: Date; endAt: Date };
}

export type TransitionContext = {
  startAt: Date;
  // Relogio injetavel - nunca `new Date()` direto dentro desta funcao pura
  // (mesmo padrao de deriveSalePaymentStatus em src/lib/sales/calculations.ts).
  now?: Date;
};

// Unica funcao usada pelo backend para validar QUALQUER mudanca de status
// (criar nao passa por aqui - so tem estado de origem depois de existir).
export function canTransition(from: AppointmentStatus, to: AppointmentStatus, ctx: TransitionContext): TransitionResult {
  const now = ctx.now ?? new Date();
  const allowed = TRANSITIONS[from];

  if (!allowed.includes(to)) {
    return { ok: false, error: `Não é possível mudar o status de ${from} para ${to}.` };
  }

  // "Faltou" so pode ser marcado se o horario do agendamento ja passou -
  // comparacao de instante-para-instante, fuso-agnostica (nao precisa de
  // fuso aqui, so os limites de calendario do time.ts precisam).
  if (to === "FALTOU" && ctx.startAt.getTime() > now.getTime()) {
    return { ok: false, error: "Só é possível marcar falta depois do horário do agendamento." };
  }

  return { ok: true };
}

export type ServiceDurationInput = { durationMinutesSnapshot: number };

// endAt = startAt + soma das duracoes dos servicos, sempre recalculado (nunca
// editado diretamente) - "congela" a duracao no momento da criacao/
// remarcacao (ver AppointmentService.durationMinutesSnapshot no schema).
export function computeEndAt(startAt: Date, services: ServiceDurationInput[]): Date {
  const totalMinutes = services.reduce((sum, service) => sum + service.durationMinutesSnapshot, 0);
  return new Date(startAt.getTime() + totalMinutes * 60 * 1000);
}

export type OverlapCandidate = { startAt: Date; endAt: Date };
export type ExistingAppointment = { id: string; startAt: Date; endAt: Date; status: AppointmentStatus };

// CANCELADO e FALTOU nunca contam como ocupacao de horario - so AGENDADO/
// CONFIRMADO/CONCLUIDO.
const OVERLAP_IGNORED_STATUSES: readonly AppointmentStatus[] = ["CANCELADO", "FALTOU"];

// Intervalo semiaberto [start, end): encostar (o fim de um bate exatamente
// com o inicio do outro) NAO conta como sobreposicao. Funciona igual para
// agendamentos que atravessam a meia-noite porque start/end sao instantes
// completos, nunca "hora do dia" - nenhum caso especial necessario.
// `excludeId` exclui o proprio agendamento da checagem (usado em remarcar,
// nunca em criar).
export function detectOverlap(
  candidate: OverlapCandidate,
  existing: ExistingAppointment[],
  options: { excludeId?: string } = {}
): ExistingAppointment[] {
  return existing.filter((appointment) => {
    if (options.excludeId && appointment.id === options.excludeId) return false;
    if (OVERLAP_IGNORED_STATUSES.includes(appointment.status)) return false;
    return candidate.startAt.getTime() < appointment.endAt.getTime() && candidate.endAt.getTime() > appointment.startAt.getTime();
  });
}

// Dia da venda (Sale.saleOn) de uma conclusao de atendimento: o DIA DE
// CALENDARIO do atendimento (startAt) no fuso da empresa (Etapa F3c; desde a
// F6c uma DateKey, a mesma que uma venda manual "YYYY-MM-DD" do mesmo dia
// grava - ver tests/unit/agenda/saleDateConversion.test.ts). Nunca
// completedAt: a venda a vista (Bill.paidOn e o lancamento) e datada do dia
// do atendimento, nao do dia em que o dono clicou em "Concluir" (registro
// retroativo, decisao aprovada da Etapa 8, incremento 3); Bill.paidAt e o
// instante real do registro (auditoria, F6b-2).
export function resolveSaleDayFromAppointment(startAt: Date, timeZone: TimeZone): DateKey {
  return agendaDateKey(startAt, timeZone);
}

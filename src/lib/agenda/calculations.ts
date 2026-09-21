import type { AppointmentStatus } from "@prisma/client";
import { formatTokyoDateKey } from "@/lib/agenda/time";

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

export type TransitionResult = { ok: true } | { ok: false; error: string };

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
  // Asia/Tokyo aqui, so os limites de calendario do time.ts precisam).
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

// Sale.saleDate de uma conclusao de atendimento DEVE ser byte-a-byte igual
// ao que uma venda manual do mesmo dia calendario geraria: SaleForm envia
// uma string "YYYY-MM-DD" (input type="date") que a API converte com
// `new Date(string)` (meia-noite UTC dessa string - ver saleDate em
// api/vendas/route.ts). Aqui fazemos EXATAMENTE o mesmo: formata o dia
// calendario de Toquio como string e passa pelo mesmo `new Date(string)` -
// NUNCA Date.UTC(...)/aritmetica calculada direto do instante de startAt ou
// completedAt, que produziria um resultado DIFERENTE (ver teste de
// comparacao em tests/unit/agenda/saleDateConversion.test.ts). Bill.paidAt
// de uma conclusao a vista reaproveita este MESMO valor (nunca completedAt -
// decisao aprovada da Etapa 8, incremento 3): o pagamento e datado do dia do
// atendimento, nao do dia em que o dono efetivamente clicou em "Concluir"
// (registro retroativo).
export function resolveSaleDateFromAppointment(startAt: Date): Date {
  return new Date(formatTokyoDateKey(startAt));
}

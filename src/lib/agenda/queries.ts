import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { agendaMonthRange } from "@/lib/agenda/calendar";
import { requireTimed } from "@/lib/agenda/calculations";
import {
  addDays,
  addMonthsClamped,
  dateKeyToDbDate,
  dbDateToKey,
  startOfDayInstant,
  toDateKey,
  type DateKey,
  type TimeZone,
} from "@/lib/time/zoned";

const { Decimal } = Prisma;

// Inclui o Product atual de cada servico (so defaultPrice) - usado pra
// pre-preencher o preco no dialogo de "concluir atendimento" com o preco
// ATUAL do servico (nao o snapshot da criacao do agendamento, que so serve
// pra congelar nome/duracao - ver AppointmentService no schema.prisma).
const APPOINTMENT_SERVICES_WITH_PRODUCT_PRICE = {
  orderBy: { position: "asc" as const },
  include: { product: { select: { defaultPrice: true } } },
};

// Sempre escopado por businessId - nunca confia so no id do agendamento (ver
// regra de isolamento cross-empresa da Etapa 8). So o fluxo TIMED (Agenda
// A1): as telas atuais da Agenda sao do fluxo com horario; o fluxo DAY tem
// telas proprias em outra etapa.
export async function listAppointmentsForRange(businessId: string, start: Date, end: Date) {
  const appointments = await prisma.appointment.findMany({
    where: { businessId, kind: "TIMED", startAt: { gte: start, lt: end } },
    include: {
      client: true,
      services: APPOINTMENT_SERVICES_WITH_PRODUCT_PRICE,
      sale: { select: { id: true, saleNumber: true, status: true } },
    },
    orderBy: { startAt: "asc" },
  });
  return appointments.map(requireTimed);
}

// Agendamentos do mes inteiro (grade do Calendario e aba Mes) - mesmo range
// de agendaMonthRange (calendar.ts) no fuso da empresa, nunca mais que um
// mes. `month` e 1-indexado (janeiro=1).
export async function listAppointmentsForMonth(businessId: string, year: number, month: number, timeZone: TimeZone) {
  const { start, end } = agendaMonthRange(year, month, timeZone);
  return listAppointmentsForRange(businessId, start, end);
}

// --- Telas da Agenda com os dois fluxos (Agenda A3) ------------------------

const AGENDA_ENTRY_INCLUDE = {
  client: { select: { name: true } },
  services: APPOINTMENT_SERVICES_WITH_PRODUCT_PRICE,
  // bills PAID: o valor ja recebido, avisado no dialogo de Desfazer (Agenda A4).
  sale: { select: { id: true, saleNumber: true, status: true, total: true, bills: { where: { status: "PAID" }, select: { amount: true } } } },
  _count: { select: { installments: true } },
} satisfies Prisma.AppointmentInclude;

type AgendaRow = Prisma.AppointmentGetPayload<{ include: typeof AGENDA_ENTRY_INCLUDE }>;

// Agendamento de qualquer fluxo, com o DIA de calendario (fuso da empresa) e
// o valor ja resolvidos:
// - DAY: dia = scheduledOn; valor = soma de unitPrice * quantity (snapshot).
// - TIMED: dia = dia de startAt no fuso da empresa; valor = total da venda
//   quando concluido, senao a soma dos precos padrao ATUAIS dos servicos (o
//   mesmo valor que o modal de conclusao pre-preenche - o TIMED nao grava
//   valor antes de concluir).
export type AgendaEntry = AgendaRow & { dayKey: DateKey; amount: Prisma.Decimal };

// DAY "sem valor" (ex.: reuniao): total zero. So o DAY define valor antes de
// concluir (o TIMED nunca e "sem valor").
export function isNoValueAppointment(a: { kind: "TIMED" | "DAY"; services: { unitPrice: Prisma.Decimal | null; quantity: number }[] }): boolean {
  return a.kind === "DAY" && a.services.every((s) => (s.unitPrice ?? new Decimal(0)).times(s.quantity).isZero());
}

function toAgendaEntry(row: AgendaRow, timeZone: TimeZone): AgendaEntry {
  if (row.kind === "DAY") {
    const amount = row.services.reduce((sum, s) => sum.plus((s.unitPrice ?? new Decimal(0)).times(s.quantity)), new Decimal(0));
    return { ...row, dayKey: dbDateToKey(row.scheduledOn!), amount };
  }
  const amount =
    row.sale?.total ?? row.services.reduce((sum, s) => sum.plus(s.product?.defaultPrice ?? new Decimal(0)), new Decimal(0));
  return { ...row, dayKey: toDateKey(requireTimed(row).startAt, timeZone), amount };
}

// Ordem dentro de um dia: TIMED primeiro, pelo horario; depois DAY, por
// createdAt e, no empate, id.
function compareAgendaEntries(a: AgendaEntry, b: AgendaEntry): number {
  if (a.dayKey !== b.dayKey) return a.dayKey < b.dayKey ? -1 : 1;
  if (a.kind !== b.kind) return a.kind === "TIMED" ? -1 : 1;
  if (a.kind === "TIMED") return a.startAt!.getTime() - b.startAt!.getTime();
  const created = a.createdAt.getTime() - b.createdAt.getTime();
  return created !== 0 ? created : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Agendamentos dos dias [startKey, endKey) - TIMED pelo instante de inicio
// dentro desses dias no fuso da empresa, DAY pelo proprio dia.
async function listAgendaEntries(businessId: string, startKey: DateKey, endKey: DateKey, timeZone: TimeZone): Promise<AgendaEntry[]> {
  const [timed, day] = await Promise.all([
    prisma.appointment.findMany({
      where: { businessId, kind: "TIMED", startAt: { gte: startOfDayInstant(startKey, timeZone), lt: startOfDayInstant(endKey, timeZone) } },
      include: AGENDA_ENTRY_INCLUDE,
    }),
    prisma.appointment.findMany({
      where: { businessId, kind: "DAY", scheduledOn: { gte: dateKeyToDbDate(startKey), lt: dateKeyToDbDate(endKey) } },
      include: AGENDA_ENTRY_INCLUDE,
    }),
  ]);
  return [...timed, ...day].map((row) => toAgendaEntry(row, timeZone)).sort(compareAgendaEntries);
}

export function listAgendaForDay(businessId: string, dayKey: DateKey, timeZone: TimeZone) {
  return listAgendaEntries(businessId, dayKey, addDays(dayKey, 1), timeZone);
}

// `month` 1-indexado (janeiro=1).
export function listAgendaForMonth(businessId: string, year: number, month: number, timeZone: TimeZone) {
  const startKey = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  return listAgendaEntries(businessId, startKey, addMonthsClamped(startKey, 1), timeZone);
}

export type AgendaTotals = { count: number; amount: Prisma.Decimal };

// Total do dia/mes: quantidade e valor dos agendamentos que nao foram
// cancelados nem marcados como falta.
export function summarizeAgenda(entries: AgendaEntry[]): AgendaTotals {
  return entries
    .filter((e) => e.status !== "CANCELADO" && e.status !== "FALTOU")
    .reduce((acc, e) => ({ count: acc.count + 1, amount: acc.amount.plus(e.amount) }), { count: 0, amount: new Decimal(0) });
}

export async function getAppointmentById(businessId: string, id: string) {
  return prisma.appointment.findFirst({
    where: { id, businessId },
    include: {
      client: true,
      services: APPOINTMENT_SERVICES_WITH_PRODUCT_PRICE,
      sale: true,
      installments: { orderBy: { position: "asc" } },
    },
  });
}

// Ate 20 agendamentos mais recentes do cliente (mais novo primeiro) - usado
// na secao "Histórico de agendamentos" de /clientes/[id] (sem rota de API
// dedicada, decisao aprovada do incremento 3: reaproveita consulta direta no
// Server Component, mesmo padrao do historico de vendas ja existente
// naquela pagina). Os dois fluxos (Agenda A3): cada item traz o dia (fuso da
// empresa) e, so no TIMED, o horario (`startAt`); DAY mostra so a data.
// Ordem: dia desc; dentro do dia, TIMED pelo horario desc e DAY por createdAt
// desc.
const HISTORY_INCLUDE = {
  services: { orderBy: { position: "asc" as const } },
  sale: { select: { id: true, saleNumber: true, status: true } },
};

export async function getClientAppointmentHistory(businessId: string, clientId: string, timeZone: TimeZone) {
  const [timed, day] = await Promise.all([
    prisma.appointment.findMany({ where: { businessId, clientId, kind: "TIMED" }, include: HISTORY_INCLUDE, orderBy: { startAt: "desc" }, take: 20 }),
    prisma.appointment.findMany({
      where: { businessId, clientId, kind: "DAY" },
      include: HISTORY_INCLUDE,
      orderBy: [{ scheduledOn: "desc" }, { createdAt: "desc" }],
      take: 20,
    }),
  ]);
  const items = [
    ...timed.map((a) => ({ ...a, dayKey: toDateKey(requireTimed(a).startAt, timeZone), sortAt: a.startAt!.getTime(), noValue: false })),
    ...day.map((a) => ({ ...a, dayKey: dbDateToKey(a.scheduledOn!), sortAt: a.createdAt.getTime(), noValue: isNoValueAppointment(a) })),
  ];
  items.sort((a, b) => (a.dayKey !== b.dayKey ? (a.dayKey < b.dayKey ? 1 : -1) : b.sortAt - a.sortAt));
  return items.slice(0, 20);
}

// Ultima categoria REVENUE usada ao concluir um atendimento desta empresa -
// SO um valor SUGERIDO pra pre-selecionar no modal de conclusao; o backend
// sempre revalida (via assertCategoryMatches) o categoryId que efetivamente
// chegou no payload, nunca confia nessa sugestao.
//
// Retorna null quando a empresa nunca concluiu nenhum atendimento ainda
// (nenhum Appointment com saleId preenchido) - nesse caso o modal NAO tem
// nenhuma categoria pre-selecionada e exige que o usuario escolha
// manualmente, sem nenhum fallback silencioso pra uma categoria arbitraria
// (ex.: "a primeira categoria REVENUE da lista"). Documentado aqui porque
// esse comportamento nao e obvio so lendo a assinatura da funcao.
export async function getLastUsedCompletionCategoryId(businessId: string): Promise<string | null> {
  const last = await prisma.appointment.findFirst({
    where: { businessId, saleId: { not: null } },
    orderBy: { completedAt: "desc" },
    select: { sale: { select: { categoryId: true } } },
  });
  return last?.sale?.categoryId ?? null;
}

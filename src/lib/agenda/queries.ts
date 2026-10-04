import { prisma } from "@/lib/db";
import { tokyoMonthRange } from "@/lib/agenda/calendar";

// Inclui o Product atual de cada servico (so defaultPrice) - usado pra
// pre-preencher o preco no dialogo de "concluir atendimento" com o preco
// ATUAL do servico (nao o snapshot da criacao do agendamento, que so serve
// pra congelar nome/duracao - ver AppointmentService no schema.prisma).
const APPOINTMENT_SERVICES_WITH_PRODUCT_PRICE = {
  orderBy: { position: "asc" as const },
  include: { product: { select: { defaultPrice: true } } },
};

// Sempre escopado por businessId - nunca confia so no id do agendamento (ver
// regra de isolamento cross-empresa da Etapa 8).
export async function listAppointmentsForRange(businessId: string, start: Date, end: Date) {
  return prisma.appointment.findMany({
    where: { businessId, startAt: { gte: start, lt: end } },
    include: {
      client: true,
      services: APPOINTMENT_SERVICES_WITH_PRODUCT_PRICE,
      sale: { select: { id: true, saleNumber: true, status: true } },
    },
    orderBy: { startAt: "asc" },
  });
}

// Agendamentos do mes inteiro (grade do Calendario e aba Mes) - mesmo range
// explicito em Toquio de tokyoMonthRange (calendar.ts), nunca mais que um
// mes. `month` e 1-indexado (janeiro=1).
export async function listAppointmentsForMonth(businessId: string, year: number, month: number) {
  const { start, end } = tokyoMonthRange(year, month);
  return listAppointmentsForRange(businessId, start, end);
}

export async function getAppointmentById(businessId: string, id: string) {
  return prisma.appointment.findFirst({
    where: { id, businessId },
    include: { client: true, services: APPOINTMENT_SERVICES_WITH_PRODUCT_PRICE, sale: true },
  });
}

// Ate 20 agendamentos mais recentes do cliente (mais novo primeiro) - usado
// na secao "Histórico de agendamentos" de /clientes/[id] (sem rota de API
// dedicada, decisao aprovada do incremento 3: reaproveita consulta direta no
// Server Component, mesmo padrao do historico de vendas ja existente
// naquela pagina).
export async function getClientAppointmentHistory(businessId: string, clientId: string) {
  return prisma.appointment.findMany({
    where: { businessId, clientId },
    include: {
      services: { orderBy: { position: "asc" } },
      sale: { select: { id: true, saleNumber: true, status: true } },
    },
    orderBy: { startAt: "desc" },
    take: 20,
  });
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

import { prisma } from "@/lib/db";
import { computeEndAt } from "@/lib/agenda/calculations";

// Grava um agendamento do fluxo COM HORARIO (TIMED, legado) para os testes
// que precisam de um TIMED existente (editar, concluir, transicoes, desfazer,
// dia da venda). Desde a Agenda A6 o app nao cria mais TIMED (a funcao de
// criacao saiu de src/lib/agenda/mutations.ts): este helper grava o mesmo
// que ela gravava - snapshot do nome/duracao de cada servico e endAt =
// startAt + soma das duracoes (computeEndAt) - sem validacao nem checagem de
// sobreposicao. Mesma forma de retorno de antes, para os testes mudarem so o
// import.
export async function createTimedAppointment(
  businessId: string,
  input: { clientId: string; startAt: Date; services: { productId: string }[]; notes?: string | null; allowOverlap?: boolean }
): Promise<{ ok: true; value: { id: string } } | { ok: false; error: string }> {
  const ids = input.services.map((s) => s.productId);
  const products = await prisma.product.findMany({ where: { id: { in: ids }, businessId } });
  const byId = new Map(products.map((p) => [p.id, p]));
  const services = ids.map((id, position) => {
    const product = byId.get(id);
    if (!product?.durationMinutes) throw new Error(`createTimedAppointment: serviço ${id} sem duração ou de outra empresa.`);
    return { productId: id, nameSnapshot: product.name, durationMinutesSnapshot: product.durationMinutes, position };
  });

  const created = await prisma.appointment.create({
    data: {
      businessId,
      clientId: input.clientId,
      startAt: input.startAt,
      endAt: computeEndAt(input.startAt, services),
      notes: input.notes || null,
      services: { create: services },
    },
    select: { id: true },
  });
  return { ok: true, value: created };
}

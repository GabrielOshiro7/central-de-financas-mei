import { prisma } from "@/lib/db";
import type { ClientType, Prisma, PrismaClient } from "@prisma/client";

export type MutationResult<T> = { ok: true; value: T } | { ok: false; error: string };

// Aceita o client global (prisma) OU um tx de transacao interativa - usado
// por completeAppointment (Etapa 8) pra rodar essa checagem DENTRO da mesma
// transacao que cria a Sale, sem abrir uma segunda conexao/consulta fora
// dela. Default preserva o comportamento de todo chamador existente.
type Db = PrismaClient | Prisma.TransactionClient;

export type ClientInput = {
  name: string;
  tradeName?: string | null;
  clientType: ClientType;
  document?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  notes?: string | null;
};

export async function createClient(businessId: string, input: ClientInput): Promise<MutationResult<{ id: string }>> {
  const client = await prisma.client.create({
    data: {
      businessId,
      name: input.name,
      tradeName: input.tradeName || null,
      clientType: input.clientType,
      document: input.document || null,
      phone: input.phone || null,
      whatsapp: input.whatsapp || null,
      email: input.email || null,
      addressLine: input.addressLine || null,
      city: input.city || null,
      state: input.state || null,
      country: input.country || null,
      notes: input.notes || null,
    },
    select: { id: true },
  });

  return { ok: true, value: client };
}

// Escopado por businessId - nunca confia em um id vindo do cliente sem
// checar a empresa (mesmo padrao de updateBill/updateTransaction).
export async function updateClient(
  businessId: string,
  id: string,
  input: ClientInput
): Promise<MutationResult<{ id: string }>> {
  const existing = await prisma.client.findFirst({ where: { id, businessId } });
  if (!existing) return { ok: false, error: "Cliente não encontrado." };

  await prisma.client.update({
    where: { id },
    data: {
      name: input.name,
      tradeName: input.tradeName || null,
      clientType: input.clientType,
      document: input.document || null,
      phone: input.phone || null,
      whatsapp: input.whatsapp || null,
      email: input.email || null,
      addressLine: input.addressLine || null,
      city: input.city || null,
      state: input.state || null,
      country: input.country || null,
      notes: input.notes || null,
    },
  });

  return { ok: true, value: { id } };
}

// Inativar/reativar (nunca excluir - preserva o historico de vendas do
// cliente, mesmo padrao de setRecurringBillActive). Um cliente inativo
// permanece valido para vendas ja existentes; so deixa de aparecer na lista
// de selecao de NOVAS vendas (ver listVisibleClients em queries.ts) - o
// prompt da etapa pede isso como uma restricao de visibilidade na UI, não
// como um bloqueio de escrita no backend.
export async function setClientActive(
  businessId: string,
  id: string,
  active: boolean
): Promise<MutationResult<{ id: string }>> {
  const existing = await prisma.client.findFirst({ where: { id, businessId } });
  if (!existing) return { ok: false, error: "Cliente não encontrado." };

  await prisma.client.update({ where: { id }, data: { active } });
  return { ok: true, value: { id } };
}

// Reaproveitado por src/lib/sales/mutations.ts para validar que o clientId
// enviado numa venda pertence de fato a empresa da sessao - nunca confia so
// no formulario (mesmo principio de assertCategoryMatches/
// assertCategoryMatchesDirection).
export async function assertClientBelongsToBusiness(businessId: string, clientId: string, db: Db = prisma): Promise<string | null> {
  const client = await db.client.findFirst({ where: { id: clientId, businessId } });
  if (!client) return "Cliente não encontrado.";
  return null;
}

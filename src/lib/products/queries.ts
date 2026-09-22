import { prisma } from "@/lib/db";
import type { ProductType } from "@prisma/client";

// Usado pelo autocomplete de item de venda - so produtos ativos, mesma regra
// de visibilidade de listVisibleClients/listVisibleCategories. `type`
// opcional (Etapa 8): o seletor de servicos da Agenda passa type="SERVICO"
// pra nunca listar produtos comuns; Vendas continua chamando sem esse
// parametro (comportamento inalterado).
export async function listVisibleProducts(businessId: string, search?: string, type?: ProductType) {
  return prisma.product.findMany({
    where: {
      businessId,
      active: true,
      ...(type ? { type } : {}),
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    },
    orderBy: { name: "asc" },
    take: 50,
  });
}

import { prisma } from "@/lib/db";

// Usado pelo autocomplete de item de venda - so produtos ativos, mesma regra
// de visibilidade de listVisibleClients/listVisibleCategories.
export async function listVisibleProducts(businessId: string, search?: string) {
  return prisma.product.findMany({
    where: {
      businessId,
      active: true,
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    },
    orderBy: { name: "asc" },
    take: 50,
  });
}

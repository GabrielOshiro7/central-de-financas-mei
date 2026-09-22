import { Prisma, type ProductType } from "@prisma/client";
import { prisma } from "@/lib/db";

const { Decimal } = Prisma;

export type MutationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type ProductInput = {
  name: string;
  description?: string | null;
  defaultPrice?: number | string | null;
  type?: ProductType;
  durationMinutes?: number | null;
};

export async function createProduct(businessId: string, input: ProductInput): Promise<MutationResult<{ id: string }>> {
  const product = await prisma.product.create({
    data: {
      businessId,
      name: input.name,
      description: input.description || null,
      defaultPrice: input.defaultPrice !== null && input.defaultPrice !== undefined ? new Decimal(input.defaultPrice) : null,
      type: input.type ?? "PRODUTO",
      durationMinutes: input.durationMinutes ?? null,
    },
    select: { id: true },
  });

  return { ok: true, value: product };
}

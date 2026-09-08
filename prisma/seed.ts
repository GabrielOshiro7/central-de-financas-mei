import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_CATEGORY_NAMES } from "../src/lib/finance/categoryDefaults";
import { normalizeCategoryName } from "../src/lib/finance/categories";

// Script de seed idempotente: pode rodar quantas vezes for preciso sem
// duplicar categorias. Postgres nao trata duas linhas com business_id NULL
// como iguais em um indice unico, entao a idempotencia aqui e garantida por
// checar a existencia (por normalized_name) antes de inserir - nao so pela
// constraint UNIQUE do schema, que so protege de fato as categorias proprias
// de uma empresa (business_id preenchido).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  let created = 0;

  for (const [type, names] of Object.entries(DEFAULT_CATEGORY_NAMES)) {
    for (const name of names) {
      const normalizedName = normalizeCategoryName(name);
      const existing = await prisma.category.findFirst({
        where: { businessId: null, type: type as never, normalizedName },
      });
      if (existing) continue;

      await prisma.category.create({
        data: { businessId: null, type: type as never, name, normalizedName, isDefault: true, active: true },
      });
      created += 1;
    }
  }

  console.log(`Seed de categorias padrao concluido. ${created} categoria(s) criada(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_CATEGORY_NAMES } from "../src/lib/finance/categoryDefaults";

// Script de seed idempotente: pode rodar quantas vezes for preciso sem
// duplicar categorias. Postgres nao trata duas linhas com business_id NULL
// como iguais em um indice unico, entao a idempotencia aqui e garantida por
// checar a existencia antes de inserir (nao por um @@unique no schema).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  let created = 0;

  for (const [type, names] of Object.entries(DEFAULT_CATEGORY_NAMES)) {
    for (const name of names) {
      const existing = await prisma.category.findFirst({
        where: { businessId: null, type: type as never, name },
      });
      if (existing) continue;

      await prisma.category.create({
        data: { businessId: null, type: type as never, name, isDefault: true, active: true },
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

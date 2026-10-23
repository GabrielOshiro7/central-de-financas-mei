import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { getBusinessClock } from "@/lib/time/businessClock";
import { todayKey } from "@/lib/time/zoned";

// Etapa F2: Business.country / Business.timezone com default JP/Asia/Tokyo e
// o relogio da empresa (getBusinessClock).
describe("fuso e país da empresa (Etapa F2)", () => {
  const userIds: string[] = [];

  async function createUser(prefix: string) {
    const user = await prisma.user.create({
      data: {
        name: `Teste ${prefix}`,
        email: `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("empresa criada como no onboarding (upsert sem país/fuso) recebe JP / Asia/Tokyo", async () => {
    const user = await createUser("f2-onboarding");
    // Mesmo formato do upsert de src/app/api/onboarding/answer/route.ts (1o
    // passo): a rota em si depende de sessão (cookies), então o default é
    // provado aqui no mesmo comando de banco que ela executa.
    const business = await prisma.business.upsert({
      where: { userId: user.id },
      create: { userId: user.id, onboardingStep: 2, businessType: "LOJA" },
      update: { onboardingStep: 2, businessType: "LOJA" },
    });
    expect(business.country).toBe("JP");
    expect(business.timezone).toBe("Asia/Tokyo");

    const clock = await getBusinessClock(business.id, new Date("2026-10-22T20:00:00Z"));
    expect(clock.timeZone).toBe("Asia/Tokyo");
    expect(todayKey(clock)).toBe("2026-10-23"); // 05:00 de 23/10 em Tóquio
  });

  it("o helper devolve o fuso gravado na empresa (America/New_York)", async () => {
    const user = await createUser("f2-ny");
    const business = await prisma.business.create({
      data: { userId: user.id, name: "Empresa NY", country: "US", timezone: "America/New_York" },
    });
    const now = new Date("2026-10-23T03:30:00Z"); // 23:30 de 22/10 em New York
    const clock = await getBusinessClock(business.id, now);
    expect(clock).toEqual({ timeZone: "America/New_York", now });
    expect(todayKey(clock)).toBe("2026-10-22");
  });

  it("fuso inválido gravado direto no banco: o helper falha com erro claro (sem fallback para Tóquio)", async () => {
    const user = await createUser("f2-invalid");
    const business = await prisma.business.create({ data: { userId: user.id, name: "Empresa inválida" } });
    // O banco aceita qualquer texto (a migração não tem CHECK); a escrita
    // normal passa pelo timeZoneSchema. Aqui simulamos um dado corrompido.
    await prisma.$executeRaw`UPDATE businesses SET timezone = 'Marte/Olympus' WHERE id = ${business.id}`;

    await expect(getBusinessClock(business.id)).rejects.toThrow(/Fuso horário inválido: "Marte\/Olympus"/);
  });

  it("empresa inexistente: erro claro", async () => {
    await expect(getBusinessClock("00000000-0000-0000-0000-000000000000")).rejects.toThrow(/Empresa não encontrada/);
  });
});

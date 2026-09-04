import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

describe("isolamento de dados da empresa entre usuários (camada de dados)", () => {
  let userAId: string;
  let userBId: string;

  it("a empresa de A nunca é retornada ao consultar pelo userId de B", async () => {
    const userA = await prisma.user.create({
      data: {
        name: "Usuario A",
        email: `iso-a-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    const userB = await prisma.user.create({
      data: {
        name: "Usuario B",
        email: `iso-b-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    userAId = userA.id;
    userBId = userB.id;

    await prisma.business.create({ data: { userId: userA.id, name: "Empresa A" } });
    await prisma.business.create({ data: { userId: userB.id, name: "Empresa B" } });

    // Toda rota da aplicacao resolve a empresa via where: { userId: <sessao> },
    // nunca por um id vindo do cliente - aqui provamos que essa consulta
    // realmente isola os dados por usuario.
    const businessForA = await prisma.business.findUnique({ where: { userId: userA.id } });
    const businessForB = await prisma.business.findUnique({ where: { userId: userB.id } });

    expect(businessForA?.name).toBe("Empresa A");
    expect(businessForB?.name).toBe("Empresa B");
    expect(businessForA?.id).not.toBe(businessForB?.id);
  });

  it("o índice único em businesses.user_id impede duas empresas para o mesmo usuário", async () => {
    await expect(
      prisma.business.create({ data: { userId: userAId, name: "Segunda tentativa" } })
    ).rejects.toThrow();
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  });
});

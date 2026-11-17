import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST as postAnswer } from "@/app/api/onboarding/answer/route";
import { POST as postComplete } from "@/app/api/onboarding/complete/route";
import { PATCH as patchBusiness } from "@/app/api/business/route";

// Minimizacao de dados: tipo de negocio, modelo de receita, tempo de existencia, numero de pessoas e
// faturamento medio nao sao usados por nenhuma funcao do sistema, entao sao OPCIONAIS (podem ser
// pulados). Nome e moeda continuam obrigatorios. Pular nunca apaga uma resposta que ja existia.
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string; themePreference: null } }));
vi.mock("@/lib/auth/cookies", () => ({ getCurrentUser: async () => session.user }));

const createdUserIds: string[] = [];

async function newUser() {
  const user = await prisma.user.create({
    data: { name: "Teste Onboarding", email: `onb-opt-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  createdUserIds.push(user.id);
  session.user = { id: user.id, name: user.name, email: user.email, themePreference: null };
  return user;
}

const post = (route: typeof postAnswer, body: unknown) =>
  route(new Request("http://test/api/onboarding/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const business = (userId: string) => prisma.business.findUniqueOrThrow({ where: { userId } });

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }); // empresa sai em cascata
});

describe("pular perguntas só de perfil", () => {
  it("pular os passos 1, 2, 4 e 5 avança o passo sem gravar nada", async () => {
    const user = await newUser();
    for (const step of [1, 2]) {
      const res = await post(postAnswer, { step, skip: true });
      expect(res.status, `pular ${step}`).toBe(200);
    }
    // 3: nome (obrigatorio)
    expect((await post(postAnswer, { step: 3, data: { name: "Empresa Mínima" } })).status).toBe(200);
    for (const step of [4, 5]) expect((await post(postAnswer, { step, skip: true })).status, `pular ${step}`).toBe(200);

    const b = await business(user.id);
    expect(b.onboardingStep).toBe(6);
    expect(b.businessType).toBeNull();
    expect(b.revenueModel).toEqual([]);
    expect(b.revenueModelOther).toBeNull();
    expect(b.yearsInBusiness).toBeNull();
    expect(b.employeeCount).toBeNull();
    expect(b.name).toBe("Empresa Mínima");
  });

  it("nome (3) e moeda (6) NÃO podem ser pulados", async () => {
    await newUser();
    expect((await post(postAnswer, { step: 1, skip: true })).status).toBe(200);
    expect((await post(postAnswer, { step: 2, skip: true })).status).toBe(200);
    for (const step of [3]) {
      const res = await post(postAnswer, { step, skip: true });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Esta pergunta é obrigatória.");
    }
    await post(postAnswer, { step: 3, data: { name: "X" } });
    await post(postAnswer, { step: 4, skip: true });
    await post(postAnswer, { step: 5, skip: true });
    const res6 = await post(postAnswer, { step: 6, skip: true });
    expect(res6.status).toBe(400);
  });

  it("pular não apaga uma resposta que já existia", async () => {
    const user = await newUser();
    expect((await post(postAnswer, { step: 1, data: { businessType: "LOJA" } })).status).toBe(200);
    expect((await post(postAnswer, { step: 1, skip: true })).status).toBe(200);
    expect((await business(user.id)).businessType).toBe("LOJA");
  });

  it("não dá para pular adiante: continua exigindo os passos anteriores", async () => {
    await newUser();
    const res = await post(postAnswer, { step: 4, skip: true });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Responda os passos anteriores primeiro.");
  });
});

describe("faturamento médio opcional e conclusão só com nome + moeda", () => {
  async function upToStep6(skipProfile = true) {
    const user = await newUser();
    if (skipProfile) {
      await post(postAnswer, { step: 1, skip: true });
      await post(postAnswer, { step: 2, skip: true });
    }
    await post(postAnswer, { step: 3, data: { name: "Empresa Mínima" } });
    await post(postAnswer, { step: 4, skip: true });
    await post(postAnswer, { step: 5, skip: true });
    return user;
  }

  it("moeda sem faturamento: grava a moeda e deixa o faturamento 'não informado' (null)", async () => {
    const user = await upToStep6();
    const res = await post(postAnswer, { step: 6, data: { currency: "USD" } });
    expect(res.status).toBe(200);
    const b = await business(user.id);
    expect(b.currency).toBe("USD");
    expect(b.averageMonthlyRevenue).toBeNull();
  });

  it("faturamento em branco ('' ou null) também vale como não informado", async () => {
    for (const blank of ["", null]) {
      const user = await upToStep6();
      expect((await post(postAnswer, { step: 6, data: { currency: "BRL", averageMonthlyRevenue: blank } })).status).toBe(200);
      expect((await business(user.id)).averageMonthlyRevenue).toBeNull();
    }
  });

  it("faturamento informado continua validado (positivo; iene sem casas decimais)", async () => {
    await upToStep6();
    expect((await post(postAnswer, { step: 6, data: { currency: "BRL", averageMonthlyRevenue: 0 } })).status).toBe(400);
    expect((await post(postAnswer, { step: 6, data: { currency: "JPY", averageMonthlyRevenue: 10.5 } })).status).toBe(400);
    const ok = await post(postAnswer, { step: 6, data: { currency: "JPY", averageMonthlyRevenue: 1000 } });
    expect(ok.status).toBe(200);
  });

  it("a moeda continua obrigatória no passo 6", async () => {
    await upToStep6();
    expect((await post(postAnswer, { step: 6, data: { averageMonthlyRevenue: 100 } })).status).toBe(400);
  });

  it("concluir o onboarding só com nome + moeda (tudo o mais pulado) funciona", async () => {
    const user = await upToStep6();
    await post(postAnswer, { step: 6, data: { currency: "BRL" } });
    const res = await postComplete();
    expect(res.status).toBe(200);
    const b = await business(user.id);
    expect(b.onboardingCompleted).toBe(true);
    expect([b.businessType, b.yearsInBusiness, b.employeeCount, b.averageMonthlyRevenue]).toEqual([null, null, null, null]);
  });

  it("sem nome, não conclui", async () => {
    await newUser();
    await post(postAnswer, { step: 1, skip: true });
    const res = await postComplete();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Informe o nome da empresa e a moeda antes de continuar.");
  });
});

describe("edição em Configurações: os mesmos campos são opcionais", () => {
  const patch = (body: unknown) =>
    patchBusiness(new Request("http://test/api/business", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

  async function onboarded() {
    const user = await newUser();
    await prisma.business.create({
      data: { userId: user.id, name: "Empresa Completa", businessType: "LOJA", yearsInBusiness: "DE_1_A_3_ANOS", employeeCount: 4, averageMonthlyRevenue: 5000, onboardingCompleted: true },
    });
    return user;
  }

  it("em branco, os três campos viram 'não informado'; nome e moeda seguem obrigatórios", async () => {
    const user = await onboarded();
    const res = await patch({ name: "Empresa Completa", currency: "BRL" });
    expect(res.status).toBe(200);
    const b = await business(user.id);
    expect([b.yearsInBusiness, b.employeeCount, b.averageMonthlyRevenue]).toEqual([null, null, null]);
    expect(b.businessType).toBe("LOJA"); // o que a edicao nao toca fica como estava
    expect((await patch({ name: "", currency: "BRL" })).status).toBe(400);
    expect((await patch({ name: "X" })).status).toBe(400);
  });

  it("quando informados, continuam validados", async () => {
    const user = await onboarded();
    expect((await patch({ name: "X", currency: "BRL", employeeCount: 0 })).status).toBe(400);
    expect((await patch({ name: "X", currency: "BRL", averageMonthlyRevenue: -5 })).status).toBe(400);
    const res = await patch({ name: "Nova", currency: "BRL", yearsInBusiness: "DE_3_A_5_ANOS", employeeCount: 7, averageMonthlyRevenue: 1234.5 });
    expect(res.status).toBe(200);
    const b = await business(user.id);
    expect([b.name, b.yearsInBusiness, b.employeeCount, Number(b.averageMonthlyRevenue)]).toEqual(["Nova", "DE_3_A_5_ANOS", 7, 1234.5]);
  });
});

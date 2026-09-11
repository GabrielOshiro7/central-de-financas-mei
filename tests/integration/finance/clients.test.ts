import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createClient, updateClient, setClientActive, assertClientBelongsToBusiness } from "@/lib/clients/mutations";
import { listClients, listVisibleClients, getClientCommercialSummary, getClientFinancialSummary } from "@/lib/clients/queries";

describe("clientes (Etapa 6)", () => {
  let userId: string;
  let businessId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: "Teste Clientes",
        email: `clientes-${Date.now()}@example.com`,
        passwordHash: await hashPassword("SenhaValida123"),
      },
    });
    userId = user.id;

    const business = await prisma.business.create({
      data: { userId, name: "Empresa Clientes", currency: "BRL" },
    });
    businessId = business.id;
  });

  beforeEach(async () => {
    await prisma.client.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it("cria um cliente com apenas o nome preenchido (demais campos opcionais)", async () => {
    const result = await createClient(businessId, { name: "João", clientType: "PESSOA_FISICA" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const client = await prisma.client.findUnique({ where: { id: result.value.id } });
    expect(client?.name).toBe("João");
    expect(client?.active).toBe(true);
    expect(client?.document).toBeNull();
  });

  it("aceita cliente sem CPF/CNPJ (cliente estrangeiro/japonês)", async () => {
    const result = await createClient(businessId, {
      name: "Yamada Taro",
      clientType: "PESSOA_FISICA",
      country: "Japão",
      document: null,
    });
    expect(result.ok).toBe(true);
  });

  it("edita um cliente existente escopado pela empresa", async () => {
    const created = await createClient(businessId, { name: "Maria", clientType: "PESSOA_FISICA" });
    if (!created.ok) return;

    const result = await updateClient(businessId, created.value.id, {
      name: "Maria Souza",
      clientType: "PESSOA_FISICA",
      phone: "+55 11 90000-0000",
    });
    expect(result.ok).toBe(true);

    const client = await prisma.client.findUnique({ where: { id: created.value.id } });
    expect(client?.name).toBe("Maria Souza");
    expect(client?.phone).toBe("+55 11 90000-0000");
  });

  it("inativa um cliente sem apagar seu cadastro (histórico preservado)", async () => {
    const created = await createClient(businessId, { name: "Cliente Inativo", clientType: "PESSOA_FISICA" });
    if (!created.ok) return;

    const result = await setClientActive(businessId, created.value.id, false);
    expect(result.ok).toBe(true);

    const client = await prisma.client.findUnique({ where: { id: created.value.id } });
    expect(client?.active).toBe(false);
    expect(client).not.toBeNull();
  });

  it("cliente inativo não aparece em listVisibleClients (seletor de nova venda)", async () => {
    const created = await createClient(businessId, { name: "Cliente Some Da Lista", clientType: "PESSOA_FISICA" });
    if (!created.ok) return;
    await setClientActive(businessId, created.value.id, false);

    const visible = await listVisibleClients(businessId);
    expect(visible.some((c) => c.id === created.value.id)).toBe(false);

    const all = await listClients(businessId, { status: "ALL" });
    expect(all.items.some((c) => c.id === created.value.id)).toBe(true);
  });

  it("pesquisa por nome, telefone e documento", async () => {
    await createClient(businessId, { name: "Padaria Central", clientType: "PESSOA_JURIDICA", document: "12.345.678/0001-99" });
    await createClient(businessId, { name: "Outro Cliente", clientType: "PESSOA_FISICA", phone: "080-1234-5678" });

    const byName = await listClients(businessId, { search: "Padaria" });
    expect(byName.items).toHaveLength(1);

    const byPhone = await listClients(businessId, { search: "1234-5678" });
    expect(byPhone.items.length).toBeGreaterThanOrEqual(1);
  });

  it("cliente sem vendas: resumo comercial e financeiro retornam zero sem erro (Cenário 5)", async () => {
    const created = await createClient(businessId, { name: "Cliente Sem Vendas", clientType: "PESSOA_FISICA" });
    if (!created.ok) return;

    const commercial = await getClientCommercialSummary(businessId, created.value.id);
    expect(commercial.salesCount).toBe(0);
    expect(commercial.totalPurchased.toNumber()).toBe(0);
    expect(commercial.averageTicket).toBeNull();
    expect(commercial.firstPurchaseAt).toBeNull();

    const financial = await getClientFinancialSummary(businessId, created.value.id);
    expect(financial.totalOpenAmount.toNumber()).toBe(0);
    expect(financial.totalOverdueAmount.toNumber()).toBe(0);
    expect(financial.totalReceivedAmount.toNumber()).toBe(0);
  });

  it("isolamento entre empresas: cliente de uma empresa é invisível/inacessível para outra (Cenário 4)", async () => {
    const userB = await prisma.user.create({
      data: { name: "Usuario B", email: `clientes-b-${Date.now()}@example.com`, passwordHash: await hashPassword("SenhaValida123") },
    });
    const businessB = await prisma.business.create({ data: { userId: userB.id, name: "Empresa B", currency: "BRL" } });

    const clientA = await createClient(businessId, { name: "João", clientType: "PESSOA_FISICA" });
    const clientB = await createClient(businessB.id, { name: "João", clientType: "PESSOA_FISICA" });
    expect(clientA.ok && clientB.ok).toBe(true);

    // Mesmo nome, empresas diferentes - businessId errado nunca deve achar o cliente da outra empresa.
    if (clientB.ok) {
      const crossError = await assertClientBelongsToBusiness(businessId, clientB.value.id);
      expect(crossError).toMatch(/não encontrado/i);

      const updateResult = await updateClient(businessId, clientB.value.id, { name: "Hackeado", clientType: "PESSOA_FISICA" });
      expect(updateResult.ok).toBe(false);
    }

    const listA = await listClients(businessId, { status: "ALL" });
    expect(listA.items.every((c) => c.businessId === businessId)).toBe(true);

    await prisma.client.deleteMany({ where: { businessId: businessB.id } });
    await prisma.business.delete({ where: { id: businessB.id } });
    await prisma.user.delete({ where: { id: userB.id } });
  });
});

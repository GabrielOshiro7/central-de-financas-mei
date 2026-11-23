import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { listClients } from "@/lib/clients/queries";
import { searchClientsForPicker } from "@/lib/clients/picker";

// Busca por telefone/WhatsApp IGNORANDO a formatacao (digitos contra digitos), na busca do picker e na lista de
// clientes. Nada e alterado no que esta gravado. Consulta parametrizada: termo com caracteres de SQL nao quebra nem injeta.
const createdUserIds: string[] = [];
let businessId: string;
let otherBusinessId: string;

async function newBusiness(label: string) {
  const user = await prisma.user.create({
    data: { name: `Teste Tel ${label}`, email: `tel-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  createdUserIds.push(user.id);
  return (await prisma.business.create({ data: { userId: user.id, name: `Empresa Tel ${label}`, currency: "BRL" } })).id;
}

const names = (list: { name: string }[]) => list.map((c) => c.name).sort();

beforeAll(async () => {
  businessId = await newBusiness("a");
  otherBusinessId = await newBusiness("b");
  await prisma.client.createMany({
    data: [
      { businessId, name: "Ana Zero Nove Zero", whatsapp: "09012345678" }, // sem formatacao
      { businessId, name: "Bia Hifens", phone: "090-1234-5678" }, // formatado
      { businessId, name: "Caio Brasil", whatsapp: "5511 91234-5678" },
      { businessId, name: "Duda Plus", phone: "+55 (11) 98888-7777" },
      { businessId, name: "Edu Sem Telefone" },
      { businessId, name: "Fabio 100%_ Especial" }, // nome com % e _
      { businessId: otherBusinessId, name: "Outra Empresa", whatsapp: "090-1234-5678" },
    ],
  });
});

afterAll(async () => {
  const businesses = await prisma.business.findMany({ where: { userId: { in: createdUserIds } }, select: { id: true } });
  const ids = businesses.map((b) => b.id);
  await prisma.client.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("busca do picker por telefone/WhatsApp", () => {
  it('"090-1234" acha 09012345678 (sem formatacao) e 090-1234-5678 (com hifens), e nao acha a outra empresa', async () => {
    expect(names(await searchClientsForPicker(businessId, "090-1234"))).toEqual(["Ana Zero Nove Zero", "Bia Hifens"]);
  });

  it('o inverso: termo sem formatacao acha o numero gravado com hifens', async () => {
    expect(names(await searchClientsForPicker(businessId, "09012345678"))).toEqual(["Ana Zero Nove Zero", "Bia Hifens"]);
  });

  it('"+55 11 9" acha "5511 91234-5678" e "+55 (11) 98888-7777"', async () => {
    expect(names(await searchClientsForPicker(businessId, "+55 11 9"))).toEqual(["Caio Brasil", "Duda Plus"]);
  });

  it("parenteses, pontos e espacos no termo tambem sao ignorados", async () => {
    expect(names(await searchClientsForPicker(businessId, "(11) 98888.7777"))).toEqual(["Duda Plus"]);
  });

  it("a busca por nome continua igual (termo com letras nao vira busca por telefone)", async () => {
    expect(names(await searchClientsForPicker(businessId, "caio"))).toEqual(["Caio Brasil"]);
    expect(await searchClientsForPicker(businessId, "zzz")).toEqual([]);
  });

  it("o formato gravado nao e alterado pela busca", async () => {
    await searchClientsForPicker(businessId, "090-1234");
    const bia = await prisma.client.findFirstOrThrow({ where: { businessId, name: "Bia Hifens" } });
    expect(bia.phone).toBe("090-1234-5678");
  });

  it("termos com caracteres de SQL ('; DROP, %, _) nao quebram nem injetam", async () => {
    const before = await prisma.client.count({ where: { businessId } });
    for (const term of ["'; DROP TABLE clients; --", "%", "_", "100%_", "\\", "' OR '1'='1", "1; DELETE FROM clients"]) {
      const result = await searchClientsForPicker(businessId, term);
      expect(Array.isArray(result), term).toBe(true);
    }
    // "%" e "_" sao literais (nao curingas): nao acham todo mundo
    expect(names(await searchClientsForPicker(businessId, "%"))).toEqual(["Fabio 100%_ Especial"]);
    expect(await prisma.client.count({ where: { businessId } })).toBe(before); // a tabela segue intacta
  });
});

describe("busca da lista de clientes (/clientes) por telefone/WhatsApp", () => {
  it('"090-1234" acha os dois formatos e so da empresa', async () => {
    const result = await listClients(businessId, { search: "090-1234" });
    expect(names(result.items)).toEqual(["Ana Zero Nove Zero", "Bia Hifens"]);
  });

  it("nome e e-mail continuam funcionando; termo de SQL nao injeta", async () => {
    expect(names((await listClients(businessId, { search: "duda" })).items)).toEqual(["Duda Plus"]);
    const result = await listClients(businessId, { search: "'; DROP TABLE clients; --" });
    expect(result.items).toEqual([]);
    expect(await prisma.client.count({ where: { businessId } })).toBeGreaterThan(0);
  });
});

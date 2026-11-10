import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Prisma, type BillStatus, type SaleStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { countSalesByPaymentGroup, getSalesSummary, listSales } from "@/lib/sales/queries";
import { SALE_PAYMENT_GROUPS, SALE_PAYMENT_GROUP_STATUS, type SalePaymentGroup } from "@/lib/sales/paymentGroups";
import { deriveSalePaymentStatus } from "@/lib/sales/calculations";
import { clockFor, dateKeyToDbDate, startOfDayInstant, todayKey, type DateKey } from "@/lib/time/zoned";

// Filtro de pagamento da tela de Vendas: cada grupo e um dos status de
// deriveSalePaymentStatus, calculado no banco sobre as parcelas (status/dueOn).
const { Decimal } = Prisma;
const createdUserIds: string[] = [];
let revenueCategoryId: string;
let saleSeq = 0;

const TZ = "Asia/Tokyo";
// 00:30 JST de 11/06/2026 = 15:30Z de 10/06: "hoje" e 11/06 em Toquio, mas 10/06 em UTC/Sao Paulo.
const NOW = new Date("2026-06-10T15:30:00.000Z");
const TODAY_TOKYO: DateKey = "2026-06-11";
const PERIOD = { start: startOfDayInstant("2026-06-01", TZ), end: startOfDayInstant("2026-07-01", TZ) };

async function newBusiness(label: string, timezone: string = TZ) {
  const user = await prisma.user.create({
    data: { name: `Teste Pagamento ${label}`, email: `pay-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: "x" },
  });
  createdUserIds.push(user.id);
  const business = await prisma.business.create({ data: { userId: user.id, name: `Empresa Pagamento ${label}`, currency: "BRL", timezone } });
  const client = await prisma.client.create({ data: { businessId: business.id, name: `Cliente ${label}` } });
  return { userId: user.id, businessId: business.id, clientId: client.id, label };
}

type Biz = Awaited<ReturnType<typeof newBusiness>>;
type BillSpec = { amount: number; dueOn: DateKey; status: BillStatus };

const paid = (amount: number, dueOn: DateKey): BillSpec => ({ amount, dueOn, status: "PAID" });
const pending = (amount: number, dueOn: DateKey): BillSpec => ({ amount, dueOn, status: "PENDING" });
const cancelled = (amount: number, dueOn: DateKey): BillSpec => ({ amount, dueOn, status: "CANCELLED" });

async function makeSale(
  biz: Biz,
  spec: { name: string; bills: BillSpec[]; status?: SaleStatus; saleOn?: DateKey; clientId?: string; item?: string }
) {
  saleSeq += 1;
  const total = spec.bills.reduce((sum, b) => sum + b.amount, 0) || 100;
  const sale = await prisma.sale.create({
    data: {
      businessId: biz.businessId, clientId: spec.clientId ?? biz.clientId, categoryId: revenueCategoryId, userId: biz.userId,
      saleNumber: saleSeq, saleOn: dateKeyToDbDate(spec.saleOn ?? "2026-06-05"), status: spec.status ?? "CONFIRMED",
      subtotal: new Decimal(total), total: new Decimal(total), clientRequestId: `pay-${biz.businessId}-${saleSeq}`,
      notes: spec.name,
      items: { create: [{ description: spec.item ?? spec.name, quantity: new Decimal(1), unitPrice: new Decimal(total), lineTotal: new Decimal(total) }] },
    },
  });
  for (const [index, bill] of spec.bills.entries()) {
    await prisma.bill.create({
      data: {
        businessId: biz.businessId, categoryId: revenueCategoryId, saleId: sale.id, description: `Venda #${saleSeq} (${index + 1})`,
        amount: new Decimal(bill.amount), dueOn: dateKeyToDbDate(bill.dueOn), status: bill.status,
        ...(bill.status === "PAID" ? { paidOn: dateKeyToDbDate(bill.dueOn), paidAt: NOW } : {}),
      },
    });
  }
  return sale.id;
}

// Cenario principal (empresa em Toquio, "hoje" = 11/06 as 00:30 JST).
async function mainScenario(biz: Biz) {
  const ids: Record<string, string> = {};
  const add = async (name: string, spec: Omit<Parameters<typeof makeSale>[1], "name">) => (ids[name] = await makeSale(biz, { ...spec, name }));
  // PAGAS
  await add("paga-1", { bills: [paid(100, "2026-06-05")] });
  await add("paga-2-parcelas", { bills: [paid(60, "2026-06-05"), paid(40, "2026-06-20")] });
  await add("paga-concluida", { status: "COMPLETED", bills: [paid(80, "2026-06-05")] });
  await add("paga-com-cancelada", { bills: [paid(70, "2026-06-05"), cancelled(30, "2026-06-25")] }); // cancelada nao conta
  // ATRASADAS (vencida antes de 11/06 em Toquio; 10/06 so e atrasada la, pois em UTC "hoje" ainda e 10/06)
  await add("atrasada-vence-10", { bills: [pending(120, "2026-06-10")] });
  await add("atrasada-antiga", { bills: [pending(50, "2026-05-20"), pending(50, "2026-07-20")] });
  await add("atrasada-com-cancelada", { bills: [cancelled(10, "2026-06-01"), pending(90, "2026-06-02")] });
  // EM ABERTO (nada pago e nada vencido; o que vence hoje (11/06) ainda nao venceu)
  await add("aberta-vence-hoje", { bills: [pending(200, "2026-06-11")] });
  await add("aberta-a-vencer", { bills: [pending(150, "2026-06-30"), pending(150, "2026-07-30")] });
  await add("aberta-sem-parcelas", { bills: [] });
  await add("aberta-so-cancelada", { bills: [cancelled(40, "2026-06-01")] });
  // PARCIALMENTE PAGAS: algo pago, algo pendente e NADA vencido
  await add("parcial-a-vencer", { bills: [paid(100, "2026-06-05"), pending(100, "2026-06-30")] });
  // DECISAO DO DONO: o atraso tem prioridade sobre "parcial" - 1 paga + 1 vencida e ATRASADA.
  await add("parcial-com-vencida", { bills: [paid(100, "2026-06-05"), pending(60, "2026-06-02")] });
  // FORA DOS GRUPOS (sem situacao de pagamento): so em "Todas"
  await add("cancelada", { status: "CANCELLED", bills: [cancelled(100, "2026-06-01")] });
  await add("rascunho", { status: "DRAFT", bills: [] });
  return ids;
}

const idsOf = async (biz: Biz, group?: SalePaymentGroup, extra: Partial<Parameters<typeof listSales>[1]> = {}, today: DateKey = TODAY_TOKYO) => {
  const { items } = await listSales(
    biz.businessId,
    { period: PERIOD, pageSize: 100, ...extra, ...(group ? { paymentGroup: { group, today } } : {}) },
    TZ
  );
  return items.map((s) => s.notes ?? "").sort();
};

beforeAll(async () => {
  revenueCategoryId = (await prisma.category.findFirstOrThrow({ where: { businessId: null, type: "REVENUE" } })).id;
});

afterAll(async () => {
  const businesses = await prisma.business.findMany({ where: { userId: { in: createdUserIds } }, select: { id: true } });
  const ids = businesses.map((b) => b.id);
  await prisma.bill.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.saleItem.deleteMany({ where: { sale: { businessId: { in: ids } } } });
  await prisma.sale.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.client.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("filtro de pagamento - grupos e contagens", () => {
  it("cada grupo traz exatamente as vendas do status correspondente; cancelada e rascunho ficam so em Todas", async () => {
    const biz = await newBusiness("grupos");
    await mainScenario(biz);

    expect(await idsOf(biz, "pagas")).toEqual(["paga-1", "paga-2-parcelas", "paga-com-cancelada", "paga-concluida"]);
    // "parcial-com-vencida" (1 paga + 1 vencida) esta em Atrasadas, nao em Parcialmente pagas.
    expect(await idsOf(biz, "atrasadas")).toEqual(["atrasada-antiga", "atrasada-com-cancelada", "atrasada-vence-10", "parcial-com-vencida"]);
    expect(await idsOf(biz, "a-vencer")).toEqual(["aberta-a-vencer", "aberta-sem-parcelas", "aberta-so-cancelada", "aberta-vence-hoje"]);
    expect(await idsOf(biz, "parcialmente-pagas")).toEqual(["parcial-a-vencer"]);

    const todas = await idsOf(biz);
    expect(todas).toHaveLength(15);
    expect(todas).toContain("cancelada");
    expect(todas).toContain("rascunho");
    for (const group of SALE_PAYMENT_GROUPS) {
      const inGroup = await idsOf(biz, group);
      expect(inGroup).not.toContain("cancelada");
      expect(inGroup).not.toContain("rascunho");
    }
  });

  it("as contagens batem com as listas e os grupos sao disjuntos", async () => {
    const biz = await newBusiness("contagens");
    await mainScenario(biz);
    const counts = await countSalesByPaymentGroup(biz.businessId, { period: PERIOD }, TZ, TODAY_TOKYO);
    expect(counts).toEqual({ todas: 15, atrasadas: 4, "a-vencer": 4, "parcialmente-pagas": 1, pagas: 4 });
    // 15 = 13 com situacao de pagamento + cancelada + rascunho
    expect(counts.atrasadas + counts["a-vencer"] + counts["parcialmente-pagas"] + counts.pagas).toBe(13);
  });

  it("REUSA as regras: o grupo de cada venda e o status que deriveSalePaymentStatus calcula", async () => {
    const biz = await newBusiness("equivalencia");
    await mainScenario(biz);
    const clock = clockFor({ timezone: TZ }, NOW);
    expect(todayKey(clock)).toBe(TODAY_TOKYO);

    const { items } = await listSales(biz.businessId, { period: PERIOD, pageSize: 100 }, TZ);
    const byGroup = Object.fromEntries(await Promise.all(SALE_PAYMENT_GROUPS.map(async (g) => [g, new Set(await idsOf(biz, g))])));
    for (const sale of items) {
      if (sale.status === "DRAFT" || sale.status === "CANCELLED") continue;
      const derived = deriveSalePaymentStatus(sale.bills, clock);
      const expectedGroup = SALE_PAYMENT_GROUPS.find((g) => SALE_PAYMENT_GROUP_STATUS[g] === derived)!;
      for (const group of SALE_PAYMENT_GROUPS) {
        expect(byGroup[group].has(sale.notes ?? ""), `${sale.notes}: derivado ${derived} => grupo ${expectedGroup}, testado ${group}`).toBe(group === expectedGroup);
      }
    }
  });
});

describe("filtro de pagamento - o atraso tem prioridade sobre 'parcialmente paga'", () => {
  // Decisao do dono: dinheiro pendente e vencido precisa de cobranca e nao pode
  // ficar escondido atras de "parcialmente paga". PARCIAL = algo pago, algo
  // pendente e NADA vencido.
  it("1 parcela paga + 1 vencida => ATRASADA: aparece em Atrasadas e NAO em Parcialmente pagas (e o selo diz Atrasada)", async () => {
    const biz = await newBusiness("prioridade");
    await makeSale(biz, { name: "paga-e-vencida", bills: [paid(100, "2026-06-05"), pending(100, "2026-06-08")] });
    await makeSale(biz, { name: "paga-e-a-vencer", bills: [paid(100, "2026-06-05"), pending(100, "2026-06-30")] });
    await makeSale(biz, { name: "paga-e-vence-hoje", bills: [paid(100, "2026-06-05"), pending(100, TODAY_TOKYO)] });

    expect(await idsOf(biz, "atrasadas")).toEqual(["paga-e-vencida"]);
    expect(await idsOf(biz, "parcialmente-pagas")).toEqual(["paga-e-a-vencer", "paga-e-vence-hoje"]);
    const counts = await countSalesByPaymentGroup(biz.businessId, { period: PERIOD }, TZ, TODAY_TOKYO);
    expect([counts.atrasadas, counts["parcialmente-pagas"]]).toEqual([1, 2]);

    // O selo (deriveSalePaymentStatus) concorda com o grupo.
    const { items } = await listSales(biz.businessId, { period: PERIOD, pageSize: 100 }, TZ);
    const clock = clockFor({ timezone: TZ }, NOW);
    const badge = Object.fromEntries(items.map((s) => [s.notes, deriveSalePaymentStatus(s.bills, clock)]));
    expect(badge).toEqual({ "paga-e-vencida": "ATRASADA", "paga-e-a-vencer": "PARCIAL", "paga-e-vence-hoje": "PARCIAL" });
  });

  it("a prioridade acompanha o 'hoje' da empresa: a parcela que vence em 10/06 so torna a venda ATRASADA a partir de 11/06 (Toquio, 00:30)", async () => {
    const biz = await newBusiness("prioridade-hoje");
    await makeSale(biz, { name: "paga-e-vence-10", bills: [paid(100, "2026-06-05"), pending(100, "2026-06-10")] });
    expect(await idsOf(biz, "atrasadas", {}, "2026-06-11")).toEqual(["paga-e-vence-10"]);
    expect(await idsOf(biz, "parcialmente-pagas", {}, "2026-06-11")).toEqual([]);
    // Com o "hoje" de UTC/Sao Paulo (10/06) ainda nao venceu: segue parcial.
    expect(await idsOf(biz, "atrasadas", {}, "2026-06-10")).toEqual([]);
    expect(await idsOf(biz, "parcialmente-pagas", {}, "2026-06-10")).toEqual(["paga-e-vence-10"]);
  });
});

describe("filtro de pagamento - 'hoje' no fuso da empresa", () => {
  it("00:30 JST: o que venceu em 10/06 ja esta atrasado em Toquio (hoje = 11/06), mas nao em UTC/Sao Paulo (hoje = 10/06)", async () => {
    const biz = await newBusiness("hoje");
    await makeSale(biz, { name: "vence-10-06", bills: [pending(100, "2026-06-10")] });
    await makeSale(biz, { name: "vence-11-06", bills: [pending(100, "2026-06-11")] });

    const todayInTokyo = todayKey(clockFor({ timezone: "Asia/Tokyo" }, NOW));
    const todayInSaoPaulo = todayKey(clockFor({ timezone: "America/Sao_Paulo" }, NOW));
    const todayInUtc = todayKey(clockFor({ timezone: "UTC" }, NOW));
    expect([todayInTokyo, todayInSaoPaulo, todayInUtc]).toEqual(["2026-06-11", "2026-06-10", "2026-06-10"]);

    expect(await idsOf(biz, "atrasadas", {}, todayInTokyo)).toEqual(["vence-10-06"]);
    expect(await idsOf(biz, "a-vencer", {}, todayInTokyo)).toEqual(["vence-11-06"]);
    // Com o "hoje" de Sao Paulo/UTC (10/06), nada venceu ainda.
    expect(await idsOf(biz, "atrasadas", {}, todayInSaoPaulo)).toEqual([]);
    expect(await idsOf(biz, "a-vencer", {}, todayInSaoPaulo)).toEqual(["vence-10-06", "vence-11-06"]);
    const counts = await countSalesByPaymentGroup(biz.businessId, { period: PERIOD }, TZ, todayInTokyo);
    expect([counts.atrasadas, counts["a-vencer"]]).toEqual([1, 1]);
  });

  it("virada do dia: as 23:59 de 10/06 ainda nao venceu; as 00:00 de 11/06 sim (empresa em Toquio)", async () => {
    const biz = await newBusiness("virada");
    await makeSale(biz, { name: "vence-10-06", bills: [pending(100, "2026-06-10")] });
    const before = todayKey(clockFor({ timezone: TZ }, new Date(startOfDayInstant("2026-06-11", TZ).getTime() - 1000)));
    const after = todayKey(clockFor({ timezone: TZ }, startOfDayInstant("2026-06-11", TZ)));
    expect(await idsOf(biz, "atrasadas", {}, before)).toEqual([]);
    expect(await idsOf(biz, "atrasadas", {}, after)).toEqual(["vence-10-06"]);
  });
});

describe("filtro de pagamento - combinado com os demais filtros", () => {
  it("Periodo: venda de outro mes fica fora das listas e das contagens", async () => {
    const biz = await newBusiness("periodo");
    await makeSale(biz, { name: "junho", saleOn: "2026-06-05", bills: [pending(100, "2026-06-06")] });
    await makeSale(biz, { name: "maio", saleOn: "2026-05-05", bills: [pending(100, "2026-05-06")] });
    expect(await idsOf(biz, "atrasadas")).toEqual(["junho"]);
    const may = { start: startOfDayInstant("2026-05-01", TZ), end: startOfDayInstant("2026-06-01", TZ) };
    expect(await idsOf(biz, "atrasadas", { period: may })).toEqual(["maio"]);
    expect((await countSalesByPaymentGroup(biz.businessId, { period: PERIOD }, TZ, TODAY_TOKYO)).atrasadas).toBe(1);
  });

  it("Pesquisar (cliente, item, numero): lista e contagens respeitam a busca", async () => {
    const biz = await newBusiness("busca");
    const outro = await prisma.client.create({ data: { businessId: biz.businessId, name: "Zélia Souza" } });
    await makeSale(biz, { name: "venda-a", clientId: outro.id, item: "Corte de cabelo", bills: [pending(100, "2026-06-06")] });
    await makeSale(biz, { name: "venda-b", item: "Barba", bills: [pending(100, "2026-06-06")] });
    await makeSale(biz, { name: "venda-c", item: "Corte de cabelo", bills: [paid(100, "2026-06-06")] });

    expect(await idsOf(biz, "atrasadas", { search: "zélia" })).toEqual(["venda-a"]);
    expect(await idsOf(biz, "atrasadas", { search: "corte" })).toEqual(["venda-a"]);
    expect(await idsOf(biz, "pagas", { search: "corte" })).toEqual(["venda-c"]);
    const counts = await countSalesByPaymentGroup(biz.businessId, { period: PERIOD, search: "corte" }, TZ, TODAY_TOKYO);
    expect(counts).toEqual({ todas: 2, atrasadas: 1, "a-vencer": 0, "parcialmente-pagas": 0, pagas: 1 });
  });

  it("Status da venda: restringe os grupos (Concluida so as concluidas; Rascunho nao tem grupo)", async () => {
    const biz = await newBusiness("status");
    await mainScenario(biz);
    expect(await idsOf(biz, "pagas", { status: "COMPLETED" })).toEqual(["paga-concluida"]);
    expect(await idsOf(biz, "atrasadas", { status: "COMPLETED" })).toEqual([]);
    const draft = await countSalesByPaymentGroup(biz.businessId, { period: PERIOD, status: "DRAFT" }, TZ, TODAY_TOKYO);
    expect(draft).toEqual({ todas: 1, atrasadas: 0, "a-vencer": 0, "parcialmente-pagas": 0, pagas: 0 });
    const cancelledOnly = await countSalesByPaymentGroup(biz.businessId, { period: PERIOD, status: "CANCELLED" }, TZ, TODAY_TOKYO);
    expect(cancelledOnly).toEqual({ todas: 1, atrasadas: 0, "a-vencer": 0, "parcialmente-pagas": 0, pagas: 0 });
  });

  it("a ordem continua por data da venda (mais recente primeiro) dentro do grupo", async () => {
    const biz = await newBusiness("ordem");
    await makeSale(biz, { name: "antiga", saleOn: "2026-06-02", bills: [pending(10, "2026-06-03")] });
    await makeSale(biz, { name: "nova", saleOn: "2026-06-09", bills: [pending(10, "2026-06-10")] });
    const { items } = await listSales(biz.businessId, { period: PERIOD, paymentGroup: { group: "atrasadas", today: TODAY_TOKYO } }, TZ);
    expect(items.map((s) => s.notes)).toEqual(["nova", "antiga"]);
  });
});

describe("filtro de pagamento - isolamento por empresa", () => {
  it("vendas de outra empresa nunca entram nas listas nem nas contagens", async () => {
    const mine = await newBusiness("iso-minha");
    const other = await newBusiness("iso-outra");
    await mainScenario(other);
    await makeSale(mine, { name: "minha", bills: [pending(100, "2026-06-06")] });

    expect(await idsOf(mine, "atrasadas")).toEqual(["minha"]);
    expect(await idsOf(mine, "pagas")).toEqual([]);
    const counts = await countSalesByPaymentGroup(mine.businessId, { period: PERIOD }, TZ, TODAY_TOKYO);
    expect(counts).toEqual({ todas: 1, atrasadas: 1, "a-vencer": 0, "parcialmente-pagas": 0, pagas: 0 });
  });
});

describe("card 'Em aberto' (getSalesSummary)", () => {
  it("em aberto = a vencer + vencido das vendas do periodo; atrasado = so o vencido (parcela cancelada, venda cancelada e rascunho nao contam)", async () => {
    const biz = await newBusiness("card");
    await mainScenario(biz);
    // Fora do periodo (maio): nao entra.
    await makeSale(biz, { name: "maio-aberta", saleOn: "2026-05-05", bills: [pending(999, "2026-05-06")] });

    const summary = await getSalesSummary(biz.businessId, PERIOD, clockFor({ timezone: TZ }, NOW));
    // Vencido (antes de 11/06): 120 + 50 + 90 + 60 = 320. A vencer: 50 (20/07) + 200 (11/06) + 150 + 150 + 100 = 650.
    expect(summary.totalOverdue.toString()).toBe("320");
    expect(summary.totalPending.toString()).toBe("650");
    expect(summary.totalPending.plus(summary.totalOverdue).toString()).toBe("970");
  });

  it("o 'atrasado' acompanha o 'hoje' da empresa (00:30 JST vs. o dia UTC)", async () => {
    const biz = await newBusiness("card-hoje");
    await makeSale(biz, { name: "vence-10-06", bills: [pending(100, "2026-06-10")] });
    const tokyo = await getSalesSummary(biz.businessId, PERIOD, clockFor({ timezone: TZ }, NOW));
    // O periodo precisa estar alinhado ao fuso do relogio: junho inteiro em UTC.
    const periodUtc = { start: startOfDayInstant("2026-06-01", "UTC"), end: startOfDayInstant("2026-07-01", "UTC") };
    const utc = await getSalesSummary(biz.businessId, periodUtc, clockFor({ timezone: "UTC" }, NOW));
    expect([tokyo.totalOverdue.toString(), tokyo.totalPending.toString()]).toEqual(["100", "0"]);
    expect([utc.totalOverdue.toString(), utc.totalPending.toString()]).toEqual(["0", "100"]);
  });

  it("isolamento: o card de uma empresa nao soma a outra", async () => {
    const mine = await newBusiness("card-a");
    const other = await newBusiness("card-b");
    await makeSale(other, { name: "alheia", bills: [pending(500, "2026-06-01")] });
    await makeSale(mine, { name: "minha", bills: [pending(10, "2026-06-01")] });
    const summary = await getSalesSummary(mine.businessId, PERIOD, clockFor({ timezone: TZ }, NOW));
    expect([summary.totalOverdue.toString(), summary.totalPending.toString()]).toEqual(["10", "0"]);
  });
});

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { legalReacceptBlock } from "@/lib/legal/apiGate";
import { listVisibleProducts } from "@/lib/products/queries";
import { listVisibleCategories } from "@/lib/finance/categories";
import { defaultServiceRevenueCategoryId } from "@/lib/agenda/calculations";
import { getClientPickerOption } from "@/lib/clients/picker";
import { clockFor, todayKey } from "@/lib/time/zoned";

// Dados do popup "Novo agendamento", buscados quando ele ABRE (a pagina /agenda nao carrega isto a cada visita):
// servicos ativos, categorias de receita, moeda e o "hoje" da empresa. `clientId` (opcional, do "Agendar o proximo" ou
// de um link) devolve o cliente ja escolhido, com o WhatsApp. A empresa vem SEMPRE da sessao, nunca de parametro; o
// cliente so e devolvido se for da empresa (getClientPickerOption confere).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const legalBlock = legalReacceptBlock(user);
  if (legalBlock) return legalBlock;

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const clientId = new URL(request.url).searchParams.get("clientId")?.trim() || "";
  const [services, categories, initialClient] = await Promise.all([
    listVisibleProducts(business.id, undefined, "SERVICO"),
    listVisibleCategories(business.id, "REVENUE"),
    clientId ? getClientPickerOption(business.id, clientId) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    services: services.map((s) => ({ id: s.id, name: s.name, defaultPrice: s.defaultPrice?.toString() ?? "" })),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    defaultCategoryId: defaultServiceRevenueCategoryId(categories),
    currency: business.currency,
    todayKey: todayKey(clockFor(business)),
    initialClient,
  });
}

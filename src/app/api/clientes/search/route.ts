import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { listRecentClients, searchClientsForPicker } from "@/lib/clients/picker";

// Escolha de cliente da Agenda: sem `q` (ou vazio) devolve os 3 recentes; com
// `q` busca (ate 8, ativos, sem distinguir maiusculas nem acentos). A empresa
// vem da sessao - nunca de parametro.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const business = await prisma.business.findUnique({ where: { userId: user.id } });
  if (!business) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length === 0) {
    return NextResponse.json({ mode: "recent", clients: await listRecentClients(business.id) });
  }
  return NextResponse.json({ mode: "search", clients: await searchClientsForPicker(business.id, q) });
}

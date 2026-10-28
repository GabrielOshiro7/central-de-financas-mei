import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertValidTimeZone, clockFor, type BusinessClock, type TimeZone } from "@/lib/time/zoned";

// Relogio da empresa a partir do businessId (Etapa F2). Unico ponto de
// servidor que le Business.timezone; os chamadores passam a usa-lo na F3 -
// nesta etapa ninguem o chama ainda.
//
// Fuso invalido gravado no banco (nunca deveria acontecer: a escrita passa
// pelo timeZoneSchema) e tratado como erro, nunca com fallback silencioso
// para Asia/Tokyo - um fallback esconderia o problema e faria o sistema
// calcular "hoje" no fuso errado sem ninguem perceber.
export async function getBusinessClock(businessId: string, now: Date = new Date()): Promise<BusinessClock> {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } });
  if (!business) throw new Error(`Empresa não encontrada: ${businessId}`);
  return clockFor(business, now);
}

// So o fuso da empresa (Etapa F6a-1), para mutations que recebem apenas o
// businessId - aceita um tx de transacao interativa. Mesmo criterio de
// getBusinessClock: fuso invalido no banco e erro, nunca fallback.
export async function getBusinessTimeZone(
  businessId: string,
  db: PrismaClient | Prisma.TransactionClient = prisma
): Promise<TimeZone> {
  const business = await db.business.findUnique({ where: { id: businessId }, select: { timezone: true } });
  if (!business) throw new Error(`Empresa não encontrada: ${businessId}`);
  return assertValidTimeZone(business.timezone);
}

import { prisma } from "@/lib/db";
import { clockFor, type BusinessClock } from "@/lib/time/zoned";

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

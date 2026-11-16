import { prisma } from "@/lib/db";
import { INACTIVITY_TIMEOUT_MINUTES } from "@/lib/auth/sessionPolicy";

// Limpeza OPORTUNISTA de sessoes e links de recuperacao de senha vencidos (sem agendador, no
// padrao do projeto: o trabalho pega carona em acoes que ja acontecem). Disparada ao concluir
// um login com sucesso e ao criar um link de recuperacao (ver as rotas), dentro de `after()` do
// Next.js: roda depois de a resposta ser enviada (nao a atrasa) e o Next garante a conclusao
// mesmo em plataformas serverless. Uma falha so gera log - nunca derruba o login.
//
// Apaga de TODOS os usuarios, em LOTE (no maximo CLEANUP_BATCH_SIZE de cada tabela por disparo;
// o resto sai nos proximos):
//  - sessoes expiradas ha mais de 24 h: pelo teto absoluto (expiresAt) OU por inatividade
//    (ultima atividade + INACTIVITY_TIMEOUT_MINUTES ja passou ha mais de 24 h). Sessoes revogadas
//    (logout, troca/redefinicao de senha) ja sao apagadas na hora, nao ha o que limpar.
//  - links de recuperacao vencidos OU usados ha mais de 24 h.
//
// Por que 24 h de folga (e nao apagar no instante em que vence): uma sessao expirada ainda
// existente deixa o login mostrar "sua sessao expirou" a quem volta no mesmo dia (ver
// validateSessionToken); apagada, o usuario cairia num login generico. Tambem e margem de
// seguranca: o que e apagado esta MUITO alem de qualquer janela de validade, entao uma sessao
// valida ou um link ainda valido e nao usado nunca entram na selecao.
//
// Sem indice nas colunas de expiracao: a limpeza mantem a tabela pequena, e a consulta de lote
// (medida com 200 mil sessoes sinteticas) leva 0,15 ms com lixo acumulado e ~50 ms no pior caso
// (varredura completa sem nada a apagar) - em segundo plano. Ver o relatorio da etapa.

export const CLEANUP_BATCH_SIZE = 500;
export const CLEANUP_GRACE_MS = 24 * 60 * 60 * 1000;

const MINUTE_MS = 60 * 1000;

export type AuthCleanupResult = { sessions: number; resetTokens: number };

export async function cleanupExpiredAuthData(now: Date = new Date(), batchSize: number = CLEANUP_BATCH_SIZE): Promise<AuthCleanupResult> {
  const graceCutoff = new Date(now.getTime() - CLEANUP_GRACE_MS);
  // Inatividade: a sessao expira INACTIVITY_TIMEOUT_MINUTES depois da ultima atividade; so
  // apagamos quando esse momento ja ficou 24 h para tras.
  const inactivityCutoff = new Date(graceCutoff.getTime() - INACTIVITY_TIMEOUT_MINUTES * MINUTE_MS);

  const sessionWhere = { OR: [{ expiresAt: { lt: graceCutoff } }, { lastActivityAt: { lt: inactivityCutoff } }] };
  const tokenWhere = { OR: [{ expiresAt: { lt: graceCutoff } }, { usedAt: { lt: graceCutoff } }] };

  // Prisma nao tem "deleteMany ... LIMIT": escolhe-se o lote e apaga-se por id, repetindo a
  // MESMA condicao no delete (dupla trava: nada que deixe de casar com a condicao e apagado).
  const sessionIds = await prisma.session.findMany({ where: sessionWhere, select: { id: true }, take: batchSize });
  const sessions = sessionIds.length
    ? (await prisma.session.deleteMany({ where: { AND: [{ id: { in: sessionIds.map((s) => s.id) } }, sessionWhere] } })).count
    : 0;

  const tokenIds = await prisma.passwordResetToken.findMany({ where: tokenWhere, select: { id: true }, take: batchSize });
  const resetTokens = tokenIds.length
    ? (await prisma.passwordResetToken.deleteMany({ where: { AND: [{ id: { in: tokenIds.map((t) => t.id) } }, tokenWhere] } })).count
    : 0;

  return { sessions, resetTokens };
}

// Versao para as rotas, passada a `after()`: NUNCA lanca (falha so vira log).
export async function cleanupExpiredAuthDataSafely(): Promise<AuthCleanupResult | null> {
  try {
    return await cleanupExpiredAuthData();
  } catch (error) {
    console.error("[auth-cleanup] falha ao limpar sessoes/links vencidos (ignorada):", error);
    return null;
  }
}

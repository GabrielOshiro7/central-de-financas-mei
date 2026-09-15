// Constantes nomeadas da Etapa "sessao-expiracao-reauth" - nenhum numero
// magico espalhado pelo codigo de sessao/reauth. Ver prisma/schema.prisma
// (model Session) para os campos que essas constantes governam.

// Sessao autenticada sem nenhuma requisicao validada por mais que isso e
// tratada como expirada, mesmo com expiresAt ainda no futuro (ver
// session.ts::validateSessionToken).
export const INACTIVITY_TIMEOUT_MINUTES = 60;

// lastActivityAt so e regravado no banco se a ultima gravacao tiver mais
// que isso de idade - evita um UPDATE a cada chamada de API.
export const ACTIVITY_UPDATE_THROTTLE_MINUTES = 5;

// Teto absoluto de vida da sessao, calculado uma unica vez na criacao
// (nunca estendido) - varia conforme "lembrar de mim" no login.
export const ABSOLUTE_SESSION_DAYS_DEFAULT = 7;
export const ABSOLUTE_SESSION_DAYS_REMEMBERED = 30;

// Janela de "sudo mode": depois de confirmar a senha para uma acao
// sensivel, quanto tempo a sessao fica elevada antes de pedir de novo.
export const STEP_UP_GRACE_MINUTES = 10;

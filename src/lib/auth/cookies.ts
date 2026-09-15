import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  createSession,
  invalidateSession,
  validateSessionToken,
  type SessionExpiryReason,
} from "@/lib/auth/session";

export async function createUserSession(userId: string, rememberMe: boolean) {
  const { token, expiresAt } = await createSession(userId, rememberMe);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Sem "lembrar de mim": cookie de sessao (sem expires) - some ao
    // fechar o navegador. O teto absoluto curto (ver sessionPolicy.ts)
    // continua valendo no servidor independente disso; sao duas
    // protecoes, nao uma so.
    ...(rememberMe ? { expires: expiresAt } : {}),
  });

  return expiresAt;
}

export type CurrentUserResult =
  | { user: { id: string; name: string; email: string }; reason?: undefined }
  | { user: null; reason?: SessionExpiryReason };

// Variante que tambem devolve o motivo da expiracao (inatividade vs teto
// absoluto), usada so onde a mensagem exibida ao usuario precisa
// diferenciar os dois casos (guards.ts). getCurrentUser() abaixo ignora o
// motivo para nao quebrar a assinatura usada nas ~40 rotas existentes.
export async function getCurrentUserWithReason(): Promise<CurrentUserResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return { user: null };
  }

  const { user, reason } = await validateSessionToken(token);
  if (!user) {
    return { user: null, reason };
  }

  return { user };
}

export async function getCurrentUser() {
  const { user } = await getCurrentUserWithReason();
  return user;
}

// Como getCurrentUser(), mas tambem devolve o id da sessao atual e se ela
// esta elevada (reautenticacao de acao sensivel) - usado pela troca de
// senha (invalidar as *outras* sessoes) e pelas rotas que exigem sessao
// elevada (ver requireElevatedSession em guards.ts).
export async function getCurrentUserWithSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const { user, session } = await validateSessionToken(token);
  if (!user || !session) {
    return null;
  }

  return { user, sessionId: session.id, elevatedUntil: session.elevatedUntil };
}

export async function destroyUserSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await invalidateSession(token);
  }

  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

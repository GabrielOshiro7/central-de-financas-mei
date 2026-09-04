import crypto from "crypto";

export const RESET_TOKEN_DURATION_MS = 45 * 60 * 1000; // 45 minutos

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

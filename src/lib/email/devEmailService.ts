import type { EmailService } from "@/lib/email/EmailService";
import { maskEmail } from "@/lib/logging";

// Implementacao de desenvolvimento: apenas loga o link no console em vez de
// enviar um e-mail de verdade. Trocar por um provedor real (Resend, SendGrid,
// SES, Postmark...) depois significa apenas criar outra classe que implemente
// EmailService e trocar a instancia exportada abaixo.
//
// Privacidade do log: o e-mail sai MASCARADO (g***@dominio) e o link - que carrega o token que
// da acesso a conta - so e logado fora de producao (para testar o fluxo na mao). Em producao o
// log nao contem token: com este servico de desenvolvimento ninguem recebe o link (falta o
// provedor real), mas o token tambem nao fica em arquivo de log.
export class DevEmailService implements EmailService {
  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const where = process.env.NODE_ENV === "production" ? "(link omitido em producao: configure um provedor de e-mail real)" : resetUrl;
    console.log(`[DevEmailService] Link de recuperacao de senha para ${maskEmail(to)}: ${where}`);
  }
}

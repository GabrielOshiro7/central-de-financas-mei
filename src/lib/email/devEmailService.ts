import type { EmailService } from "@/lib/email/EmailService";

// Implementacao de desenvolvimento: apenas loga o link no console em vez de
// enviar um e-mail de verdade. Trocar por um provedor real (Resend, SendGrid,
// SES, Postmark...) depois significa apenas criar outra classe que implemente
// EmailService e trocar a instancia exportada abaixo.
export class DevEmailService implements EmailService {
  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    console.log(
      `[DevEmailService] Link de recuperacao de senha para ${to}: ${resetUrl}`
    );
  }
}

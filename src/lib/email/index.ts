import type { EmailService } from "@/lib/email/EmailService";
import { DevEmailService } from "@/lib/email/devEmailService";

// Ponto unico de troca: quando houver um provedor real configurado via env
// vars, trocar esta instancia por ele (mantendo a interface EmailService).
export const emailService: EmailService = new DevEmailService();

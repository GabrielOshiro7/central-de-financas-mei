import { z } from "@/lib/zod";
import { MINIMUM_AGE } from "@/content/legal/meta";

// Mensagem de recusa da caixa de aceite (cadastro e reaceite): a idade vem de MINIMUM_AGE.
const acceptRequiredMessage = (goal: string) =>
  `Declare ter ${MINIMUM_AGE} anos ou mais e aceite os Termos de Serviço e a Política de Privacidade para ${goal}.`;

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Digite seu nome."),
    email: z.string().trim().min(1, "Digite seu e-mail.").email("Digite um e-mail valido."),
    password: z.string().min(10, "A senha precisa ter pelo menos 10 caracteres."),
    confirmPassword: z.string().min(1, "Confirme sua senha."),
    // Aceite obrigatorio dos Termos de Servico e da Politica de Privacidade, junto com a declaracao
    // de maioridade (uma unica caixa; a idade vem de MINIMUM_AGE). O servidor grava a data/hora e as
    // VERSOES vigentes (nunca versoes enviadas pelo cliente).
    acceptTerms: z.literal(true, { message: acceptRequiredMessage("criar a conta") }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não são iguais.",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

// Reaceite dos documentos legais (pagina /reaceite): a MESMA caixa do cadastro, com a declaracao de
// ter MINIMUM_AGE anos ou mais. O servidor (POST /api/legal/accept) valida com este schema.
export const legalAcceptSchema = z.object({
  acceptTerms: z.literal(true, { message: acceptRequiredMessage("continuar") }),
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Digite seu e-mail.").email("Digite um e-mail valido."),
  password: z.string().min(1, "Digite sua senha."),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, "Digite seu e-mail.").email("Digite um e-mail valido."),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(10, "A senha precisa ter pelo menos 10 caracteres."),
    confirmPassword: z.string().min(1, "Confirme sua senha."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não são iguais.",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Digite sua senha atual."),
    newPassword: z.string().min(10, "A nova senha precisa ter pelo menos 10 caracteres."),
    confirmNewPassword: z.string().min(1, "Confirme a nova senha."),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "As senhas não são iguais.",
    path: ["confirmNewPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const reauthSchema = z.object({
  password: z.string().min(1, "Digite sua senha."),
});

export type ReauthInput = z.infer<typeof reauthSchema>;

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Digite seu nome."),
  email: z.string().trim().min(1, "Digite seu e-mail.").email("Digite um e-mail valido."),
});

export type ProfileInput = z.infer<typeof profileSchema>;

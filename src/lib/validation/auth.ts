import { z } from "zod";

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Digite seu nome."),
    email: z.string().trim().min(1, "Digite seu e-mail.").email("Digite um e-mail valido."),
    password: z.string().min(10, "A senha precisa ter pelo menos 10 caracteres."),
    confirmPassword: z.string().min(1, "Confirme sua senha."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não são iguais.",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Digite seu e-mail.").email("Digite um e-mail valido."),
  password: z.string().min(1, "Digite sua senha."),
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

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Digite seu nome."),
  email: z.string().trim().min(1, "Digite seu e-mail.").email("Digite um e-mail valido."),
});

export type ProfileInput = z.infer<typeof profileSchema>;

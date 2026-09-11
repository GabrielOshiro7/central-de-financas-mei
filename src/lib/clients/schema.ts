import { z } from "zod";

const clientTypeValues = ["PESSOA_FISICA", "PESSOA_JURIDICA"] as const;

// Cadastro de cliente (Etapa 6). Deliberadamente permissivo com formato -
// nunca valida CPF/CNPJ/telefone por pais especifico (publico-alvo inclui
// clientes brasileiros, japoneses e de outros paises, ver AGENTS/prompt da
// etapa). So `name` e obrigatorio; todo o resto e opcional.
export function clientSchema() {
  return z.object({
    name: z.string().trim().min(1, "Digite o nome do cliente."),
    tradeName: z.string().trim().optional().or(z.literal("")),
    clientType: z.enum(clientTypeValues).default("PESSOA_FISICA"),
    document: z.string().trim().optional().or(z.literal("")),
    phone: z.string().trim().optional().or(z.literal("")),
    whatsapp: z.string().trim().optional().or(z.literal("")),
    email: z
      .string()
      .trim()
      .email("E-mail inválido.")
      .optional()
      .or(z.literal("")),
    addressLine: z.string().trim().optional().or(z.literal("")),
    city: z.string().trim().optional().or(z.literal("")),
    state: z.string().trim().optional().or(z.literal("")),
    country: z.string().trim().optional().or(z.literal("")),
    notes: z.string().trim().optional().or(z.literal("")),
  });
}

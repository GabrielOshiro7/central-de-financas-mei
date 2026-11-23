import type { ClientType } from "@prisma/client";

// Telefone e WhatsApp do cliente: texto livre (nao valida formato por pais), mas com limite de tamanho. Mesma regra no
// cadastro/edicao do cliente (clientSchema), no clientWhatsapp do agendamento (reaproveita o schema do whatsapp) e nos
// inputs (maxLength).
export const CLIENT_CONTACT_MAX_LENGTH = 40;
export const CLIENT_CONTACT_TOO_LONG = "Use no máximo 40 caracteres.";

export const CLIENT_TYPE_OPTIONS: { value: ClientType; label: string }[] = [
  { value: "PESSOA_FISICA", label: "Pessoa física" },
  { value: "PESSOA_JURIDICA", label: "Pessoa jurídica" },
];

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  PESSOA_FISICA: "Pessoa física",
  PESSOA_JURIDICA: "Pessoa jurídica",
};

export const CLIENT_STATUS_OPTIONS: { value: "ACTIVE" | "INACTIVE" | "ALL"; label: string }[] = [
  { value: "ACTIVE", label: "Ativos" },
  { value: "INACTIVE", label: "Inativos" },
  { value: "ALL", label: "Todos" },
];

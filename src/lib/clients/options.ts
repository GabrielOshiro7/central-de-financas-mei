import type { ClientType } from "@prisma/client";

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

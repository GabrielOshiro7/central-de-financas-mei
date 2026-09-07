import type { FinancialEntryType } from "@prisma/client";

// Nomes das categorias padrao do sistema (business_id nulo), por tipo.
// Usado pelo seed inicial (prisma/seed.ts) e reutilizado onde a lista
// "canonica" for necessaria fora do banco (ex.: testes).
export const DEFAULT_CATEGORY_NAMES: Record<FinancialEntryType, string[]> = {
  REVENUE: [
    "Venda de produtos",
    "Venda de serviços",
    "Delivery",
    "Marketplace",
    "Assinaturas",
    "Outras receitas",
  ],
  COST: [
    "Mercadoria",
    "Matéria-prima",
    "Insumos",
    "Embalagens",
    "Frete",
    "Comissões",
    "Outros custos",
  ],
  EXPENSE: [
    "Aluguel",
    "Salários",
    "Energia",
    "Água",
    "Internet",
    "Marketing",
    "Contabilidade",
    "Software",
    "Transporte",
    "Manutenção",
    "Impostos",
    "Outras despesas",
  ],
};

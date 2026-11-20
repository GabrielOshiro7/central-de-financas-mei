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
  // As categorias que eram do tipo Custo (removido; migracao 20261120120000_remove_cost_type) agora sao
  // despesas: Mercadoria ... Comissoes (ao final da lista). "Outros custos" NAO entra aqui para empresas
  // novas: "Outras despesas" ja cobre o mesmo papel. (Empresas existentes mantem a categoria "Outros custos"
  // que ja tinham - dados do banco nao foram alterados.)
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
    "Mercadoria",
    "Matéria-prima",
    "Insumos",
    "Embalagens",
    "Frete",
    "Comissões",
  ],
};

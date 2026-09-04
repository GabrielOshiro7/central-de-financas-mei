import type { BusinessType, Currency, YearsInBusiness } from "@prisma/client";

export const OUTROS_VALUE = "outros";

export const BUSINESS_TYPE_OPTIONS: { value: BusinessType; label: string }[] = [
  { value: "RESTAURANTE", label: "Restaurante" },
  { value: "LOJA", label: "Loja" },
  { value: "SERVICOS", label: "Prestação de serviços" },
  { value: "CONSTRUCAO", label: "Construção" },
  { value: "ECOMMERCE", label: "E-commerce" },
  { value: "ACADEMIA", label: "Academia" },
  { value: "OUTRO", label: "Outro" },
];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = Object.fromEntries(
  BUSINESS_TYPE_OPTIONS.map((o) => [o.value, o.label])
) as Record<BusinessType, string>;

// Tipos que tem lista de opcoes de receita (todos exceto "Outro", que usa
// texto livre em vez de selecao multipla).
export type RevenueBusinessType = Exclude<BusinessType, "OUTRO">;

export const REVENUE_MODEL_OPTIONS: Record<
  RevenueBusinessType,
  { value: string; label: string }[]
> = {
  RESTAURANTE: [
    { value: "venda_refeicoes_local", label: "Venda de refeições no local" },
    { value: "delivery", label: "Delivery" },
    { value: "retirada_local", label: "Retirada no local" },
    { value: "bebidas", label: "Bebidas" },
    { value: "sobremesas", label: "Sobremesas" },
    { value: OUTROS_VALUE, label: "Outros" },
  ],
  LOJA: [
    { value: "venda_produtos", label: "Venda de produtos" },
    { value: "venda_loja_fisica", label: "Venda pela loja física" },
    { value: "venda_online", label: "Venda online" },
    { value: "marketplace", label: "Marketplace" },
    { value: "servicos_adicionais", label: "Serviços adicionais" },
    { value: OUTROS_VALUE, label: "Outros" },
  ],
  SERVICOS: [
    { value: "cobranca_por_servico", label: "Cobrança por serviço" },
    { value: "cobranca_por_hora", label: "Cobrança por hora" },
    { value: "contratos_mensais", label: "Contratos mensais" },
    { value: "projetos", label: "Projetos" },
    { value: "comissoes", label: "Comissões" },
    { value: OUTROS_VALUE, label: "Outros" },
  ],
  CONSTRUCAO: [
    { value: "obras", label: "Obras" },
    { value: "reformas", label: "Reformas" },
    { value: "projetos", label: "Projetos" },
    { value: "contratos", label: "Contratos" },
    { value: "servicos_especificos", label: "Serviços específicos" },
    { value: OUTROS_VALUE, label: "Outros" },
  ],
  ECOMMERCE: [
    { value: "venda_produtos", label: "Venda de produtos" },
    { value: "marketplace", label: "Marketplace" },
    { value: "loja_propria", label: "Loja própria" },
    { value: "dropshipping", label: "Dropshipping" },
    { value: "assinaturas", label: "Assinaturas" },
    { value: OUTROS_VALUE, label: "Outros" },
  ],
  ACADEMIA: [
    { value: "mensalidades", label: "Mensalidades" },
    { value: "planos_anuais", label: "Planos anuais" },
    { value: "personal_trainer", label: "Personal trainer" },
    { value: "aulas_particulares", label: "Aulas particulares" },
    { value: "produtos", label: "Produtos" },
    { value: OUTROS_VALUE, label: "Outros" },
  ],
};

export const YEARS_IN_BUSINESS_OPTIONS: { value: YearsInBusiness; label: string }[] = [
  { value: "MENOS_DE_1_ANO", label: "Menos de 1 ano" },
  { value: "DE_1_A_3_ANOS", label: "1 a 3 anos" },
  { value: "DE_3_A_5_ANOS", label: "3 a 5 anos" },
  { value: "DE_5_A_10_ANOS", label: "5 a 10 anos" },
  { value: "MAIS_DE_10_ANOS", label: "Mais de 10 anos" },
];

export const CURRENCY_OPTIONS: { value: Currency; label: string; symbol: string }[] = [
  { value: "JPY", label: "Iene japonês", symbol: "¥" },
  { value: "BRL", label: "Real brasileiro", symbol: "R$" },
  { value: "USD", label: "Dólar americano", symbol: "$" },
];

export const TOTAL_ONBOARDING_STEPS = 6;

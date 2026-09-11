// Constantes nomeadas dos limiares de relevância (Etapa 7) - nenhum número
// mágico dentro de rules.ts. Ajustar aqui nunca exige tocar a lógica de
// avaliação em si.

// Percentuais (VariationKind.PERCENT) - comparados ao valor absoluto da
// variação percentual retornada por calculateVariationPercent.
export const REVENUE_GROWTH_RELEVANT_PCT = 10;
export const EXPENSE_GROWTH_RELEVANT_PCT = 10;
export const TICKET_CHANGE_RELEVANT_PCT = 10;
export const OVERDUE_INCREASE_RELEVANT_PCT = 15;

// Pontos percentuais (VariationKind.POINTS) - comparados ao valor absoluto
// de marginPointsDelta (nunca a um percentual relativo).
export const MARGIN_DROP_RELEVANT_PP = 3;

// Concentração/inatividade de clientes.
export const MIN_CLIENTS_FOR_CONCENTRATION_INSIGHT = 5;
export const CONCENTRATION_RELEVANT_SHARE_PCT = 40;
// Cliente cujo consumo no período anterior representava pelo menos essa
// fração do faturamento do período anterior e que zerou no período atual.
export const INACTIVITY_MIN_PREVIOUS_SHARE_PCT = 15;

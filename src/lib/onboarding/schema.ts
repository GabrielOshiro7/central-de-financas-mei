import { z } from "zod";
import {
  BUSINESS_TYPE_OPTIONS,
  CURRENCY_OPTIONS,
  OUTROS_VALUE,
  REVENUE_MODEL_OPTIONS,
  YEARS_IN_BUSINESS_OPTIONS,
  type RevenueBusinessType,
} from "@/lib/onboarding/options";
import { isIntegerCurrency } from "@/lib/money";
import type { BusinessType, Currency, YearsInBusiness } from "@prisma/client";

const businessTypeValues = BUSINESS_TYPE_OPTIONS.map((o) => o.value) as [BusinessType, ...BusinessType[]];
const yearsValues = YEARS_IN_BUSINESS_OPTIONS.map((o) => o.value) as [YearsInBusiness, ...YearsInBusiness[]];
const currencyValues = CURRENCY_OPTIONS.map((o) => o.value) as [Currency, ...Currency[]];

export const step1Schema = z.object({
  businessType: z.enum(businessTypeValues),
});

// O passo 2 depende do business_type ja salvo (passo 1): se for "OUTRO",
// so aceitamos texto livre; senao, selecao multipla dentre as opcoes do tipo.
export function step2Schema(businessType: BusinessType) {
  if (businessType === "OUTRO") {
    return z.object({
      revenueModelOther: z.string().trim().min(1, "Conte brevemente como sua empresa ganha dinheiro."),
    });
  }

  const options = REVENUE_MODEL_OPTIONS[businessType as RevenueBusinessType].map((o) => o.value);
  const allowed = new Set(options);

  return z
    .object({
      revenueModel: z
        .array(z.string())
        .min(1, "Selecione ao menos uma opção.")
        .refine((values) => values.every((v) => allowed.has(v)), "Opção inválida."),
      revenueModelOther: z.string().trim().optional(),
    })
    .refine(
      (data) => !data.revenueModel.includes(OUTROS_VALUE) || Boolean(data.revenueModelOther?.length),
      {
        message: "Detalhe a opção \"Outros\".",
        path: ["revenueModelOther"],
      }
    );
}

export const step3Schema = z.object({
  name: z.string().trim().min(1, "Digite o nome da sua empresa."),
});

export const step4Schema = z.object({
  yearsInBusiness: z.enum(yearsValues),
});

export const step5Schema = z.object({
  employeeCount: z.coerce.number().int().min(1, "Informe pelo menos 1 pessoa."),
});

export const step6Schema = z
  .object({
    currency: z.enum(currencyValues),
    averageMonthlyRevenue: z.coerce.number().positive("Informe um valor maior que zero."),
  })
  .refine(
    (data) => !isIntegerCurrency(data.currency) || Number.isInteger(data.averageMonthlyRevenue),
    { message: "Valores em iene não têm casas decimais.", path: ["averageMonthlyRevenue"] }
  );

export const TOTAL_STEPS = 6;

// Edicao a partir da secao "Empresa" em Configuracoes (Etapa 5.1 moveu essa
// edicao pra la - antes era a pagina de nivel principal "Minha empresa").
// Nesta etapa nao permitimos
// trocar o tipo de negocio nem o modelo de receita por ali (mudar o tipo
// invalidaria as opcoes de receita ja escolhidas) - só os dados de perfil.
export const businessEditSchema = z
  .object({
    name: z.string().trim().min(1, "Digite o nome da sua empresa."),
    yearsInBusiness: z.enum(yearsValues),
    employeeCount: z.coerce.number().int().min(1, "Informe pelo menos 1 pessoa."),
    currency: z.enum(currencyValues),
    averageMonthlyRevenue: z.coerce.number().positive("Informe um valor maior que zero."),
  })
  .refine(
    (data) => !isIntegerCurrency(data.currency) || Number.isInteger(data.averageMonthlyRevenue),
    { message: "Valores em iene não têm casas decimais.", path: ["averageMonthlyRevenue"] }
  );

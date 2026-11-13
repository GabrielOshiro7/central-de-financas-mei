import { COOKIES_VERSION, LEGAL_EFFECTIVE_DATE, SERVICE_NAME } from "@/content/legal/meta";
import { STORAGE_NOT_USED } from "@/content/legal/cookieInventory";
import type { LegalDocument } from "@/content/legal/types";

// A tabela de cookies e gerada de cookieInventory.ts (o que o codigo realmente grava).
export const COOKIES_NOTICE: LegalDocument = {
  slug: "cookies",
  title: "Cookies",
  version: COOKIES_VERSION,
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  intro: `Esta página lista os cookies e o armazenamento local que o ${SERVICE_NAME} usa no seu navegador.`,
  sections: [
    {
      id: "o-que-sao",
      title: "1. O que são cookies",
      blocks: [
        {
          type: "p",
          text: "Cookies são pequenos arquivos de texto que o site grava no navegador. O armazenamento local (localStorage) é um espaço parecido, mantido só no seu navegador. Usamos os dois apenas para o funcionamento do Serviço e para lembrar as suas preferências.",
        },
      ],
    },
    {
      id: "lista",
      title: "2. O que usamos",
      blocks: [{ type: "cookie-table" }, { type: "ul", items: STORAGE_NOT_USED }],
    },
    {
      id: "essenciais",
      title: "3. Essenciais e de preferência",
      blocks: [
        {
          type: "ul",
          items: [
            "Essenciais: necessários para o Serviço funcionar (manter a sessão, lembrar que o aviso de cookies foi dispensado). Não podem ser desativados sem prejudicar o funcionamento.",
            "De preferência: lembram escolhas suas (tema, barra lateral). Se você os apagar, o Serviço continua funcionando, e as escolhas voltam ao padrão.",
          ],
        },
        {
          type: "p",
          text: 'O aviso de cookies é apenas informativo: o botão "Entendi" só o dispensa. Como só usamos cookies essenciais e de preferência, não há o que aceitar ou recusar.',
        },
      ],
    },
    {
      id: "limpar",
      title: "4. Como apagar os cookies",
      blocks: [
        {
          type: "p",
          text: 'Nas configurações do seu navegador, procure "Privacidade" ou "Dados de navegação" e escolha apagar cookies e dados de sites (você pode limitar a apagar só os deste site). Apagar o cookie de sessão encerra o seu acesso (você precisará entrar de novo).',
        },
      ],
    },
    {
      id: "mais",
      title: "5. Mais informações",
      blocks: [
        {
          type: "p",
          text: "Veja também a Política de Privacidade (/privacidade). Alterações nesta página são indicadas pela versão e pela data de vigência no topo.",
        },
      ],
    },
  ],
};

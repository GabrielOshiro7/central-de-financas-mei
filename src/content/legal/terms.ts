import { LEGAL_EFFECTIVE_DATE, LEGAL_PATHS, SERVICE_NAME, TERMS_VERSION } from "@/content/legal/meta";
import type { LegalDocument } from "@/content/legal/types";

// RASCUNHO para revisao juridica. Descreve o servico como ele e hoje (gestao financeira,
// vendas, clientes e agenda para pequenos negocios), agora como servico PAGO (assinatura,
// ainda sem provedor de cobranca). O que o codigo nao define (planos, precos, prazos,
// foro, idade minima, contato) vira [PREENCHER: ...].
export const TERMS_OF_SERVICE: LegalDocument = {
  slug: "termos",
  title: "Termos de Serviço",
  version: TERMS_VERSION,
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  intro: `Estes Termos regulam o uso do ${SERVICE_NAME} (o "Serviço"). Ao criar uma conta ou usar o Serviço, você declara que leu e aceita estes Termos e a Política de Privacidade.`,
  sections: [
    {
      id: "servico",
      title: "1. O que é o Serviço",
      blocks: [
        {
          type: "p",
          text: `O ${SERVICE_NAME} é um sistema online de gestão para pequenos negócios: lançamentos financeiros (receitas, custos e despesas), contas a pagar e a receber, vendas, cadastro de clientes, produtos e serviços, agenda, caixa, painel de indicadores e "insights" calculados a partir dos dados que você registra.`,
        },
        { type: "p", text: "Operador do Serviço: [PREENCHER: nome/razão social, endereço e contato do operador]." },
      ],
    },
    {
      id: "cadastro",
      title: "2. Cadastro e conta",
      blocks: [
        {
          type: "ul",
          items: [
            "Para usar o Serviço você precisa criar uma conta com nome, e-mail e senha, e aceitar estes Termos e a Política de Privacidade.",
            "Idade mínima: [PREENCHER: idade mínima — sugestão 18] anos.",
            "Você é responsável por manter a senha em sigilo e por tudo o que for feito na sua conta. Avise-nos se suspeitar de uso indevido.",
            "As informações do cadastro devem ser verdadeiras e atualizadas.",
          ],
        },
      ],
    },
    {
      id: "responsabilidades",
      title: "3. Responsabilidades do usuário",
      blocks: [
        {
          type: "ul",
          items: [
            "Informar dados verdadeiros e manter os registros da sua empresa corretos: o Serviço calcula com base no que você registra.",
            "Dados de terceiros: você é responsável por ter fundamento legal (e, quando necessário, consentimento) para registrar no Serviço os dados dos seus clientes e de outras pessoas. Não registre informações de saúde ou outros dados sensíveis.",
            "Usar o Serviço de forma lícita, sem tentar acessar dados de outras empresas, burlar a segurança, sobrecarregar o sistema ou usá-lo para fraude.",
            "Guardar os seus próprios comprovantes e documentos fiscais: o Serviço é uma ferramenta de apoio e não substitui os seus registros oficiais.",
          ],
        },
      ],
    },
    {
      id: "nao-substitui",
      title: "4. O Serviço não substitui contador nem assessoria",
      blocks: [
        {
          type: "p",
          text: "Os indicadores, alertas e insights são informações de apoio, calculados automaticamente. Eles não são aconselhamento contábil, financeiro, fiscal ou jurídico e não substituem um contador ou outro profissional. Decisões e obrigações fiscais continuam sendo de sua responsabilidade.",
        },
      ],
    },
    {
      id: "disponibilidade",
      title: "5. Disponibilidade e cópias de segurança",
      blocks: [
        {
          type: "p",
          text: "Trabalhamos para manter o Serviço disponível, mas não garantimos funcionamento ininterrupto nem ausência de erros; pode haver manutenção, falhas ou indisponibilidade. Cópias de segurança: [PREENCHER: frequência, retenção e se o usuário pode pedir restauração]. Mantenha também cópias dos seus dados importantes. Hoje não há exportação completa dos dados pelo aplicativo.",
        },
      ],
    },
    {
      id: "assinatura",
      title: "6. Assinatura",
      blocks: [
        {
          type: "p",
          text: `O uso do ${SERVICE_NAME} é pago, por assinatura. Hoje o aplicativo ainda não possui cobrança nem provedor de pagamento integrado; as condições abaixo valerão a partir da contratação e dependem de serem definidas pelo operador.`,
        },
        {
          type: "ul",
          items: [
            "Planos e preços: [PREENCHER: planos disponíveis, o que cada um inclui e o preço de cada um, com impostos]",
            "Ciclo de cobrança: [PREENCHER: mensal, anual ou ambos]",
            "Período de teste gratuito: [PREENCHER: existe período de teste? quantos dias? o que acontece ao final dele?]",
            "Renovação automática: a assinatura se renova automaticamente ao fim de cada ciclo, pelo mesmo plano, e a cobrança é feita a cada renovação. Para evitar a próxima renovação, desative-a antes da data de renovação em [PREENCHER: onde e como o usuário desativa a renovação automática no aplicativo].",
            "Falha de pagamento: [PREENCHER: prazo para regularizar após uma cobrança recusada e a consequência — por exemplo, suspensão do acesso — e se há nova tentativa de cobrança]",
            "Cancelamento: você pode cancelar a assinatura a qualquer momento, e o acesso continua até o fim do período já pago. [PREENCHER: como cancelar e confirmar o efeito exato no fim do período pago]",
            "Reembolso: [PREENCHER: há reembolso? em quais casos e em que prazo] [VERIFICAR COM ADVOGADO: regras de reembolso e de arrependimento aplicáveis à venda online por assinatura, no Japão e para consumidores de outros países]",
            "Reajuste de preço: podemos alterar os preços dos planos mediante aviso prévio de [PREENCHER: prazo do aviso prévio, por exemplo número de dias]; o novo preço vale a partir da renovação seguinte ao aviso, e você pode cancelar antes dela.",
            "Dados após o cancelamento: [PREENCHER: por quantos dias você pode exportar ou solicitar os seus dados depois do cancelamento e em quanto tempo os dados são excluídos depois disso. Hoje não há exportação completa pelo aplicativo]",
          ],
        },
        {
          type: "p",
          text: `Os pagamentos são processados por um provedor de cobrança de terceiros (ver a Política de Privacidade, ${LEGAL_PATHS.privacy}). As informações exigidas pela Lei de Transações Comerciais Específicas do Japão (vendedor, preços, pagamento e cancelamento) estão na página 特定商取引法に基づく表記 (${LEGAL_PATHS.tokushoho}).`,
        },
      ],
    },
    {
      id: "suspensao",
      title: "7. Suspensão e encerramento",
      blocks: [
        {
          type: "ul",
          items: [
            "Você pode parar de usar o Serviço a qualquer momento. Para excluir a conta e os dados, use o contato indicado na Política de Privacidade (hoje não há exclusão de conta pelo aplicativo).",
            "Podemos suspender ou encerrar contas em caso de violação destes Termos, uso ilícito ou risco à segurança, [PREENCHER: com ou sem aviso prévio e prazo para recuperar os dados].",
            "Depois do encerramento, os dados são tratados conforme a Política de Privacidade.",
          ],
        },
      ],
    },
    {
      id: "responsabilidade",
      title: "8. Limitação de responsabilidade",
      blocks: [
        {
          type: "p",
          text: "[VERIFICAR COM ADVOGADO: redação da limitação de responsabilidade (exclusão de danos indiretos, lucros cessantes, perda de dados; teto de indenização) e os limites impostos pela lei do consumidor e pela lei aplicável.] Em termos gerais, o Serviço é oferecido \"como está\" e o operador não responde por decisões tomadas com base nos dados e indicadores, nem por perdas decorrentes de informações incorretas registradas pelo usuário, na máxima extensão permitida em lei.",
        },
      ],
    },
    {
      id: "propriedade",
      title: "9. Propriedade intelectual",
      blocks: [
        {
          type: "p",
          text: `O software, a marca ${SERVICE_NAME}, o design e os textos do Serviço pertencem ao operador ou a seus licenciantes. Você recebe um direito limitado, não exclusivo e intransferível de usar o Serviço enquanto tiver conta. Os dados que você registra continuam sendo seus.`,
        },
      ],
    },
    {
      id: "alteracoes",
      title: "10. Alterações dos Termos",
      blocks: [
        { type: "p", text: "Podemos atualizar estes Termos. Mudanças relevantes serão comunicadas [PREENCHER: como e com que antecedência] e a versão e a data de vigência no topo da página serão atualizadas. Continuar usando o Serviço após a vigência significa aceitar a nova versão." },
      ],
    },
    {
      id: "lei",
      title: "11. Lei aplicável e foro",
      blocks: [
        { type: "p", text: "Estes Termos são regidos por [PREENCHER: lei aplicável — sugestão: leis do Japão]. Fica eleito o foro de [PREENCHER: foro competente] para resolver controvérsias, [VERIFICAR COM ADVOGADO: validade da escolha de lei e foro para usuários consumidores em outros países]." },
      ],
    },
    {
      id: "contato",
      title: "12. Contato",
      blocks: [{ type: "p", text: "Dúvidas sobre estes Termos: [PREENCHER: e-mail ou formulário de contato]." }],
    },
  ],
};

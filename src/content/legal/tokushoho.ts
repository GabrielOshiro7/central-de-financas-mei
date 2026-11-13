import { LEGAL_EFFECTIVE_DATE, LEGAL_PATHS, SERVICE_NAME, TOKUSHOHO_VERSION } from "@/content/legal/meta";
import type { LegalDocument } from "@/content/legal/types";

// RASCUNHO para revisao juridica. Pagina exigida no Japao pela Lei de Transacoes
// Comerciais Especificas (特定商取引法) para a venda online do Servico por assinatura.
// Nenhum dado do vendedor, preco ou forma de pagamento existe ainda: tudo vira
// [PREENCHER: ...] (em japones e em portugues) e o que depende de parecer vira
// [VERIFICAR COM ADVOGADO: ...]. Os itens seguem a ordem da lei.
export const TOKUSHOHO_NOTICE: LegalDocument = {
  slug: "tokushoho",
  title: "特定商取引法に基づく表記",
  titleLang: "ja",
  subtitle: "Informações conforme a Lei de Transações Comerciais Específicas (Japão)",
  version: TOKUSHOHO_VERSION,
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  intro: `Esta página reúne, em japonês e em português, as informações que o vendedor deve exibir na venda online do ${SERVICE_NAME} (o "Serviço") por assinatura. A versão em japonês é a que a lei exige; a versão em português é uma tradução de apoio para os usuários.`,
  sections: [
    {
      id: "informacoes",
      title: "表示事項 / Informações do vendedor",
      blocks: [
        {
          type: "bilingual-table",
          rows: [
            {
              jp: "販売事業者",
              pt: "Vendedor (razão social)",
              jpValue: "[PREENCHER: 販売事業者名（法人名または屋号）]",
              ptValue: "[PREENCHER: razão social ou nome empresarial do vendedor]",
            },
            {
              jp: "運営責任者",
              pt: "Responsável pela operação",
              jpValue: "[PREENCHER: 運営責任者の氏名]",
              ptValue: "[PREENCHER: nome do responsável pela operação]",
            },
            {
              jp: "所在地",
              pt: "Endereço",
              jpValue: "[PREENCHER: 所在地（郵便番号を含む）]",
              ptValue: "[PREENCHER: endereço do vendedor, com código postal]",
            },
            {
              jp: "電話番号",
              pt: "Telefone",
              jpValue:
                "[PREENCHER: 電話番号] [VERIFICAR COM ADVOGADO: 「請求があった場合、遅滞なく開示します」との記載で電話番号の表示を省略できるか]",
              ptValue:
                "[PREENCHER: número de telefone] [VERIFICAR COM ADVOGADO: se é permitido omitir o número e informar apenas que ele é fornecido sem demora mediante solicitação]",
            },
            {
              jp: "メールアドレス",
              pt: "E-mail",
              jpValue: "[PREENCHER: 問い合わせ用メールアドレス]",
              ptValue: "[PREENCHER: e-mail de contato]",
            },
            {
              jp: "販売価格",
              pt: "Preço de venda",
              jpValue: "[PREENCHER: プランごとの販売価格（消費税等を含む総額）]",
              ptValue: "[PREENCHER: preço de cada plano, com os impostos incluídos]",
            },
            {
              jp: "商品代金以外の必要料金",
              pt: "Outras taxas além do preço",
              jpValue: "[PREENCHER: 代金以外に必要な料金（例：インターネット接続料金・通信料金は利用者の負担）]",
              ptValue: "[PREENCHER: outras taxas a cargo do usuário, se houver — por exemplo, tarifas de internet]",
            },
            {
              jp: "支払方法",
              pt: "Forma de pagamento",
              jpValue: "[PREENCHER: 利用できる支払方法（クレジットカード等）]",
              ptValue: "[PREENCHER: formas de pagamento aceitas]",
            },
            {
              jp: "支払時期",
              pt: "Quando é cobrado",
              jpValue: "[PREENCHER: 代金の支払時期（申込時、毎月／毎年の更新日など）]",
              ptValue: "[PREENCHER: quando a cobrança é feita — na contratação e em cada renovação mensal/anual]",
            },
            {
              jp: "役務の提供時期",
              pt: "Início do serviço",
              jpValue: "[PREENCHER: サービスの提供開始時期]",
              ptValue: "[PREENCHER: quando o serviço passa a estar disponível após a contratação]",
            },
            {
              jp: "返品・キャンセル",
              pt: "Cancelamento e reembolso",
              jpValue: "[PREENCHER: 解約の方法・時期、返金の有無と条件]",
              ptValue: "[PREENCHER: como e até quando cancelar, e se há reembolso e em quais condições]",
            },
            {
              jp: "動作環境",
              pt: "Ambiente de funcionamento",
              jpValue: "[PREENCHER: 対応ブラウザとバージョン]",
              ptValue: "[PREENCHER: navegadores e versões suportados]",
            },
          ],
        },
      ],
    },
    {
      id: "observacoes",
      title: "備考 / Observações",
      blocks: [
        {
          type: "p",
          text: `As condições da assinatura (ciclo de cobrança, renovação automática, falha de pagamento, reembolso e dados após o cancelamento) estão na seção "6. Assinatura" dos Termos de Serviço (${LEGAL_PATHS.terms}). O tratamento das informações pessoais, inclusive dos pagamentos, está na Política de Privacidade (${LEGAL_PATHS.privacy}).`,
        },
        {
          type: "note",
          text: "[VERIFICAR COM ADVOGADO: se os itens acima estão completos e corretos para a venda online por assinatura no Japão, e se a tela de contratação e a renovação automática atendem às regras de exibição previstas na lei.]",
        },
      ],
    },
  ],
};

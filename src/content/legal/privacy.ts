import {
  ABSOLUTE_SESSION_DAYS_DEFAULT,
  ABSOLUTE_SESSION_DAYS_REMEMBERED,
  INACTIVITY_TIMEOUT_MINUTES,
  STEP_UP_GRACE_MINUTES,
} from "@/lib/auth/sessionPolicy";
import { RESET_TOKEN_DURATION_MS } from "@/lib/auth/resetToken";
import { LEGAL_EFFECTIVE_DATE, PRIVACY_POLICY_VERSION, SERVICE_NAME } from "@/content/legal/meta";
import type { LegalDocument } from "@/content/legal/types";

// RASCUNHO para revisao juridica. Estruturada para a Lei de Protecao de Informacoes
// Pessoais do Japao (APPI). Todo fato vem do codigo (ver inventario da Fase 0); o que o
// codigo nao diz vira [PREENCHER: ...]. O Servico sera pago (assinatura) e ainda nao ha
// provedor de cobranca: o que for dele (nome, dados guardados) fica como [PREENCHER].
export const PRIVACY_POLICY: LegalDocument = {
  slug: "privacidade",
  title: "Política de Privacidade",
  version: PRIVACY_POLICY_VERSION,
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  intro: `Esta Política explica quais informações pessoais o ${SERVICE_NAME} (o "Serviço") coleta, para que as usa, com quem as compartilha, como as protege e quais são os seus direitos.`,
  sections: [
    {
      id: "responsavel",
      title: "1. Quem é o responsável e como falar conosco",
      blocks: [
        { type: "p", text: `O responsável pelo tratamento das informações pessoais no Serviço ${SERVICE_NAME} é:` },
        {
          type: "ul",
          items: [
            "Nome ou razão social: [PREENCHER: nome/razão social do operador do Serviço]",
            "Endereço: [PREENCHER: endereço do operador]",
            "Representante: [PREENCHER: nome do representante, se houver]",
            "Contato para assuntos de privacidade: [PREENCHER: e-mail de contato de privacidade]",
          ],
        },
      ],
    },
    {
      id: "dados-coletados",
      title: "2. Quais informações coletamos",
      blocks: [
        { type: "p", text: "2.1 Informações do usuário (você, que cria a conta):" },
        {
          type: "ul",
          items: [
            "Cadastro e perfil: nome, e-mail e senha (a senha nunca é guardada em texto: só um hash bcrypt).",
            "Empresa informada no primeiro acesso e em Configurações: nome da empresa, tipo de negócio, modelo de receita, tempo de atuação, número de pessoas, moeda, faturamento médio mensal, saldo inicial, país e fuso horário.",
            "Preferências: tema escolhido (claro ou escuro).",
            "Aceite destes documentos: data e hora e as versões dos Termos de Serviço e desta Política aceitas no cadastro (somente para contas criadas depois dessa função existir).",
            "Dados de sessão: identificador da sessão (guardado só como hash), datas de criação, expiração e última atividade.",
            "Assinatura (o Serviço é pago): apenas o necessário para a assinatura — status, plano, datas e o identificador do cliente no provedor de cobrança. [PREENCHER: confirmar a lista exata quando a cobrança for implementada; hoje o aplicativo ainda não guarda dados de assinatura]",
          ],
        },
        { type: "p", text: "2.2 Dados financeiros e operacionais que você registra no Serviço:" },
        {
          type: "ul",
          items: [
            "Lançamentos de receitas, custos e despesas, categorias, recorrências, contas a pagar e a receber.",
            "Vendas e itens, produtos e serviços, agenda (agendamentos, títulos e observações).",
            'Indicadores e "insights" calculados a partir desses dados, e o seu estado de leitura (lido/não lido).',
          ],
        },
        { type: "p", text: "2.3 Informações dos CLIENTES que você cadastra:" },
        {
          type: "ul",
          items: [
            "Nome, nome fantasia, tipo (pessoa física ou jurídica), documento (CPF/CNPJ), telefone, WhatsApp, e-mail, endereço (rua, cidade, estado, país) e observações.",
            "O histórico de vendas e de agendamentos ligados a cada cliente.",
          ],
        },
        {
          type: "note",
          text: "Você é responsável por ter fundamento legal e, quando necessário, o consentimento dos seus clientes para registrar os dados deles no Serviço. Não registre informações de saúde ou outros dados sensíveis dos seus clientes.",
        },
        { type: "p", text: "2.4 Informações técnicas:" },
        {
          type: "ul",
          items: [
            "Cookies e armazenamento local do navegador (ver a página Cookies).",
            "O endereço IP da conexão é usado apenas em memória, para limitar tentativas excessivas de login, cadastro e recuperação de senha; ele não é gravado no banco de dados do Serviço.",
            "Registros (logs) técnicos do servidor e da hospedagem: [PREENCHER: quais logs a hospedagem mantém, o que contêm e por quanto tempo].",
          ],
        },
      ],
    },
    {
      id: "finalidades",
      title: "3. Para que usamos as informações (finalidades de uso)",
      blocks: [
        {
          type: "ul",
          items: [
            "Criar e manter a sua conta e autenticar o seu acesso.",
            "Prestar o Serviço: controle financeiro, vendas, clientes, agenda, indicadores e insights.",
            "Gerenciar a assinatura: saber qual plano está ativo, até quando e se há pagamento pendente.",
            "Lembrar as suas preferências (por exemplo, o tema).",
            "Proteger a conta e o Serviço contra acesso indevido e abuso (sessões com expiração, confirmação de senha em ações sensíveis, limite de tentativas).",
            "Cumprir obrigações legais e responder a solicitações dos titulares.",
          ],
        },
        {
          type: "p",
          text: "Não usamos as informações para publicidade. Os insights são calculados por regras no próprio servidor do Serviço; hoje nenhum dado é enviado a serviços de inteligência artificial de terceiros. Se isso mudar, esta Política será atualizada antes.",
        },
      ],
    },
    {
      id: "compartilhamento",
      title: "4. Compartilhamento e envio a terceiros (envio externo)",
      blocks: [
        {
          type: "p",
          text: "Conforme o levantamento do funcionamento atual do Serviço: o navegador do usuário não envia informações a domínios de terceiros. Não há ferramentas de análise de acesso, publicidade, rastreadores, mapas, redes de distribuição de conteúdo (CDN) ou serviços de inteligência artificial de terceiros. As fontes de texto são empacotadas no próprio Serviço, e não carregadas de servidores externos. A única mudança prevista é o provedor de cobrança, descrito abaixo, que entrará quando a assinatura for implementada.",
        },
        {
          type: "table",
          head: ["Destino", "Informação enviada", "Finalidade"],
          rows: [
            ["Domínios de terceiros a partir do navegador", "Nenhuma hoje (ver o provedor de cobrança abaixo)", "—"],
            ["Serviços de análise, publicidade ou IA de terceiros", "Nenhuma", "—"],
            ["Provedor de cobrança: [PREENCHER: nome do provedor e país]", "[PREENCHER: quais dados são enviados — por exemplo, e-mail e dados de pagamento informados diretamente ao provedor]", "Processar o pagamento da assinatura"],
          ],
        },
        { type: "p", text: "Pagamentos da assinatura:" },
        {
          type: "ul",
          items: [
            "Os pagamentos serão processados por um provedor terceiro de cobrança: [PREENCHER: nome do provedor].",
            "Os dados do cartão são enviados diretamente ao provedor e NÃO são armazenados pelo Serviço.",
            "O Serviço guarda apenas o necessário para a assinatura: status, plano, datas e o identificador do cliente no provedor. [PREENCHER: confirmar quando a cobrança for implementada]",
            "O provedor trata os dados do pagamento conforme a política de privacidade dele: [PREENCHER: endereço da política do provedor e país onde os dados são processados].",
          ],
        },
        {
          type: "p",
          text: "Provedores que processam informações em nosso nome (cobrança da assinatura, hospedagem do aplicativo, banco de dados, envio de e-mails de recuperação de senha, cópias de segurança):",
        },
        {
          type: "ul",
          items: [
            "Cobrança da assinatura: [PREENCHER: provedor de cobrança e país]",
            "Hospedagem do aplicativo: [PREENCHER: provedor e país]",
            "Banco de dados: [PREENCHER: provedor e país]",
            "Envio de e-mails: [PREENCHER: provedor e país — hoje o link de recuperação de senha apenas é registrado no log do servidor, não é enviado por e-mail]",
            "Cópias de segurança: [PREENCHER: provedor e país]",
          ],
        },
        {
          type: "p",
          text: "Não vendemos informações pessoais. Só as forneceremos a terceiros nos casos previstos em lei ou com a sua autorização, e informaremos antes qualquer novo envio a terceiros por meio da atualização desta Política.",
        },
        {
          type: "note",
          text: "[VERIFICAR COM ADVOGADO: requisitos da APPI para transferência ao exterior (país de armazenamento dos dados) e da regra de divulgação de envio externo de informações do usuário (Lei de Negócios de Telecomunicações), conforme o provedor e o país finais.]",
        },
      ],
    },
    {
      id: "seguranca",
      title: "5. Como armazenamos e protegemos as informações",
      blocks: [
        { type: "p", text: "Medidas existentes hoje (sem prometer mais do que existe):" },
        {
          type: "ul",
          items: [
            "Senhas guardadas apenas como hash bcrypt; a senha precisa ter pelo menos 10 caracteres.",
            `Sessões por identificador aleatório, guardado no banco só como hash; cookie HttpOnly (inacessível a scripts), com SameSite=Lax e Secure em produção. A sessão expira após ${INACTIVITY_TIMEOUT_MINUTES} minutos sem uso e tem um teto absoluto de ${ABSOLUTE_SESSION_DAYS_DEFAULT} dias (${ABSOLUTE_SESSION_DAYS_REMEMBERED} dias com "lembrar de mim"). É possível encerrar a sessão (sair).`,
            `Confirmação de senha antes de ações sensíveis (por exemplo, excluir um lançamento); a confirmação vale por ${STEP_UP_GRACE_MINUTES} minutos.`,
            "Trocar a senha encerra as outras sessões; redefinir a senha encerra todas.",
            `Recuperação de senha por link de uso único, guardado só como hash e válido por ${Math.round(RESET_TOKEN_DURATION_MS / 60_000)} minutos.`,
            "Limitação de tentativas de login, cadastro, recuperação e reautenticação.",
            "Isolamento entre empresas: cada consulta é restrita à empresa do usuário conectado.",
          ],
        },
        { type: "p", text: "A confirmar pelo responsável (não é possível afirmar a partir do código):" },
        {
          type: "ul",
          items: [
            "Conexão segura (HTTPS) na hospedagem de produção: [PREENCHER: confirmar HTTPS e, se houver, HSTS]",
            "Criptografia do banco de dados e dos backups em repouso: [PREENCHER: sim/não e como]",
            "Cópias de segurança: [PREENCHER: frequência, local e prazo de retenção]",
            "Quem tem acesso interno às informações e como esse acesso é controlado: [PREENCHER: política de acesso]",
          ],
        },
        { type: "p", text: "Nenhum sistema é totalmente seguro. Se ocorrer um incidente que afete as suas informações, agiremos conforme a lei aplicável: [PREENCHER: procedimento e prazo de comunicação de incidentes]." },
      ],
    },
    {
      id: "retencao",
      title: "6. Por quanto tempo guardamos as informações",
      blocks: [
        {
          type: "ul",
          items: [
            "Guardamos as informações enquanto a sua conta existir.",
            "Hoje o Serviço não oferece exclusão de conta pelo próprio aplicativo: para excluir a conta, peça pelo contato da seção 8. Excluída a conta, apagaremos os dados ligados a ela (empresa, clientes, vendas, lançamentos e demais registros); o prazo para atender o pedido é [PREENCHER: prazo] e o procedimento técnico de exclusão é [PREENCHER: confirmar como a exclusão completa é feita, pois hoje ela não é uma função do aplicativo].",
            "Clientes cadastrados podem ser desativados (não excluídos) pelo aplicativo; lançamentos podem ser excluídos (com confirmação de senha). Contas a pagar/receber e vendas são canceladas em vez de excluídas, para preservar o histórico.",
            "Cópias de segurança guardam dados antigos até o fim do prazo de retenção dos backups: [PREENCHER: prazo].",
            "Sessões expiradas e links de recuperação de senha usados ou vencidos perdem a validade; [PREENCHER: confirmar se e quando são removidos do banco].",
          ],
        },
      ],
    },
    {
      id: "direitos",
      title: "7. Seus direitos como titular",
      blocks: [
        { type: "p", text: "Você pode solicitar:" },
        {
          type: "ul",
          items: [
            "Acesso (divulgação) às informações pessoais que mantemos sobre você;",
            "Correção, acréscimo ou exclusão, quando os dados estiverem incorretos ou não forem mais necessários;",
            "Interrupção do uso ou exclusão, nos casos previstos em lei;",
            "Informações sobre transferência a terceiros e para o exterior.",
          ],
        },
        {
          type: "p",
          text: "Você mesmo pode editar o seu nome, e-mail e senha e os dados da empresa em Configurações. Hoje não há função de exportação dos seus dados pelo aplicativo; solicite pelo contato abaixo.",
        },
        {
          type: "ul",
          items: [
            "Como exercer os direitos: [PREENCHER: e-mail ou formulário de solicitação]",
            "Prazo de resposta: [PREENCHER: prazo]",
            "Taxa, se houver: [PREENCHER: taxa ou \"sem custo\"]",
            "Identificação do solicitante: [PREENCHER: como confirmamos a identidade]",
          ],
        },
        {
          type: "p",
          text: "Clientes do usuário: se os seus dados foram cadastrados por uma empresa que usa o Serviço, dirija o pedido primeiro a essa empresa, que é quem decidiu registrá-los.",
        },
        {
          type: "note",
          text: "[VERIFICAR COM ADVOGADO: papel do operador do Serviço em relação aos dados dos clientes cadastrados pelos usuários (tratamento por conta do usuário ou responsabilidade própria) e como isso muda o atendimento dos pedidos desses titulares.]",
        },
      ],
    },
    {
      id: "cookies",
      title: "8. Cookies e armazenamento no navegador",
      blocks: [
        {
          type: "p",
          text: "Usamos apenas cookies essenciais e de preferência (sessão, tema, aviso de cookies e o estado da barra lateral). Não usamos cookies de análise ou de publicidade. A lista completa, com finalidade e duração, está na página Cookies (/cookies).",
        },
      ],
    },
    {
      id: "menores",
      title: "9. Menores de idade",
      blocks: [
        { type: "p", text: "O Serviço é destinado a maiores de [PREENCHER: idade mínima — sugestão 18] anos. Não coletamos intencionalmente informações de quem não tem essa idade." },
      ],
    },
    {
      id: "lgpd",
      title: "10. Usuários no Brasil",
      blocks: [
        {
          type: "note",
          text: "[VERIFICAR COM ADVOGADO: aplicabilidade da LGPD (Lei Geral de Proteção de Dados do Brasil) a usuários localizados no Brasil, incluindo base legal, encarregado (DPO), direitos adicionais do titular e transferência internacional.]",
        },
      ],
    },
    {
      id: "alteracoes",
      title: "11. Alterações desta Política",
      blocks: [
        { type: "p", text: "Podemos atualizar esta Política. Mudanças relevantes serão comunicadas [PREENCHER: como e com que antecedência — por exemplo, aviso no aplicativo ou e-mail] e a versão e a data de vigência no topo da página serão atualizadas." },
      ],
    },
  ],
};

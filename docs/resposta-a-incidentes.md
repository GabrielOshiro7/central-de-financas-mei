# Resposta a incidentes de segurança e de dados pessoais

> **Documento interno** (não público). Rascunho técnico para revisão jurídica.
> O que o código não define está como `[PREENCHER: ...]`; o que depende de parecer jurídico está como `[VERIFICAR COM ADVOGADO: ...]`. Nada aqui foi inventado: os itens de "o que existe hoje" refletem o código na data da última revisão.
>
> Última revisão técnica: 2026-11-19. Responsável pelo documento: `[PREENCHER: nome e cargo]`.

## 1. O que é um incidente

Qualquer evento que comprometa, ou possa ter comprometido, a confidencialidade, a integridade ou a disponibilidade dos dados do serviço, em especial dados pessoais. Exemplos:

- acesso indevido a uma conta (senha vazada, sessão roubada) ou ao banco de dados;
- vazamento ou exposição de dados (backup, log, e-mail, repositório, captura de tela);
- perda ou corrupção de dados (inclusive por erro nosso: migração, script, restauração);
- falha de isolamento entre usuários (um usuário vendo dados de outro);
- indisponibilidade prolongada ou ataque que afete o serviço;
- comprometimento de um fornecedor que trate dados do serviço (provedor de hospedagem, de cobrança, de e-mail `[PREENCHER: lista de fornecedores]`).

Na dúvida, trate como incidente e registre; é possível rebaixar depois.

## 2. Como detectar

### 2.1 O que existe hoje

| Fonte | O que mostra | Limite |
|---|---|---|
| Logs do servidor (saída padrão do processo) | Falhas de rotas e de limpeza (`[auth-cleanup]`), com e-mail mascarado e sem corpo de requisição (`src/lib/logging.ts`) | Não há coleta central, retenção definida nem alerta |
| Limitador de tentativas (`src/lib/auth/rateLimit.ts`) | Bloqueia excesso de login/cadastro/recuperação por IP (resposta 429) | Fica na memória do processo; não deixa histórico e some ao reiniciar |
| Tabela `sessions` | Sessões ativas, criação, última atividade, expiração | Não guarda IP nem navegador; não mostra de onde veio o acesso |
| Cabeçalhos de segurança e CSP em modo de observação (`src/proxy.ts`) | Navegador deveria apontar violações | A CSP não tem destino de relatório configurado: nada é coletado |
| Banco de dados (PostgreSQL) | Registros com datas de criação | Não há trilha de auditoria (quem leu/alterou o quê) |

### 2.2 O que falta (a decidir)

- Coleta central de logs com retenção e busca `[PREENCHER: ferramenta]`.
- Alertas para: picos de login falho, muitos pedidos de recuperação de senha, erros 5xx, falha de backup.
- Histórico de acesso por conta (data, IP, navegador) e aviso ao usuário de novo acesso.
- Destino de relatório para a CSP (`report-to`) antes de torná-la obrigatória.
- Trilha de auditoria para ações sensíveis (troca de senha, exclusão de lançamento, mudança de e-mail).
- Canal para receber avisos externos (e-mail de segurança, política de divulgação) `[PREENCHER: endereço]`.
- Teste periódico de restauração de backup.

## 3. Primeiros passos (as primeiras horas)

1. **Registrar o início.** Anote data/hora em que foi descoberto, por quem, e como (modelo no item 7). Abra o registro antes de mexer em qualquer coisa.
2. **Conter.** Pare o dano sem apagar provas:
   - conta comprometida: invalidar as sessões (`invalidateAllUserSessions`, o mesmo efeito da redefinição de senha) e forçar nova senha;
   - credencial ou chave exposta (banco, hospedagem, provedor de cobrança): trocar a credencial e revogar a antiga;
   - falha no código: tirar a rota do ar ou publicar a correção; se preciso, colocar o serviço em manutenção;
   - fornecedor comprometido: seguir o procedimento dele e suspender a integração se necessário.
3. **Preservar evidências.** Antes de reiniciar ou limpar: copiar logs, fazer cópia do banco (dump) em local restrito, guardar capturas e horários. Não rodar a limpeza de sessões/links nem apagar registros relacionados até fechar a análise. Anotar quem teve acesso às evidências.
4. **Avaliar.** Responder, por escrito:
   - quais dados foram envolvidos (categorias: conta, financeiros, clientes do usuário, sessão) e se há dado sensível;
   - quantas pessoas são afetadas (titulares diretos **e** clientes cadastrados pelos usuários);
   - houve acesso/saída real de dados ou só exposição possível;
   - há dano provável (financeiro, fraude, personificação);
   - o dado estava protegido (senha só guardada como hash; sessão só como hash — ver Política de Privacidade) ou legível;
   - ainda está acontecendo.
5. **Decidir quem decide.** `[PREENCHER: responsável pela decisão de comunicar e substituto]`. A decisão de comunicar à autoridade é tomada com o advogado (item 4).

## 4. Comunicação obrigatória (Japão — APPI)

> `[VERIFICAR COM ADVOGADO: este item inteiro — enquadramento, prazos e formulário. O texto abaixo é um roteiro para a triagem, não parecer jurídico.]`

Pela Lei de Proteção de Informações Pessoais (APPI), o operador deve comunicar à **Comissão de Proteção de Informações Pessoais (個人情報保護委員会)** e **ao titular** quando ocorrer (ou houver risco de ocorrer) vazamento, perda ou dano de dados pessoais que se enquadre em algum destes critérios:

| # | Critério | Como ver no nosso caso |
|---|---|---|
| 1 | Envolve dado pessoal **sensível** (要配慮個人情報) | Hoje o serviço não pede, de propósito, dado sensível; o campo livre de observações de clientes pode conter. `[VERIFICAR COM ADVOGADO: o que conta como sensível aqui]` |
| 2 | Pode causar **dano financeiro** por uso indevido (ex.: dados de pagamento, acesso a conta) | Contas com dados financeiros do negócio e dados de cobrança (quando a assinatura existir) |
| 3 | Resulta de **acesso indevido intencional** (ataque, invasão, funcionário mal-intencionado) | Qualquer invasão ou uso indevido de credenciais |
| 4 | Envolve (ou pode envolver) mais de **1.000 pessoas** | Contar titulares diretos e clientes cadastrados pelos usuários |

**Se qualquer critério se aplicar:**

1. **Relato preliminar** à Comissão **imediatamente** (assim que possível após tomar ciência), com o que já se sabe. `[VERIFICAR COM ADVOGADO: formulário, canal de envio e conteúdo mínimo]`
2. **Relato final** dentro do prazo legal, com causa, dados e pessoas afetadas, medidas e prevenção. `[VERIFICAR COM ADVOGADO: prazo(s) do relato final e se muda quando o ato foi intencional]`
3. **Comunicar os titulares afetados**, prontamente e em linguagem simples (item 5).

Mesmo quando nenhum critério se aplica, registrar o incidente (item 6) e avaliar se comunicar é recomendável.

Usuários no Brasil: `[VERIFICAR COM ADVOGADO: se a LGPD se aplica ao serviço e, se sim, o dever e o prazo de comunicar à ANPD e aos titulares]`. Outros países: `[PREENCHER: mercados atendidos]`.

## 5. Comunicação aos afetados

Enviar por e-mail da conta (o cadastro tem e-mail), com:

- o que aconteceu, e quando;
- quais dados foram envolvidos (e quais não);
- o que já fizemos para conter;
- o que a pessoa deve fazer (trocar senha, desconfiar de mensagens suspeitas, conferir lançamentos);
- contato para dúvidas `[PREENCHER: e-mail/canal de privacidade]`.

Usuários do serviço também são **controladores** dos dados de seus clientes. `[VERIFICAR COM ADVOGADO: se devemos avisar os usuários para que eles avisem os clientes deles, ou se o dever é nosso]`.

Regras: não minimizar nem culpar a vítima; não prometer o que não está confirmado; não incluir dados pessoais de terceiros no aviso; guardar cópia do que foi enviado.

## 6. Registro do incidente

Todo incidente (inclusive os que não geraram comunicação) gera um registro em `[PREENCHER: onde guardar — pasta restrita, não neste repositório]`, com:

| Campo | Conteúdo |
|---|---|
| Identificador e datas | Quando ocorreu (estimado), quando foi descoberto, quando foi contido, quando foi encerrado |
| Descoberta | Quem e como |
| Descrição e causa | O que houve e por quê (causa raiz) |
| Dados e pessoas | Categorias de dados, número de titulares, se houve dado sensível |
| Contenção e correção | O que foi feito, por quem, quando |
| Decisão de comunicar | Critérios avaliados (item 4), decisão, quem decidiu, quando |
| Comunicações | Para a Comissão (preliminar e final) e para titulares: datas e cópias |
| Lições | O que muda para evitar repetição; itens do item 2.2 a priorizar |

Prazo de guarda do registro: `[VERIFICAR COM ADVOGADO: prazo]`.

## 7. Contatos

| Papel | Nome | Contato |
|---|---|---|
| Responsável pela resposta a incidentes | `[PREENCHER]` | `[PREENCHER]` |
| Substituto | `[PREENCHER]` | `[PREENCHER]` |
| Advogado | `[PREENCHER]` | `[PREENCHER]` |
| Hospedagem / banco de dados | `[PREENCHER]` | `[PREENCHER: suporte e canal de emergência]` |
| Provedor de cobrança (quando existir) | `[PREENCHER]` | `[PREENCHER]` |
| Comissão de Proteção de Informações Pessoais (Japão) | — | `[VERIFICAR COM ADVOGADO: canal oficial de relato]` |
| Seguradora (se houver) | `[PREENCHER]` | `[PREENCHER]` |

## 8. Revisão

Rever este documento a cada incidente e, no mínimo, `[PREENCHER: periodicidade]`. Fazer um exercício de simulação (conta comprometida + vazamento de backup) antes do lançamento pago `[PREENCHER: data]`.

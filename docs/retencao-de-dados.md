# Retenção de dados

> **Documento interno** (não público). Rascunho técnico para revisão jurídica.
> A coluna **"Prazo atual (código hoje)"** descreve o que o sistema realmente faz, com a referência no código. A coluna **"Prazo proposto"** é decisão do responsável e do advogado: está como `[PREENCHER]` ou `[VERIFICAR COM ADVOGADO]`; nenhum prazo foi inventado.
>
> Última revisão técnica: 2026-11-19. Se o código mudar, atualize a tabela. A Política de Privacidade (`src/content/legal/privacy.ts`) deve dizer o mesmo que a coluna "atual".

## 1. Tabela por tipo de dado

| Tipo de dado | Onde fica | Prazo atual (código hoje) | Prazo proposto |
|---|---|---|---|
| **Conta** (nome, e-mail, senha só como hash, tema, data e versões do aceite dos Termos/Política) | Tabela `users` | **Sem prazo.** Fica enquanto a conta existir. **Não há exclusão de conta pelo aplicativo** (Termos, seção de encerramento). Só o operador, no banco: apagar o usuário remove em cascata sessões, links, empresa e dados ligados (`onDelete: Cascade` em `prisma/schema.prisma`) | `[VERIFICAR COM ADVOGADO: prazo após o encerramento]` |
| **Sessões** (id guardado só como hash, datas, expiração) | Tabela `sessions` | Expiram por **60 min de inatividade** e no teto de **7 dias** (**30 dias** com "lembrar de mim") — `src/lib/auth/sessionPolicy.ts`. Sessão revogada (logout, troca/redefinição de senha) é apagada na hora. Expiradas há **mais de 24 h** são apagadas por limpeza oportunista, em lote de até 500 por disparo, disparada ao concluir um login e ao pedir recuperação de senha (`src/lib/auth/cleanup.ts`). **Não há agendador:** sem logins, a limpeza não roda | `[PREENCHER: manter como está ou adicionar agendador]` |
| **Links de recuperação de senha** (só o hash) | Tabela `password_reset_tokens` | Valem **45 min** (`RESET_TOKEN_DURATION_MS`). Vencidos ou usados há **mais de 24 h** são apagados pela mesma limpeza oportunista. O link é invalidado ao ser usado | `[PREENCHER: manter]` |
| **Dados financeiros** (lançamentos, contas a pagar/receber, recorrências, vendas, categorias, saldo de abertura) | Tabelas `financial_entries`, `bills`, `recurring_*`, `sales`, `categories`... | **Sem prazo.** O usuário pode excluir um lançamento (exige reautenticação) e excluir modelos recorrentes. Contas, vendas e compromissos **não têm exclusão** pelo aplicativo: são cancelados (ficam com o status); ao editar uma venda, as parcelas ainda pendentes são substituídas. Apagar a empresa/usuário remove tudo em cascata | `[VERIFICAR COM ADVOGADO: prazo de guarda após o encerramento; ver item 2]` |
| **Agenda** (compromissos, serviços e parcelas) | Tabelas `appointments`, `appointment_*` | **Sem prazo.** Não há exclusão de compromisso pelo aplicativo: ele é cancelado ou concluído (muda o status); ao editar, as linhas de serviços e de parcelas são substituídas | `[PREENCHER]` |
| **Dados de clientes do usuário** (nome, CPF/CNPJ, telefone, WhatsApp, e-mail, endereço, observações) | Tabela `clients` | **Sem prazo.** O usuário só **desativa** o cliente (não há exclusão física; as vendas e a agenda apontam para ele com `onDelete: Restrict`). Apagar a empresa/usuário remove em cascata | `[VERIFICAR COM ADVOGADO: papel do operador (controlador ou operador) e como atender o pedido de exclusão de um cliente do usuário]` |
| **Insights e leituras** | Tabelas `insights`, `insight_reads` | Recalculados por regras no servidor; os insights de um período são substituídos ao regenerar (`src/lib/insights/mutations.ts`). Estado "lido" é apagado ao desmarcar. Sem prazo para o resto | `[PREENCHER]` |
| **Logs do servidor** | Saída padrão do processo (`console.*`); destino depende da hospedagem | **Sem retenção definida no código.** O código evita dado pessoal nos logs (e-mail mascarado, sem corpo de requisição, sem token/senha — `src/lib/logging.ts`). Quanto tempo ficam depende da plataforma `[PREENCHER: plataforma e prazo]` | `[PREENCHER: prazo; sugestão do técnico: o mínimo necessário para investigar incidentes]` |
| **Backups do banco** | Hoje: dumps manuais (`pg_dump`) na pasta local `backups/` (fora do Git, `.gitignore`), feitos antes das etapas de mudança | **Sem rotação nem prazo.** Os arquivos se acumulam até alguém apagar. Contêm dados de usuários. Política de backup de produção: `[PREENCHER: frequência, local, criptografia, quem acessa, retenção]` | `[VERIFICAR COM ADVOGADO: prazo máximo e como tratar pedidos de exclusão quando o dado ainda está em backup]` |
| **Cookies e armazenamento local** | Navegador do usuário | Cookie de sessão (até 7 ou 30 dias, ver acima); tema e aviso de cookies: 365 dias; estado da barra lateral: até o usuário limpar o navegador (`src/content/legal/cookieInventory.ts`) | `[PREENCHER: manter]` |
| **Limitador de tentativas** | Memória do processo | Janelas de 10 minutos; some ao reiniciar. Guarda só o IP (chave) e a contagem | — |
| **Dados de cobrança** (quando a assinatura existir) | Provedor de cobrança de terceiros | **Ainda não existe** (não há cobrança no código). O Serviço não deve guardar número de cartão | `[PREENCHER: provedor]` · `[VERIFICAR COM ADVOGADO: guarda de comprovantes e notas por obrigação fiscal do operador]` |

## 2. O conflito: exclusão de conta × guarda de registros fiscais pelo próprio usuário

**O problema.** O titular tem direito de pedir a exclusão dos dados pessoais. Mas os lançamentos financeiros do usuário (receitas, despesas, vendas) são os **registros do negócio dele**, que a lei fiscal pode obrigar o próprio usuário a guardar por anos `[VERIFICAR COM ADVOGADO: prazo e o regime do usuário — MEI no Brasil e/ou contribuinte no Japão]`. Se a conta e os lançamentos forem apagados de vez (hoje, apagar o usuário remove tudo em cascata), o usuário pode perder o único registro que tem e não conseguir cumprir a obrigação dele. Por outro lado, o operador não deve guardar dados além do necessário.

**O que o código faz hoje.** Não há exclusão de conta pelo aplicativo, nem exportação completa dos dados (os Termos avisam: "hoje não há exportação completa dos dados pelo aplicativo"). A exclusão é manual, pelo operador, e é total.

**Pontos a decidir (com o advogado):**

1. **Papel do operador** em relação aos lançamentos e aos clientes do usuário: o dado financeiro do negócio é do usuário; o operador só o guarda por conta dele? Isso muda quem responde ao pedido de exclusão dos clientes do usuário. `[VERIFICAR COM ADVOGADO]`
2. **Obrigação do próprio operador:** se houver cobrança, o operador pode ter de guardar os registros da assinatura (comprovantes, notas) por prazo legal, mesmo após o cancelamento. Separar dado de cobrança do dado da conta. `[VERIFICAR COM ADVOGADO: prazo]`
3. **Fluxo proposto para o encerramento** (a implementar, hoje não existe):
   - o usuário pede o encerramento (no app ou pelo contato de privacidade);
   - o app oferece **exportar os dados** antes (hoje falta a exportação completa; é pré-requisito);
   - aviso claro: "você pode ter de guardar seus registros fiscais por `[PREENCHER: prazo]`";
   - **período de carência** antes da exclusão definitiva `[PREENCHER: dias]` (permite desistir);
   - exclusão da conta e dos dados pessoais; dados que o operador for obrigado a manter ficam separados e restritos, com o prazo legal.
4. **Backups:** o dado apagado continua nos backups até o prazo de retenção deles. Decidir se isso é aceitável e como informar o usuário. `[VERIFICAR COM ADVOGADO]`
5. **Dado agregado/anônimo:** se algum dado for mantido para estatística, só anonimizado de verdade. `[VERIFICAR COM ADVOGADO: padrão de anonimização]`

## 3. Lacunas técnicas que este documento expõe

Para cumprir uma política de retenção, o código precisaria de (nenhuma implementada nesta etapa):

- exclusão de conta pelo aplicativo, com carência e exportação prévia;
- limpeza agendada (hoje a limpeza só roda quando alguém faz login ou pede recuperação de senha);
- rotação automática de backups e política de logs;
- exclusão/anonimização de clientes do usuário a pedido (hoje só desativa);
- decidir se contas e vendas canceladas serão apagadas depois de algum prazo.

## 4. Revisão

Atualizar a coluna "atual" a cada mudança que afete dados (nova tabela, nova limpeza, nova integração), e a coluna "proposto" quando o advogado definir os prazos. Depois de definidos, refletir na Política de Privacidade (seção de retenção) e subir a versão do documento.

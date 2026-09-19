# Contexto recuperado — sessões antigas do Claude Code (pré-migração C:→D:)

> Documento gerado automaticamente a partir de 7 arquivos `.jsonl` órfãos encontrados em
> `C:\Users\Gabriel Oshiro\.claude\projects\c--Users-Gabriel-Oshiro-Desktop-projeto\`, sessões de
> quando o projeto ainda vivia em `C:\Users\Gabriel Oshiro\Desktop\projeto` (antes da migração para
> `D:\Gabriel Oshiro\projeto`). A subpasta `memory\` dessas sessões estava vazia — não havia resumo
> estruturado prévio, então este documento foi construído lendo os 7 logs por completo.
>
> Cobertura: **2026-09-04 a 2026-09-18** (14 dias, 7 sessões, ordenadas cronologicamente pelo
> timestamp real dos eventos, não pela data do arquivo). Cada sessão foi processada por um agente
> dedicado que leu o `.jsonl` inteiro em blocos — nenhuma parte foi pulada.
>
> Só leitura/resumo: nenhum arquivo de código foi tocado para gerar este documento.

---

## Linha do tempo resumida

| # | Sessão (id) | Período | Foco principal |
|---|---|---|---|
| 1 | `f80ba120` | 04–08/09 | Etapa 1 (Auth do zero), Etapa 3 (Financeiro) + 3.1 (moeda/categorias) |
| 2 | `efa92580` | 08–09/09 | Etapa 4 (Dashboard), 4.1 (Recorrentes), início 4.2 (tooltips) |
| 3 | `b4531911` | 09–11/09 | Etapa 5 (Contas a Pagar/Receber), 5.1 (aba Caixa + menu) |
| 4 | `84f983e4` | 11/09 (madrugada) | Etapa 6 (Clientes + Vendas), Etapa 7 (IA + Insights) |
| 5 | `2bfa2917` | 11–15/09 | Redesign "Ventriloc" (descartado), sessão/reauth (⚠️ branch sumiu) |
| 6 | `8b6af6e9` | 15–18/09 | Landing page + GSAP + dark mode completo |
| 7 | `e6c09546` | 18/09 (curta) | Logo "OrganizAI" na landing (parcialmente concluído) |

**⚠️ Ponto de atenção que precisa de decisão do usuário:** na Sessão 5, o branch
`sessao-expiracao-reauth` — com o endurecimento de autenticação totalmente implementado e testado
(332 testes + 35 E2E passando) — **desapareceu fora do controle do Claude** e foi substituído por um
branch `etapa-7.0` que ninguém no log criou deliberadamente. Não há confirmação nos logs de que esse
trabalho foi recuperado ou mesclado depois. Vale rodar `git reflog` / `git log --all --oneline` para
confirmar se ele sobreviveu em algum commit antes de assumir que está perdido.

---

## Sessão 1 (`f80ba120`) — 2026-09-04 a 2026-09-08

**Etapas:** Etapa 1 (Autenticação, construída do zero) e Etapa 3 + 3.1 (Módulo Financeiro +
Importação + correção de moeda/categorias). A Etapa 2 (onboarding) já estava pronta no início desta
sessão — foi feita em sessão anterior não coberta por estes logs.

**Decisões de arquitetura:**
- Stack definida: Next.js 16 (App Router) + TS + Postgres/Docker + Prisma 7 (`@prisma/adapter-pg`) +
  Zod + Tailwind + Vitest/Playwright.
- Autenticação própria (não Auth.js): sessões em tabela, cookie com token de 32 bytes, banco guarda
  só hash SHA-256; bcryptjs (cost 12).
- Proteção de rotas em duas camadas: `middleware.ts`→`proxy.ts` (breaking change do Next 16) faz
  checagem otimista de cookie; validação real fica no server component.
- Etapa 3 reaproveitou `FinancialEntry` já existente (Etapa 2) em vez de criar tabela nova; nova
  tabela `categories` com 25 categorias padrão semeadas.
- Importação de dados: streaming (nunca carrega tudo em memória), validação compartilhada entre
  prévia e confirmação, limites de 10MB/10.000 linhas.
- Etapa 3.1: `Business.currency` tornou-se obrigatória (era nullable); trava de troca de moeda
  quando já há lançamentos (API retorna 409); JPY + decimal na importação é **rejeitado**, nunca
  arredondado em silêncio.
- "Período anterior" usa meses civis (não duração em ms) para não quebrar em fevereiro/março.

**Convenções estabelecidas:**
- Todo texto ao usuário com acentuação correta.
- `import { Prisma } from "@prisma/client"; const { Decimal } = Prisma;`.
- `npx next typegen` sempre depois de `prisma migrate dev` quando há rotas novas, antes de `tsc`.
- Migrations sensíveis criadas manualmente com `down.sql`/rollback documentado.
- **A partir da Etapa 3.1, processo obrigatório imposto pelo usuário** (mais rígido que o padrão):
  suíte completa de testes + backup do banco (`pg_dump`) + branch separada antes de qualquer
  mudança estrutural — seguido à risca daqui em diante em todas as sessões seguintes.
- `<label htmlFor>` sempre associado a `id` (reforçado após bug pego pelo Playwright).

**Bugs corrigidos:** renomeação `middleware.ts`→`proxy.ts`; rotas tipadas exigindo `next typegen`;
condição de corrida no filtro de datas (De/Até perdiam valor); `getPreviousPeriodRange` quebrando
entre meses de durações diferentes; falta de `htmlFor`/`id` em labels dos filtros financeiros.

**Escolhas contra a recomendação padrão do Claude Code:**
- Autenticação própria em vez de Auth.js/NextAuth (opção padrão listada no prompt) — decisão do
  próprio Claude, justificada e não contestada pelo usuário.
- bcryptjs em vez de bcrypt/argon2id nativos, para evitar dor de compilação no Windows.
- Prisma mantido em 7.10.0 estável, ignorando um 8.0.0-rc disponível.
- `prisma` CLI movido para `devDependencies` por vulnerabilidades transitivas não usadas em runtime
  — decisão de segurança unilateral do Claude.
- Investigando o "Bug 1" da Etapa 3.1 (moeda tratada como iene), o Claude **auditou o código antes
  de aplicar a correção prescrita** no prompt do usuário, não achou evidência da causa alegada, e
  reportou a discrepância com transparência em vez de corrigir às cegas.

**Pendências ao final:** Etapa 4.1 (Lançamentos Recorrentes) recebida como prompt completo, mas
**implementação não começou** — sessão cortada logo no início (usuário rejeitou um comando
`docker compose ps`). Branch principal intocada; tudo em `etapa-3.1-moeda-categorias`, sem push/merge.

**Outros fatos:** projeto ainda em `C:\Users\Gabriel Oshiro\Desktop\projeto`; Docker Desktop precisou
de restart manual várias vezes; testes evoluíram de 8+7(E2E) → 91+19 → 112+21 ao longo da sessão.

---

## Sessão 2 (`efa92580`) — 2026-09-08 a 2026-09-09

**Etapas:** Etapa 4 (Dashboard Gerencial + Indicadores), Etapa 4.1 (Lançamentos Recorrentes), início
da Etapa 4.2 (tooltips nos gráficos — fechada fora desta sessão, commit `56f518c` do próprio usuário).

**Decisões de arquitetura:**
- Novo serviço central `dashboardService.ts` (`getDashboardData`) para tudo do `/dashboard`.
- `period.ts` ganhou conceito de `alignment` (`"day"` vs `"month"`) para decidir agrupamento da
  série temporal — nunca "adivinhado" pela duração.
- `RecurringEntry`: molde que gera `FinancialEntry` reais via materialização (nunca cálculo
  virtual); nunca materializa futuro; vínculo duplo (`source: RECURRING` + `recurringEntryId`);
  materialização concorrente segura via `createMany` + `skipDuplicates`.
- Trava de moeda (Etapa 3.1) estendida para contar também `RecurringEntry` ativo, não só
  `FinancialEntry`.
- Ao tornar `FinancialChart` Client Component, `EvolutionPoint` migrou de `Prisma.Decimal` para
  `number` puro (Decimal não cruza a fronteira servidor→cliente).

**Convenções estabelecidas:**
- Nomenclatura financeira **invertida** do senso comum: `COST` = custo variável, `EXPENSE` = despesa
  fixa — documentado explicitamente em comentário no código.
- Crescimento com troca de sinal (prejuízo→lucro) nunca vira % normal — precisa de texto explícito.
- `describeSignedGrowth` deve usar `.gt(0)`/`.lt(0)`, nunca `.isPositive()` do decimal.js.
- Testes de consistência cruzada obrigatórios sempre que dois caminhos de cálculo podem divergir.
- Toda formatação de valor passa por `formatMoney`/`formatPercent` centralizados.

**Bugs corrigidos:** import faltando em `queries.ts` (apontado pelo usuário no meio da edição);
granularidade errada de série (mês inteiro mesmo em ranges por dia); `.isPositive()` tratando
`Decimal(0)` como positivo; falso-positivo de alinhamento mensal por `getDate()===1`; crash real em
runtime (não pego por tsc/build/testes) ao Decimal cruzar fronteira server→client; erro
`removeChild` no modal (investigado a fundo, evidência forte aponta extensão do navegador
ColorZilla, **não confirmado definitivamente**).

**Escolhas contra a recomendação padrão / controle rígido do usuário:**
- Usuário interrompeu o Claude no meio de uma edição para apontar bugs específicos; exigiu output
  literal do terminal (não resumo) antes de fechar etapas; bloqueou o commit da Etapa 4.1 até o bug
  `removeChild` ser investigado, mesmo com evidência forte de causa externa.
- Claude usou `AskUserQuestion` em vez de decidir sozinho como organizar o git quando percebeu que a
  Etapa 4 ainda estava uncommitted antes de abrir a branch da 4.1.

**Pendências ao final:** confirmação definitiva do bug `removeChild` (usuário orientado a testar em
janela anônima, sem confirmação registrada no log); toque mobile não 100% validável por automação
(limitação conhecida Playwright/CDP); limpeza cosmética de classes Tailwind arbitrárias, não aplicada.

**Outros fatos:** testes evoluíram 112→126→142→173→189 ao longo da sessão; 3 commits
(`60e49c3`, `580137e`, e `56f518c` feito pelo próprio usuário fora da sessão).

---

## Sessão 3 (`b4531911`) — 2026-09-09 a 2026-09-11

**Etapas:** Etapa 5 (Contas a Pagar e Receber) e Etapa 5.1 (aba "Caixa" + reorganização de menu).

**Decisões de arquitetura:**
- Entidade nova `Bill` (não reaproveitou `FinancialEntry` diretamente); direção (pagar/receber)
  **derivada** de `category.type`, nunca armazenada redundante. `RecurringBill` é entidade própria
  (não extensão de `RecurringEntry`), reaproveitando o motor de datas de `recurring/occurrences.ts`.
- Status da conta e "Atrasado" são **derivados em runtime**, nunca persistidos.
- Materialização de `RecurringBill` olha 90 dias **para frente** (diferente de `RecurringEntry`, que
  só olha para trás) — porque contas a pagar/receber precisam aparecer antes de vencer.
- Mutations de settle/revert/cancel usam `updateMany` condicional + constraint única para
  idempotência sob concorrência.
- `Business.openingBalance` novo; cálculo de caixa reaproveita `netProfit` já existente.
- `/empresa` virou **redirect permanente** para `/configuracoes#empresa` em vez de removida (não
  quebrar links salvos) — auditoria completa confirmou que o pós-onboarding nunca apontava para lá.

**Convenções estabelecidas:** migrations sempre com `migration.sql` + `rollback.sql` par a par;
backup do banco + branch dedicada antes de qualquer mudança estrutural; verificação visual manual
via script Playwright ad-hoc antes de fechar etapa; mensagens de commit multi-linha via arquivo +
`git commit -F` (here-string do PowerShell truncava a mensagem).

**Bugs corrigidos:** botão duplicado "+ Nova conta" em lista vazia (pego pelo Playwright); export de
constante de arquivo `"use client"` importado em server component; `id="name"` duplicado entre
`EmpresaForm`/`ProfileForm` quebrando `label[for]`.

**Escolhas contra a recomendação padrão:** nenhuma rejeição explícita nesta sessão — as duas
perguntas via `AskUserQuestion` foram aprovadas como propostas pelo Claude. Único ponto de correção:
usuário desmentiu a conclusão do Claude de que "Docker não estava instalado" (só não estava rodando)
e exigiu verificação empírica antes de prosseguir.

**Pendências ao final:** nenhuma tarefa de código explicitamente pendente; ao final o Claude notou
sinais de que uma "Etapa 6" já estava em andamento em paralelo fora desta sessão, mas não investigou.

**Outros fatos:** testes finais Etapa 5: 217/217 + 23/23 E2E; Etapa 5.1: 231/231 + 26/26 E2E. Escopo
explicitamente fora: sem exclusão definitiva de conta, sem visão de calendário, sem "número de
ocorrências" na recorrência.

---

## Sessão 4 (`84f983e4`) — 2026-09-11 (madrugada/manhã)

**Etapas:** Etapa 6 (Clientes + Vendas) completa, seguida (mesma sessão, após `/compact`) da Etapa 7
(IA + Insights Financeiros) completa.

### Etapa 6 — Clientes + Vendas

**Decisões de arquitetura:**
- Parcela de venda a prazo = `Bill` (novo `Bill.saleId`), reaproveitando 100% do fluxo
  settle/cancel/revert já existente da Etapa 5 — nenhum código novo de pagamento.
- Venda à vista cria `Bill` já `PAID` na mesma transação, passando pelo mesmo caminho que
  `settleBill` usa — evita dois caminhos de código diferentes escrevendo em `FinancialEntry`.
- Numeração de venda via incremento atômico `UPDATE ... RETURNING` (não `MAX()+1`, inseguro sob
  concorrência).
- Categoria da venda é única por `Sale` inteira (não por item) — decisão explícita do usuário.
- Idempotência de criação via `clientRequestId` (UUID) + constraint única — usuário rejeitou a
  alternativa mais simples de só desabilitar o botão de submit.
- Cancelamento de venda com parcela já paga é **totalmente bloqueado** — decisão explícita do
  usuário, sem criar status intermediário.
- `getTopClients`/`getTopProducts` usam `findMany` + redução em memória (não `Prisma.groupBy`),
  por consistência com o resto do módulo — confirmado via grep que o projeto nunca usa `groupBy`.

**Bugs corrigidos:** `onSubmit` de `SaleForm` não chamava `submit()`; validação quebrada no modo "à
vista" padrão; bug real de hydration SSR (contador de módulo persistindo no servidor, resetando no
cliente); labels sem `htmlFor`/`id`; rota `/api/vendas/[id]/complete` ausente; UI de criação de
produto ausente.

**Verificação final:** tsc/lint/build limpos, 270/270 testes + 31/31 E2E, zero regressões.

### Etapa 7 — IA + Insights Financeiros

**Decisões de arquitetura:**
- Narrativa (texto) e fatos (números) **separados**: motor de regras determinístico (`rules.ts`)
  funciona 100% sem IA; a camada de IA só pode reescrever texto, nunca inventar números — validado
  por whitelist de strings permitidas antes de aceitar a saída da IA.
- Sistema é totalmente funcional com `AI_PROVIDER=none`.
- Query de fingerprint (invalidação de cache) usa índice já existente, sem índice novo.
- Chamada de IA é **fora de banda**, só via botão "Regenerar" — `GET /api/insights` nunca bloqueia.
- `src/lib/ai/provider.ts` é a primeira integração HTTP externa do projeto — convenção própria de
  timeout via `AbortController`, sem retry.

**Bugs corrigidos:** migration esqueceu `@map("period_start")`; testes próprios cruzando limiar
CRITICAL incorretamente; `SaleItem` sem campo `description` em teste de integração.

**Escolhas contra a recomendação padrão do Claude Code (as mais importantes de toda a base):**
1. **IA síncrona vs. fora de banda**: Claude recomendou IA síncrona no `GET` (timeout 4-5s); usuário
   escolheu fora de banda, só no botão "Regenerar".
2. **Provedor de IA real**: Claude recomendou implementar Anthropic nesta etapa; usuário escolheu
   "nenhum agora — só a abstração + NullProvider".
3. **Reset destrutivo do banco**: diante de um erro de segurança do Prisma, Claude pediu para rodar
   `prisma migrate reset --force`; usuário **consentiu explicitamente**; mas o próprio **Claude
   decidiu não executar** o reset e corrigiu com uma migration aditiva, preservando os dados de
   teste — mais conservador que o que o próprio usuário havia autorizado.
4. Na primeira tentativa de sair do Plan Mode (Etapa 6), o **usuário rejeitou o plano** e expôs um
   bug real na proposta (`MAX()+1` com retry não funcionaria por Postgres abortar a transação
   inteira após statement falho) — forçou a mudança para `UPDATE ... RETURNING`.

**Verificação final:** tsc/lint/build limpos, 321/321 testes + 33/33 E2E, zero regressões.

**Pendências ao final:** provedor real de IA ainda não conectado (mencionado como base para uma
futura "Etapa 8 — Chat CFO"); filtros de cliente cobrem só busca+status; sem página standalone de
catálogo de produtos; sem importação CSV/XLSX de clientes/vendas.

---

## Sessão 5 (`2bfa2917`) — 2026-09-11 a 2026-09-15

**Etapas:** Nenhuma etapa numerada nova de negócio. Três frentes: setup do skill `impeccable`,
experimento de redesign visual "Ventriloc" (**descartado por completo**), e um endurecimento de
sessão/reautenticação (**branch sumiu, ver alerta no topo**).

**Decisões de arquitetura (redesign Ventriloc, descartado mas registrado):**
- Paleta quase monocromática + Laranja Ember como destaque; três cores semânticas (Musgo/Âmbar/
  Terracota) confinadas à "regra das 4 portas" (nunca em botão/menu/título).
- Kit de UI novo (`src/components/ui/`) escopado só a Clientes/Vendas/Financeiro/Insights, mantido
  separado do `FormField`/`SubmitButton` usado em login/onboarding/Configurações.
- `AppShell` (sidebar 240px colapsando para drawer <768px) substituindo `AppNav`.

**Decisões de arquitetura (sessão/reauth):**
- Confirmado que sessão já é DB-backed (não JWT) — sem migração de mecanismo necessária.
- Removida a **renovação deslizante** de expiração — bug real: com uso contínuo a sessão nunca
  expirava de verdade. Substituída por inatividade (60min) + teto absoluto (7d / 30d com "lembrar
  de mim"), checados a cada requisição.
- Novo módulo `sessionPolicy.ts` centraliza todas as constantes (sem números mágicos).
- `elevateSession`/reauth com janela de graça de 10min; nova rota `POST /api/auth/reauth` validada
  **no servidor**.
- Escopo de "ações sensíveis" limitado ao que realmente existe no app (trocar senha, excluir
  lançamento financeiro) — funcionalidades citadas no prompt que não existem (excluir conta, trocar
  e-mail, exportar dados) **não foram inventadas**.

**Bugs corrigidos:** renovação deslizante quebrando o objetivo da própria etapa; `DELETE` de
lançamento financeiro sem nenhuma proteção; sidebar sem comportamento mobile; contraste insuficiente
de texto pequeno (Ardósia falhava WCAG 4.5:1, ~86 ocorrências trocadas por Aço).

**Escolhas contra a recomendação padrão / anomalias:**
- `npx impeccable install` bloqueado 2x pelo classificador de auto mode; Claude não tentou contornar,
  usuário rodou direto no terminal.
- Usuário descartou 57 arquivos não commitados do redesign (`git reset --hard` + `git clean -fd`)
  após Claude sinalizar o volume de mudanças.
- **⚠️ Branch `sessao-expiracao-reauth` (trabalho completo e testado) sumiu fora do controle do
  Claude**, substituído por um branch `etapa-7.0` que ninguém criou deliberadamente no log. Claude
  sinalizou como anômalo e ofereceu investigar via reflog — sem resposta do usuário registrada.

**Pendências ao final:** investigação do reflog para recuperar `sessao-expiracao-reauth` (não
concluída); aviso client-side de "sessão prestes a expirar" (item opcional, não implementado);
branch `experimento-design-ventriloc` recriado vazio ao final, sugerindo intenção de refazer o
redesign numa sessão futura.

**Outros fatos:** verificação final do trabalho de sessão/reauth: 332 testes + 35 E2E passando antes
do branch desaparecer. `PRODUCT.md` criado (usuário-alvo = dono de pequeno negócio solo). MCP do
Figma adicionado em `.mcp.json`.

---

## Sessão 6 (`8b6af6e9`) — 2026-09-15 a 2026-09-18

**Etapas:** Nenhuma etapa numerada — landing page pública (`/`) do zero + dark mode completo
(landing + app), branch `landing-page-cfo-ia` criado a partir de `etapa-7.0`.

**Decisões de arquitetura:**
- Landing = Header + Hero apenas (escopo explícito). `page.tsx` redireciona autenticados para
  `/dashboard`.
- Paleta "CFO IA — Orange & Charcoal" isolada em tokens `--color-landing-*`, explicitamente separada
  do resto do app.
- Animações migradas de CSS puro para **GSAP** (`useGSAP`): hook `useHeroEntranceAnimation.ts`
  separado da lógica de layout; `HeroAnimations.tsx` como fronteira `"use client"` mínima; timeline
  alcança os elementos via `data-anim="..."` (não refs por prop), mantendo os componentes de layout
  como Server Components.
- Dark mode via `next-themes` (`data-theme`), com `@custom-variant dark` reapontando as ~90 classes
  `dark:` já existentes no app para reagir ao toggle manual (antes só reagiam a `prefers-color-scheme`
  do SO).

**Convenções estabelecidas:** tokens de superfície isolados e comentados; animação sempre acoplada
via `data-anim`; lógica GSAP sempre em hook próprio; `contextSafe` obrigatório em loops/callbacks
assíncronos de animação; contraste de cor sempre validado por cálculo (WCAG AA ≥4.5:1), nunca "no
olho"; trabalho conceitualmente distinto em commits separados mesmo na mesma sessão.

**Bugs corrigidos:** badge sobrepondo rótulo do gráfico; header mobile quebrando em duas linhas;
botão outline ilegível no dark mode (`bg-white` fixo); "glow" indevido em sombra no dark mode;
contraste do Âmbar abaixo de AA (ajustado de `#a5690f` para `#8a570c`); loops de flutuação
sincronizados indevidamente (corrigido para dessincronia natural).

**Escolhas / descobertas:** Claude descobriu que as cores "Musgo/Âmbar/Terracota" citadas pelo
usuário **não existiam em lugar nenhum do código** (nem em CLAUDE.md/PRODUCT.md), apesar do prompt
presumir que já eram a paleta do app — sinalizou proativamente essa premissa incorreta antes de
prosseguir; usuário optou por introduzi-las agora.

**Pendências ao final:** troca da logo placeholder pela logo real "OrganizAI" — pedida mas **não
concluída** (SVG anexado não chegou a tempo, estouro de contexto) — isso é exatamente o que a Sessão
7 (abaixo) continua. `InsightCard` com dados reais não verificado visualmente em dark mode; tabelas
de Vendas não capturadas separadamente em dark mode; sombras de modais não revisadas para dark mode.

**Outros fatos:** nome real do produto revelado nesta sessão: **"OrganizAI"** (antes só placeholder
genérico, pois `PRODUCT.md` proíbe inventar marca sem pedido explícito). 3 commits:
`63a8da1`, `425651d`, `192097b` (o primeiro corrigido via `git commit --amend` por falta de
atribuição — permitido por ser commit local recém-criado, ainda não compartilhado).

---

## Sessão 7 (`e6c09546`) — 2026-09-18 (curta, mais recente)

**Etapas:** Nenhuma — continuação direta da pendência da Sessão 6 (logo "OrganizAI" na landing).
Escopo restrito ao Header da landing (`LandingLogo.tsx`/`LandingHeader.tsx`); app autenticado e
favicon explicitamente fora de escopo.

**Decisões de arquitetura:**
- SVG renderizado **inline no JSX**, não via `next/image` — decisão deliberada porque
  `fill="currentColor"` só herda cor CSS quando o SVG está inlined no DOM.
- Cor do logo controlada pelo token já existente `--color-landing-foreground`/
  `text-landing-foreground` (já alterna preto↔branco entre temas, já tem transição de 0.2s) —
  nenhuma CSS nova de dark mode foi necessária.

**Limitação técnica identificada pelo Claude (não é bug de código):**
- O "SVG" anexado pelo usuário era na verdade um PNG raster embrulhado em tag `<svg>` — não vetor
  real. Claude recusou-se a transcrever o blob base64 à mão (risco de corrupção silenciosa) e
  construiu um wordmark vetorial próprio como substituto.
- Uma imagem colada direto no chat também não pôde ser processada (sem acesso aos bytes neste
  ambiente) — Claude reconstruiu o ícone (anel com corte diagonal) como aproximação visual.
- Em ambos os casos, o Claude **sinalizou claramente a limitação ao usuário** em vez de fingir usar
  o arquivo real.

**Pendência real deixada em aberto (é a mais recente do projeto):**
- O ícone da marca ainda é uma **aproximação vetorial**, não o PNG pixel-exato do usuário. Para
  trocar para o asset real, o usuário precisa **salvar o arquivo diretamente em
  `public/logo/organizai-icon.png` pelo sistema de arquivos/IDE** (não colar no chat) — a partir
  daí o Claude trocaria a implementação para `next/image` + `dark:invert` com transição de 0.2s.
- Isso corresponde exatamente ao estado atual do git: `LandingLogo.tsx` modificado e `public/logo/`
  como untracked no `git status` mais recente do projeto.

**Outros fatos:** `npx tsc --noEmit` limpo 2x; screenshots comparativos light/dark via script
Playwright ad-hoc (`shot-logo.js`), usando o header do site do Banco Inter como referência de escala
pedida pelo usuário.

---

## Pendências agregadas (ainda em aberto, na ordem mais recente primeiro)

1. **Logo "OrganizAI"** — trocar aproximação vetorial pelo PNG/SVG real do usuário, salvo por
   arquivo (não chat) em `public/logo/organizai-icon.png`; depois migrar para `next/image` +
   `dark:invert` (Sessão 7).
2. **Dark mode — verificação visual incompleta**: `InsightCard` com dados reais, tabelas de Vendas,
   sombras de modais/diálogos (Sessão 6).
3. **Branch `landing-page-cfo-ia`** sem merge — decisão de aprovar/mesclar fica para o usuário.
4. **⚠️ Branch `sessao-expiracao-reauth`** (endurecimento de sessão, 332+35 testes passando) —
   desapareceu sem explicação; recomendável checar `git reflog`/`git log --all` antes de considerar
   esse trabalho perdido (Sessão 5).
5. **Redesign visual "Ventriloc"** — descartado por completo a pedido do usuário; branch
   `experimento-design-ventriloc` foi recriado vazio ao final da Sessão 5, sugerindo intenção de
   refazer no futuro.
6. **Provedor real de IA** para a Etapa 7 (Insights) — só a abstração `src/lib/ai/provider.ts` +
   `NullProvider` existe; nenhum provedor real (Anthropic/OpenAI/etc.) foi conectado. Mencionado
   como base para uma futura "Etapa 8 — Chat CFO" (Sessão 4).
7. Escopos conscientemente deixados de fora (não são bugs, são decisões de escopo): sem importação
   CSV/XLSX de clientes/vendas; sem página standalone de catálogo de produtos; filtros de cliente
   cobrem só busca+status; sem exclusão definitiva de conta a pagar/receber (só cancelamento); sem
   visão de calendário para contas.

## Decisões de arquitetura mais consequentes (para referência rápida)

- Autenticação própria (não Auth.js) desde a Etapa 1 — ver `CLAUDE.md` atual, que já documenta isso.
- Padrão recorrente **"molde recorrente materializa registros reais"**: `RecurringEntry` (Etapa 4.1)
  e `RecurringBill` (Etapa 5) nunca calculam virtualmente, sempre materializam via `createMany` +
  `skipDuplicates` para segurança de concorrência.
- Padrão recorrente **"status é sempre derivado, nunca persistido"**: `BillStatus`, "Atrasado",
  status de pagamento de venda.
- Padrão recorrente de **integração**: vendas a prazo reaproveitam `Bill` (não criam sistema
  paralelo); insights separam fatos determinísticos de narrativa gerada por IA, com validação por
  whitelist.
- `findMany` + redução em memória é a convenção estabelecida do projeto para agregações financeiras
  — `Prisma.groupBy`/`aggregate` nunca são usados, por consistência deliberada.

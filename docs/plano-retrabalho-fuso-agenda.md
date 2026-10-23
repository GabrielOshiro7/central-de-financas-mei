# Plano técnico — Retrabalho de Fuso horário + Agenda

Data: 2026-10-23 · Branch: `landing-page-cfo-ia` · Documento de planejamento (nenhum código alterado).

## Estado da Fase 0 (verificado em 2026-10-23, ~10:00 JST)

| Item | Estado |
|---|---|
| Vitest em banco `*_test` | **Aplicado no working tree, não commitado.** `tests/setup.ts` → `tests/testEnv.ts` carrega `.env.test` (`app_db_test`); suíte 653/653 verde contra `app_db_test`. |
| Playwright na porta 3100 com banco `*_test` | **Aplicado no working tree, não commitado.** `playwright.config.ts` (porta 3100, `DATABASE_URL` do `.env.test`, `NEXT_DIST_DIR=.next-test`). Suíte completa 09:56:40–10:02:38 JST: **53 passaram, 7 falharam** (todas `mobileTables.spec.ts`, a falha conhecida de raio). Porta 3000 respondeu 200 em 26/26 checagens durante a suíte; contagens do `app_db` (Business 1834, Appointment 81, FinancialEntry 952, usuários @example.com 2125) idênticas antes e depois. |
| Trava contra banco sem `_test` | **Aplicada e provada** (Vitest e Playwright abortam com `DATABASE_URL=…/app_db`). `tests/testEnv.ts`, `tests/e2e/global-setup.ts`, checagem também no topo de `playwright.config.ts`. |
| Banco `app_db_test` | Criado; 12 migrações aplicadas com `migrate deploy`; seed das 25 categorias padrão (`npm run test:db:prepare`). |
| Remoção das 5 duplicatas da Academia Gabriel | **NÃO aplicada.** As 5 linhas continuam no `app_db` (5 grupos duplicados). Backup pronto: `backups/app_db_pre-fase0-dedup_20261023_095646.dump` (753.865 bytes); script transacional pronto, não executado. |

Consequências para este plano: a Etapa F5 (nova chave de idempotência) **depende** da remoção das duplicatas (a constraint nova falharia). A matriz TZ=UTC × TZ=Asia/Tokyo só é segura depois que a Fase 0 (A) estiver commitada e a suíte do Playwright confirmada verde em 3100.

---

## 1. Resumo executivo

Hoje o sistema tem dois regimes de data: a Agenda usa Asia/Tokyo explícito (`src/lib/agenda/time.ts`), e todo o financeiro (períodos do dashboard, vencidos, recorrentes, caixa, vendas, clientes) usa o fuso do processo Node. O duplicado da Academia Gabriel é sintoma disso: a chave `@@unique([recurringEntryId, occurredAt])` compara instantes, e um servidor em UTC gerou "meia-noite" em outro instante.

O plano faz, nesta ordem:

1. Um utilitário único de datas, com fuso por parâmetro e seguro para horário de verão.
2. `Business.timezone` (IANA) e `Business.country`, com backfill "Asia/Tokyo" / "JP".
3. A migração de todos os cálculos de "hoje", dia, mês e vencimento para esse utilitário.
4. Uma chave de idempotência dos recorrentes por **data de calendário** (`occurrence_date DATE`).
5. As datas financeiras como **data de calendário** (`@db.Date`), para que trocar o fuso nunca mova lançamentos já gravados.
6. A tela de País/Fuso em Configurações.

Só então vem a Agenda nova:

1. Agendamento por **data** (sem hora), com serviços, valor, categoria e forma de pagamento definidos na criação.
2. **Conclusão automática preguiçosa** depois do fim do dia no fuso da empresa, só para o fluxo novo.
3. **Desfazer** com estorno atômico. O desfazer **apaga** os lançamentos gerados, porque o `revertBillSettlement` atual só desvincula e deixaria o dinheiro contado.

São 14 etapas pequenas, cada uma commitável, com o sistema funcionando entre elas. O fluxo legado da Agenda continua idêntico.

---

## 2. Inventário do estado atual

### 2.1 Onde o fuso é decidido hoje

| Local | Como decide | Referência |
|---|---|---|
| Agenda | `AGENDA_TIMEZONE = "Asia/Tokyo"` + `Intl.DateTimeFormat`; offset fixo +9 sem DST | [time.ts:13](../src/lib/agenda/time.ts#L13), [time.ts:18](../src/lib/agenda/time.ts#L18), [time.ts:61](../src/lib/agenda/time.ts#L61), [time.ts:128](../src/lib/agenda/time.ts#L128) |
| Calendário da Agenda | usa time.ts | [calendar.ts:20-98](../src/lib/agenda/calendar.ts#L20) |
| Guarda estática (só `src/lib/agenda`) | proíbe getters locais | [noLocalTimeUsage.test.ts](../tests/unit/agenda/noLocalTimeUsage.test.ts) |
| Períodos do dashboard | getters locais do processo (documentado como limitação) | [period.ts:2-9](../src/lib/finance/period.ts#L2), [period.ts:62](../src/lib/finance/period.ts#L62), [period.ts:70-76](../src/lib/finance/period.ts#L70), [period.ts:89-110](../src/lib/finance/period.ts#L89), [period.ts:120-193](../src/lib/finance/period.ts#L120), [period.ts:236](../src/lib/finance/period.ts#L236), [period.ts:274](../src/lib/finance/period.ts#L274) |
| Ocorrências de lançamentos recorrentes | getters locais | [occurrences.ts:3-5](../src/lib/finance/recurring/occurrences.ts#L3), [occurrences.ts:45-46](../src/lib/finance/recurring/occurrences.ts#L45), [:62](../src/lib/finance/recurring/occurrences.ts#L62), [:74](../src/lib/finance/recurring/occurrences.ts#L74), [:86-89](../src/lib/finance/recurring/occurrences.ts#L86), [:98-139](../src/lib/finance/recurring/occurrences.ts#L98), [:159-160](../src/lib/finance/recurring/occurrences.ts#L159) |
| Materialização de recorrentes | `uptoDate = new Date()` | [materialize.ts:22](../src/lib/finance/recurring/materialize.ts#L22), [materialize.ts:61](../src/lib/finance/recurring/materialize.ts#L61) |
| Ocorrências de contas recorrentes | `startOfDay` de period.ts | [bills/occurrences.ts:3](../src/lib/finance/bills/occurrences.ts#L3), [:70-71](../src/lib/finance/bills/occurrences.ts#L70) |
| Materialização de contas | `addDays` local, horizonte | [bills/materialize.ts:16-29](../src/lib/finance/bills/materialize.ts#L16) |
| Status "Atrasado" | `startOfDay` local | [bills/status.ts:37](../src/lib/finance/bills/status.ts#L37) |
| Filtros/previsão de contas | `startOfDay` local | [bills/queries.ts:10](../src/lib/finance/bills/queries.ts#L10), [:24](../src/lib/finance/bills/queries.ts#L24), [:154](../src/lib/finance/bills/queries.ts#L154), [:187](../src/lib/finance/bills/queries.ts#L187), [:240-252](../src/lib/finance/bills/queries.ts#L240) |
| Lista de contas (página) | `today` local | [BillListPage.tsx:21-62](../src/app/(app)/financeiro/_shared/BillListPage.tsx#L21) |
| Série mensal/diária do dashboard | getters locais | [finance/queries.ts:72-81](../src/lib/finance/queries.ts#L72), [:127-139](../src/lib/finance/queries.ts#L127) |
| Caixa | getters locais | [cash/queries.ts:95](../src/lib/finance/cash/queries.ts#L95), [:107](../src/lib/finance/cash/queries.ts#L107) |
| Insights | getters locais | [insights/snapshot.ts:26-52](../src/lib/insights/snapshot.ts#L26) |
| Vendas (status de pagamento) | `startOfDay` local | [sales/calculations.ts:74-88](../src/lib/sales/calculations.ts#L74), [sales/queries.ts:132-141](../src/lib/sales/queries.ts#L132) |
| Clientes (atraso) | `startOfDay` local | [clients/queries.ts:188-197](../src/lib/clients/queries.ts#L188) |
| Detecção de duplicata na importação | getters locais | [duplicates.ts:5](../src/lib/finance/duplicates.ts#L5), [:27](../src/lib/finance/duplicates.ts#L27) |
| Importação (datas) | `toISOString().slice(0,10)` (UTC) | [importParsing.ts:125](../src/lib/finance/importParsing.ts#L125), [importValidation.ts:54](../src/lib/finance/importValidation.ts#L54) |
| Rotas de API (entrada `YYYY-MM-DD`) | `new Date("YYYY-MM-DD")` = **meia-noite UTC** | [transactions/route.ts:29](../src/app/api/financeiro/transactions/route.ts#L29), [transactions/[id]/route.ts:31](../src/app/api/financeiro/transactions/[id]/route.ts#L31), [bills/route.ts:31-32](../src/app/api/financeiro/bills/route.ts#L31), [bills/[id]/route.ts:36-37](../src/app/api/financeiro/bills/[id]/route.ts#L36), [settle/route.ts:37](../src/app/api/financeiro/bills/[id]/settle/route.ts#L37) (default `new Date()` = instante), [recurring/route.ts:37-38](../src/app/api/financeiro/recurring/route.ts#L37), [recurring/[id]/route.ts:40-41](../src/app/api/financeiro/recurring/[id]/route.ts#L40), [bills/recurring/route.ts:36-37](../src/app/api/financeiro/bills/recurring/route.ts#L36), [bills/recurring/[id]/route.ts:39-40](../src/app/api/financeiro/bills/recurring/[id]/route.ts#L39), [vendas/route.ts:30](../src/app/api/vendas/route.ts#L30), [:40](../src/app/api/vendas/route.ts#L40), [vendas/[id]/route.ts:54](../src/app/api/vendas/[id]/route.ts#L54), [:64](../src/app/api/vendas/[id]/route.ts#L64), [vendas/[id]/confirm/route.ts:29](../src/app/api/vendas/[id]/confirm/route.ts#L29), [opening-balance/route.ts:32](../src/app/api/business/opening-balance/route.ts#L32) |
| "Hoje" padrão nos formulários (navegador) | getters locais **do navegador** | [BillFormModal.tsx:36-38](../src/components/financeiro/BillFormModal.tsx#L36), [TransactionFormModal.tsx:28-30](../src/components/financeiro/TransactionFormModal.tsx#L28), [BillTable.tsx:43-45](../src/components/financeiro/BillTable.tsx#L43), [SaleBillsTable.tsx:30-32](../src/components/vendas/SaleBillsTable.tsx#L30), [SaleForm.tsx:45-57](../src/components/vendas/SaleForm.tsx#L45), [CompleteAppointmentDialog.tsx:12-14](../src/components/agenda/CompleteAppointmentDialog.tsx#L12) |
| Exibição de datas | `toLocaleDateString("pt-BR")` / getters locais | [clientes/page.tsx:55](../src/app/(app)/clientes/page.tsx#L55), [clientes/[id]/page.tsx:102](../src/app/(app)/clientes/[id]/page.tsx#L102), [:143](../src/app/(app)/clientes/[id]/page.tsx#L143), [:155](../src/app/(app)/clientes/[id]/page.tsx#L155), [EmpresaSection.tsx:13-15](../src/app/(app)/configuracoes/EmpresaSection.tsx#L13), [recorrentes/page.tsx:10-16](../src/app/(app)/financeiro/recorrentes/page.tsx#L10), [TransactionListPage.tsx:23-29](../src/app/(app)/financeiro/_shared/TransactionListPage.tsx#L23), [vendas/page.tsx:49](../src/app/(app)/vendas/page.tsx#L49), [vendas/[id]/page.tsx:14-20](../src/app/(app)/vendas/[id]/page.tsx#L14), [vendas/[id]/editar/page.tsx:12-14](../src/app/(app)/vendas/[id]/editar/page.tsx#L12), [CashBalanceCard.tsx:35](../src/components/caixa/CashBalanceCard.tsx#L35), [:48](../src/components/caixa/CashBalanceCard.tsx#L48), [finance/format.ts:37](../src/lib/finance/format.ts#L37) |

**Representações misturadas hoje:**
- Entradas manuais são gravadas à meia-noite **UTC**, via `new Date("YYYY-MM-DD")`.
- Recorrentes materializados são gravados à meia-noite **do processo**: com o host em JST, isso dá 15:00 UTC do dia anterior.
- As duas coisas só aparecem no dia certo porque o host roda em JST. Num fuso negativo (ex.: São Paulo), uma entrada manual de "20/10" apareceria em 19/10.

### 2.2 Modelos Prisma envolvidos

- **Business** ([schema.prisma:184-230](../prisma/schema.prisma#L184)): não tem fuso nem país. Tem `currency`, cuja troca já é bloqueada quando há lançamentos ([businessMutations.ts:37](../src/lib/onboarding/businessMutations.ts#L37)), e `openingBalanceDate DateTime?` (:214).
- **FinancialEntry**: `occurredAt DateTime` (:291), `@@unique([recurringEntryId, occurredAt])` (:321), `billId` (`Bill.financialEntry` é 1:1).
- **RecurringEntry**: `startDate`/`endDate DateTime` (:356-357).
- **Bill**: `issueDate?`, `dueDate`, `paidAt?` (:388-393), `@@unique([recurringBillId, dueDate])` (:429).
- **RecurringBill**: `startDate`/`endDate` (:465-466).
- **Sale**: `saleDate DateTime` (:590), `paymentMethod String?` (:601), `clientRequestId` com `@@unique([businessId, clientRequestId])` (:609, :618). `SaleStatus` = DRAFT/CONFIRMED/CANCELLED/COMPLETED (:106-112).
- **Product**: `durationMinutes Int?` (:554) e `defaultPrice Decimal?`.
- **Appointment** (:801-835): `startAt`/`endAt DateTime` NOT NULL (:808-809), `status`, `completedAt?`, `cancelledAt?`, `saleId? @unique`. Índices `(businessId,startAt)`, `(businessId,clientId,startAt)` e `(businessId,status,startAt)`.
- **AppointmentService** (:849-862): `nameSnapshot`, `durationMinutesSnapshot Int` NOT NULL, `position` e `@@unique(appointmentId, position)`. **Não guarda preço.**
- **AppointmentStatus**: AGENDADO, CONFIRMADO, CONCLUIDO, CANCELADO, FALTOU (:773-781). Transições em [calculations.ts:12-18](../src/lib/agenda/calculations.ts#L12). FALTOU exige `startAt` no passado (:42).

### 2.3 Fluxos financeiros reaproveitáveis

- **`completeAppointment`** ([agenda/mutations.ts:278-361](../src/lib/agenda/mutations.ts#L278)):
  - Muda o status para CONCLUIDO com atualização condicional (AGENDADO/CONFIRMADO).
  - Chama `createSale(tx)` com `clientRequestId = "agenda:<id>"` e `saleDate` = dia de Tóquio do `startAt` ([calculations.ts:97](../src/lib/agenda/calculations.ts#L97)).
  - Grava o `saleId`. Usa `throw` para abortar a transação toda.
- **`createSale`** ([sales/mutations.ts:185](../src/lib/sales/mutations.ts#L185)):
  - **Devolve a venda existente** quando o `clientRequestId` se repete (:118-119).
  - `generateSaleBills` (:53-94): uma Bill por parcela; à vista (1 parcela, `paidNow`) gera a Bill já PAID e um FinancialEntry `source: "BILL"` com `occurredAt = paidAt`.
- **`revertBillSettlement`** ([bills/mutations.ts:215-233](../src/lib/finance/bills/mutations.ts#L215)): a Bill volta a PENDING, e o **FinancialEntry é só desvinculado (`billId → null`), não apagado**. O valor continua contando no Dashboard e no Caixa. Roda na transação global (não aceita `tx`).
- **`cancelSale`** ([sales/mutations.ts:383-401](../src/lib/sales/mutations.ts#L383)): recusa se houver Bill PAID. Cancela as Bills PENDING e a Sale.
- **`settleBill`** ([bills/mutations.ts:150](../src/lib/finance/bills/mutations.ts#L150)): é quem cria o FinancialEntry de uma parcela a prazo recebida.
- **Formas de pagamento existentes:**
  - **Condição** (no modal de conclusão): "À vista" ou "A prazo", com N parcelas, cada uma com data e valor ([CompleteAppointmentDialog.tsx:63-134](../src/components/agenda/CompleteAppointmentDialog.tsx#L63)). A soma das parcelas tem de bater com o total.
  - **Meio**: `PAYMENT_METHOD_OPTIONS` = Dinheiro, Transferência, Cartão, Boleto, Outro ([bills/options.ts:31-37](../src/lib/finance/bills/options.ts#L31), reexportado em [sales/options.ts:7](../src/lib/sales/options.ts#L7)).
  - **Regras no servidor**: no máximo uma parcela `paidNow`, e só quando há uma única parcela ([agenda/schema.ts:252-287](../src/lib/agenda/schema.ts#L252)).

### 2.4 UI da Agenda

- **Abas** ([agenda/page.tsx](../src/app/(app)/agenda/page.tsx)):
  - Calendário: grade do mês e painel do dia selecionado.
  - Dia: lista com navegação Anterior/Hoje/Próximo.
  - Mês: navegação, `MonthSummary` e lista agrupada por dia.
- **Ações**: as três abas usam o mesmo `AppointmentRow` ([AppointmentList.tsx:34-78](../src/components/agenda/AppointmentList.tsx#L34)), que mostra "HH:MM–HH:MM" (:50) e as ações de [AppointmentActions.tsx](../src/components/agenda/AppointmentActions.tsx): Confirmar, Concluir, Faltou, Cancelar, Reabrir, ver venda e agendar o próximo.

---

## 3. Desenho do FUSO

### 3.1 Campos na Business

```prisma
model Business {
  // …
  country  String @default("JP")         @map("country")   // ISO 3166-1 alfa-2
  timezone String @default("Asia/Tokyo") @map("timezone")  // IANA
}
```

- **Migração** `business_timezone`: adiciona as duas colunas com default. É só aditiva, e as linhas existentes ficam com "JP" / "Asia/Tokyo" automaticamente, sem UPDATE separado.
- **Rollback**: `ALTER TABLE businesses DROP COLUMN timezone, DROP COLUMN country`.
- **Onboarding**: novas empresas também recebem o default. Perguntar no onboarding é a Decisão pendente 1.

### 3.2 API do utilitário único — `src/lib/time/zoned.ts`

Ideia central: toda "data de negócio" vira uma **`DateKey`** (`"YYYY-MM-DD"`, data de calendário sem fuso). "Instantes" (`Date`) só existem para `createdAt`, sessões e limites de consulta em colunas timestamp.

```ts
export type TimeZone = string;          // IANA, validado
export type DateKey = string;           // "YYYY-MM-DD"
export type DateRange = { start: Date; end: Date }; // [start, end) em instantes

// Relógio da empresa: único jeito de obter "agora"/"hoje" no servidor.
export type BusinessClock = { timeZone: TimeZone; now: Date };
export function clockFor(business: { timezone: string }, now = new Date()): BusinessClock;

// Instante -> calendário no fuso
export function toDateKey(instant: Date, tz: TimeZone): DateKey;
export function zonedParts(instant: Date, tz: TimeZone): { year; month; day; hour; minute; second; weekday };
export function todayKey(clock: BusinessClock): DateKey;

// Calendário -> instante (seguro para DST: resolve o offset iterando 2x via Intl)
export function startOfDayInstant(key: DateKey, tz: TimeZone): Date;
export function dayRange(key: DateKey, tz: TimeZone): DateRange;
export function monthRange(year: number, month: number /*1-12*/, tz: TimeZone): DateRange;
export function weekRange(key: DateKey, tz: TimeZone, weekStartsOn: 0 | 1 = 1): DateRange;

// Aritmética pura de calendário (não depende de fuso)
export function addDays(key: DateKey, n: number): DateKey;
export function addMonthsClamped(key: DateKey, n: number): DateKey;   // 31/01 + 1 = 28/02
export function weekdayOf(key: DateKey): 0|1|2|3|4|5|6;
export function lastDayOfMonth(year: number, month: number): number;
export function compareKeys(a: DateKey, b: DateKey): -1 | 0 | 1;
export function isDateKey(value: string): value is DateKey;

// Ponte com colunas @db.Date (Prisma devolve Date à 00:00 UTC)
export function dateKeyToDbDate(key: DateKey): Date;   // new Date(`${key}T00:00:00.000Z`)
export function dbDateToKey(d: Date): DateKey;         // d.toISOString().slice(0, 10)

// Formatação
export function formatDateKey(key: DateKey, style?: "short" | "long"): string;     // sem fuso
export function formatInstant(instant: Date, tz: TimeZone, opts: Intl.DateTimeFormatOptions): string;

// Validação
export function isValidTimeZone(tz: string): boolean; // try { new Intl.DateTimeFormat("en", { timeZone: tz }) }
```

**Exemplos:**
- `todayKey({ timeZone: "Asia/Tokyo", now: new Date("2026-10-22T16:30:00Z") })` → `"2026-10-23"`.
- `startOfDayInstant("2026-10-23", "Asia/Tokyo")` → `2026-10-22T15:00:00.000Z`.
- `startOfDayInstant("2026-11-01", "America/New_York")` → `2026-11-01T04:00:00.000Z` (antes do fim do horário de verão).

**Como o fuso chega a cada lugar:**
- **Server components**: `requireOnboardedUser()` ([guards.ts:10-25](../src/lib/auth/guards.ts#L10)) já devolve `business`; a página faz `const clock = clockFor(business)`.
- **Rotas de API**: já carregam `business` (ex.: [api/agenda/route.ts](../src/app/api/agenda/route.ts)). Passam `clock` ou `business.timezone` para a mutation.
- **Mutations e queries**: recebem `clock: BusinessClock` (ou `timeZone` + `now` opcional) como parâmetro, e **nunca** chamam `new Date()` para decidir um dia. Isso reaproveita o padrão de relógio injetável que já existe ([calculations.ts:24-27](../src/lib/agenda/calculations.ts#L24), `now` em [bills/status.ts:33](../src/lib/finance/bills/status.ts#L33)).
- **Client components**: nunca calculam "hoje". Recebem `todayKey` como prop do servidor e `formatDateKey` para exibir.
- **`src/lib/agenda/time.ts`**: vira um wrapper fino (`tokyo*` → `*(…, tz)`) durante a transição, e depois é removido.
- **Guarda estática**: [noLocalTimeUsage.test.ts](../tests/unit/agenda/noLocalTimeUsage.test.ts) é estendida para `src/lib/**`, `src/app/**` e `src/components/**`. Proíbe `getHours/getDate/getDay/getMonth/getFullYear/setDate/setHours/setMonth/toLocaleDateString` e `new Date(y, m, d)`. A exceção explícita é `src/lib/time/zoned.ts`.

### 3.3 Pontos que migram para o utilitário

Todos os itens da tabela 2.1 (exceto `agenda/time.ts`, que vira o próprio utilitário). Por grupo:

1. **Períodos e dashboard**: [period.ts](../src/lib/finance/period.ts) (`resolvePeriodRange`, `startOfDay`, `addDays`, meses e "mesmo período do ano passado"), [finance/queries.ts:72-139](../src/lib/finance/queries.ts#L72), [dashboardService.ts](../src/lib/finance/dashboardService.ts) e [insights/snapshot.ts:26-52](../src/lib/insights/snapshot.ts#L26).
2. **Recorrentes**: [recurring/occurrences.ts](../src/lib/finance/recurring/occurrences.ts) (passa a operar só em `DateKey`), [recurring/materialize.ts:22](../src/lib/finance/recurring/materialize.ts#L22), [bills/occurrences.ts:70-71](../src/lib/finance/bills/occurrences.ts#L70) e [bills/materialize.ts:16-29](../src/lib/finance/bills/materialize.ts#L16).
3. **Vencimento**: [bills/status.ts:37](../src/lib/finance/bills/status.ts#L37), [bills/queries.ts](../src/lib/finance/bills/queries.ts) (:10, :24, :154, :187, :240-252), [BillListPage.tsx:62](../src/app/(app)/financeiro/_shared/BillListPage.tsx#L62), [sales/calculations.ts:74-88](../src/lib/sales/calculations.ts#L74), [sales/queries.ts:132-141](../src/lib/sales/queries.ts#L132) e [clients/queries.ts:188-197](../src/lib/clients/queries.ts#L188).
4. **Caixa**: [cash/queries.ts:95-107](../src/lib/finance/cash/queries.ts#L95).
5. **Importação**: [duplicates.ts:5-27](../src/lib/finance/duplicates.ts#L5), [importParsing.ts:125](../src/lib/finance/importParsing.ts#L125) e [importValidation.ts:54](../src/lib/finance/importValidation.ts#L54).
6. **Entrada das APIs**: todas as linhas `new Date(parsed.data.*)` da tabela 2.1 viram `dateKeyToDbDate(key)` (com 3.5 (i)). O default de `settle` vira `todayKey(clock)`.
7. **"Hoje" no cliente**: os 6 componentes da tabela 2.1 recebem `todayKey` por prop.
8. **Exibição**: as 13 ocorrências de `toLocaleDateString`/getters em páginas viram `formatDateKey` (colunas de data) ou `formatInstant(…, tz)` (timestamps).
9. **Agenda**: [time.ts](../src/lib/agenda/time.ts), [calendar.ts](../src/lib/agenda/calendar.ts), [calculations.ts:97](../src/lib/agenda/calculations.ts#L97), [agenda/page.tsx](../src/app/(app)/agenda/page.tsx) (`todayKey`, ranges), [api/agenda/route.ts](../src/app/api/agenda/route.ts) (`todayRangeTokyo`, `weekRangeTokyo`, `parseTokyoDateTimeInput`) e [api/agenda/[id]/route.ts:33](../src/app/api/agenda/[id]/route.ts#L33).

### 3.4 Nova chave de idempotência dos recorrentes

- **Representação**: coluna `occurrenceDate DateTime? @db.Date @map("occurrence_date")` em `FinancialEntry` e em `Bill`. É preenchida apenas nas linhas geradas por molde.
  - `FinancialEntry`: `@@unique([recurringEntryId, occurrenceDate])` no lugar de `@@unique([recurringEntryId, occurredAt])`.
  - `Bill`: `@@unique([recurringBillId, occurrenceDate])` no lugar de `@@unique([recurringBillId, dueDate])`.
  - O Postgres trata NULLs como distintos, então linhas manuais (NULL) não colidem.
- **Por que uma coluna própria**: mesmo que `occurredAt`/`dueDate` virem `@db.Date` (3.5), a ocorrência é uma identidade do **molde** ("a parcela de 20/10"). Se um dia o usuário puder editar a data de um lançamento gerado, a identidade não pode mudar junto. Isso evita regenerar o original.
- **Migração `recurring_occurrence_date`** (em 4 passos, na mesma migração):
  1. `ALTER TABLE financial_entries ADD COLUMN occurrence_date date;` (idem `bills`).
  2. Backfill: `UPDATE financial_entries fe SET occurrence_date = (fe.occurred_at AT TIME ZONE 'UTC' AT TIME ZONE b.timezone)::date FROM businesses b WHERE b.id = fe.business_id AND fe.recurring_entry_id IS NOT NULL;` (idem bills com `due_date`).
  3. Pré-checagem dentro da migração: se existir grupo `(recurring_entry_id, occurrence_date)` com mais de uma linha, a migração **aborta** (`DO $$ … RAISE EXCEPTION … $$`). **Pré-requisito: remover as 5 duplicatas da Fase 0 (B).**
  4. `CREATE UNIQUE INDEX … (recurring_entry_id, occurrence_date)`; `DROP INDEX financial_entries_recurring_entry_id_occurred_at_key` (idem bills).
- **Materialização**: `generateOccurrences` passa a devolver `DateKey[]`; `createMany({ skipDuplicates })` com `occurrenceDate: dateKeyToDbDate(key)`.
- **Rollback**: recriar o índice antigo (vai funcionar, porque a unicidade nova é mais forte) e dropar a coluna.

### 3.5 Troca de fuso com dados existentes

O que acontece hoje se `timezone` mudar de Asia/Tokyo para America/Sao_Paulo, mantendo timestamps:
- **Lançamentos manuais (00:00 UTC)**: passam a cair no dia **anterior** (21:00 do dia anterior em SP).
- **Recorrentes (15:00 UTC)**: continuam no mesmo dia (12:00 em SP).
- **Vendas**: `saleDate` 00:00 UTC também volta um dia.
- **Agendamentos legados**: 10:00 JST vira 22:00 do dia anterior em SP.
- **Efeito geral**: totais mensais mudam retroativamente, vencidos mudam e a materialização pode gerar ocorrências "novas" para dias que mudaram de chave. Este último ponto só é mitigado pela 3.4.

| Opção | Migração | Risco | Comportamento na troca |
|---|---|---|---|
| **(i) Datas financeiras como data de calendário (`@db.Date`)** | Grande: converter `occurredAt`, `dueDate`, `issueDate`, `paidAt`, `saleDate`, `startDate/endDate` (2 moldes), `openingBalanceDate` e `Appointment.date`. Backfill `(col AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo')::date`, correto para as duas representações atuais, porque todos os dados existentes nasceram com o host em JST. | Médio (muitos arquivos), mas mecânico e testável. Cada coluna é uma migração separada com teste de igualdade antes/depois. | "20/10" continua "20/10". Só "hoje" (e portanto vencidos e conclusão automática) passa a seguir o novo fuso. |
| (ii) Manter timestamps e aceitar o deslocamento com aviso | Nenhuma | Alto: relatórios fechados mudam, e o usuário não entende por quê | Desloca até 1 dia para frente ou para trás |
| (iii) Restringir a troca (só sem dados, ou com confirmação) | Nenhuma | Baixo para os dados, alto para o produto: o requisito A2 vira letra morta para quem já usa o sistema | Bloqueado |

**Recomendação: (i)**, com uma confirmação leve na tela ("datas já registradas não mudam; 'hoje' e os vencimentos passam a seguir o novo fuso"). A (iii) fica como trava temporária: enquanto as colunas de (i) não estiverem convertidas (Etapas F6a–F6c), a API recusa a troca de fuso, seguindo o padrão da troca de moeda ([businessMutations.ts:37](../src/lib/onboarding/businessMutations.ts#L37)).

Cada coluna convertida tem rollback próprio: `ALTER COLUMN … TYPE timestamp(3) USING (col::timestamp)`, que volta a meia-noite UTC. Sem perda de dia, embora a hora original de entradas não-UTC não volte (isso só importa para `paidAt` com instante; ver Decisão pendente 4).

### 3.6 Tela de Configurações (País → Fuso)

**Fonte dos dados:**

| Opção | Dependência | Tamanho | Manutenção |
|---|---|---|---|
| `Intl.supportedValuesOf("timeZone")` sozinho | nenhuma | 0 | Não tem o mapeamento país→fuso, então não atende A2 |
| Biblioteca (ex.: `countries-and-timezones`) | +1 pacote | dezenas de KB | Atualiza com o pacote; conferir licença e versão (regra das 2 semanas) |
| **Tabela própria** `src/lib/time/countryZones.json` gerada uma vez do `zone1970.tab`/`zone.tab` da IANA | nenhuma | ~15 KB | Script de regeneração versionado; muda raramente |

**Recomendação: tabela própria.**
- Nomes de país via `new Intl.DisplayNames(["pt-BR"], { type: "region" })` (sem dados extras).
- Rótulo do fuso = cidade do id IANA (ex.: `America/Sao_Paulo` → "Sao Paulo") mais o offset atual via `Intl.DateTimeFormat(…, { timeZoneName: "shortOffset" })`, por exemplo "Sao Paulo (GMT−3)".
- Um teste unitário garante que todo fuso da tabela está em `Intl.supportedValuesOf("timeZone")` do runtime.

**Comportamento:**
- País com um fuso (JP, PT continental…): o fuso é definido automaticamente, sem segundo select.
- País com vários fusos (BR, US…): aparece o segundo select. O default é o fuso mais populoso, pela primeira linha do `zone1970.tab` para o país, ou o atual se ele pertencer ao país.

**Validação no servidor (Zod):**

```ts
z.object({
  country: z.string().regex(/^[A-Z]{2}$/).refine(c => c in COUNTRY_ZONES),
  timezone: z.string().refine(isValidTimeZone),
}).refine(d => COUNTRY_ZONES[d.country].includes(d.timezone), { path: ["timezone"] })
```

**Lugar na tela**: seção "Empresa" de Configurações ([EmpresaSection.tsx](../src/app/(app)/configuracoes/EmpresaSection.tsx) / [EmpresaForm.tsx](../src/app/(app)/configuracoes/EmpresaForm.tsx)), junto de moeda e saldo inicial. Mesmos padrões visuais: cantos retos e select de altura fixa.

---

## 4. Desenho da AGENDA

### 4.1 Modelo de dados (todas as migrações não destrutivas)

```prisma
enum AppointmentFlow { LEGACY  DATE_ONLY  @@map("appointment_flow") }
enum PaymentTiming   { AVISTA  APRAZO     @@map("payment_timing") }

model Appointment {
  // novos
  flow        AppointmentFlow @default(LEGACY)
  date        DateTime        @db.Date            // TODOS os agendamentos (backfill do legado)
  categoryId  String?         @map("category_id") // obrigatório no app para DATE_ONLY
  paymentTiming PaymentTiming? @map("payment_timing")
  paymentMethod String?       @map("payment_method") // PAYMENT_METHOD_OPTIONS
  autoCompleteDisabledAt DateTime? @map("auto_complete_disabled_at")
  completionSeq Int @default(0) @map("completion_seq")
  installments AppointmentInstallment[]
  // alterados
  startAt DateTime? // era NOT NULL; legado continua preenchendo
  endAt   DateTime? // idem
  @@index([businessId, date])
  @@index([businessId, flow, status, date])
}

model AppointmentService {
  durationMinutesSnapshot Int?                       // era NOT NULL
  unitPrice Decimal? @db.Decimal(14, 2) @map("unit_price") // snapshot editável (DATE_ONLY)
  quantity  Int      @default(1)
}

model AppointmentInstallment {
  id            String   @id @default(uuid())
  appointmentId String   @map("appointment_id")
  position      Int
  dueDate       DateTime @db.Date @map("due_date")
  amount        Decimal  @db.Decimal(14, 2)
  @@unique([appointmentId, position])
}
```

- **Data sem horário: campo `date @db.Date`** dedicado, e não `startAt` à meia-noite local. Assim a troca de fuso não move o dia (coerente com 3.5 (i)).
  - O backfill vale para **todas** as linhas: `date = (start_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo')::date`.
  - Listagens, agrupamento por dia e ranges passam a usar só `date` nos dois fluxos (um único caminho). `startAt` fica só para exibir a hora do legado e ordenar dentro do dia.
- **`endAt` e `durationMinutesSnapshot`**: viram nullable (DROP NOT NULL, não destrutivo). O fluxo novo grava `null`. O legado continua calculando `endAt` como hoje.
- **Marca do fluxo novo**: `flow = DATE_ONLY`. Todo agendamento existente fica `LEGACY` pelo default.
- **Valor**: `AppointmentService.unitPrice × quantity`. O total do agendamento é sempre derivado, nunca armazenado (mesma regra de "o backend recalcula", [agenda/schema.ts:246-251](../src/lib/agenda/schema.ts#L246)).
- **Pagamento**:
  - `paymentTiming` + `paymentMethod`, com as mesmas opções do sistema.
  - Parcelas em `AppointmentInstallment`: à vista = 1 linha com `dueDate = date`; a prazo = N linhas.
  - As mesmas regras de validação do `appointmentCompleteSchema` ([agenda/schema.ts:252-287](../src/lib/agenda/schema.ts#L252)), aplicadas na criação: soma = total, inteiro para JPY, `dueDate ≥ date`.
- **Categoria de receita**: escolhida **na criação**, com default = última categoria usada ([getLastUsedCompletionCategoryId, agenda/queries.ts:70](../src/lib/agenda/queries.ts#L70)) e, na falta dela, a primeira categoria REVENUE visível. Obrigatória para DATE_ONLY: a conclusão automática não tem modal onde perguntar.
- **`completionSeq`**: o `clientRequestId` vira `agenda:<id>` quando `completionSeq = 0` (igual ao de hoje, mantendo compatibilidade) e `agenda:<id>:<seq>` depois de um Desfazer. Sem isso, uma reconclusão manual devolveria a venda **cancelada** (`createSale` faz replay pelo `clientRequestId`, [sales/mutations.ts:118](../src/lib/sales/mutations.ts#L118)).
- **Migrações**:
  - `agenda_date_flow`: enum, colunas e backfill de `date`; `ALTER … SET NOT NULL` em `date` depois do backfill; índices.
  - `agenda_payment`: colunas de pagamento, `unit_price`, `quantity` e a tabela de parcelas.
  - `agenda_nullable_time`: DROP NOT NULL de `start_at`, `end_at` e `duration_minutes_snapshot`.
  - **Rollback**: todas são aditivas ou relaxam constraints. Reverter = dropar colunas e tabela; o SET NOT NULL só é possível enquanto não houver linhas DATE_ONLY.

### 4.2 Serviços e valor

- **Vários serviços por atendimento**: o formato de hoje continua.
- **Preço**: cada serviço entra com `unitPrice` pré-preenchido de `Product.defaultPrice` e é editável na linha. O preço editado vale só para o agendamento (snapshot), não altera o Product.
- **Criação rápida de serviço no fluxo novo**: só Nome e Preço (opcional), **sem duração**.
  - [products/schema.ts:38-41](../src/lib/products/schema.ts#L38) passa a exigir duração somente quando a criação vem do fluxo legado. Recomendação: deixar de exigir em qualquer caso, porque o legado só lê a duração do que já existe.
  - [agenda/mutations.ts:55-58](../src/lib/agenda/mutations.ts#L55), que recusa serviço sem duração, continua valendo só para LEGACY. Os 75 serviços existentes já têm duração.
- **Itens da venda na conclusão**: `{ productId, description: nameSnapshot, quantity, unitPrice }`, lidos do agendamento e não mais de `defaultPrice` no momento da conclusão (como faz hoje [agenda/page.tsx:66-71](../src/app/(app)/agenda/page.tsx#L66)).

### 4.3 Máquina de estados

**DATE_ONLY (nova):**

| De → Para | Como | Condição |
|---|---|---|
| AGENDADO → CONCLUIDO | automática ou "Concluir agora" | automática: `date < hoje(tz)` e `autoCompleteDisabledAt IS NULL`; manual: qualquer data `≤ hoje` |
| AGENDADO → CANCELADO | manual | — |
| AGENDADO → FALTOU | manual | `date ≤ hoje(tz)` |
| CONCLUIDO → CANCELADO / FALTOU | **Desfazer** (com estorno) | sempre; grava `autoCompleteDisabledAt = now` |
| CANCELADO / FALTOU → AGENDADO | Reabrir | só se `date ≥ hoje(tz)`. Data passada: o diálogo pede uma nova data (≥ hoje) **ou** oferece "Concluir agora" (manual, explícito) |

- **Sem CONFIRMADO** no fluxo novo (Decisão pendente 6).
- **Proteção contra reconclusão**: depois de um Desfazer, `autoCompleteDisabledAt` fica preenchido para sempre e a seleção automática exige `IS NULL`. Mesmo que o atendimento seja reaberto e a data passe, ele só é concluído **manualmente**.

**LEGACY**: a tabela de transições atual continua intacta ([calculations.ts:12-18](../src/lib/agenda/calculations.ts#L12)), mais o **Desfazer** (CONCLUIDO → CANCELADO/FALTOU), porque B6 vale para qualquer atendimento concluído (Decisão pendente 7). A conclusão automática **nunca** seleciona LEGACY.

A implementação continua sendo uma tabela explícita por fluxo: `TRANSITIONS[flow][from]`, testada exaustivamente como hoje.

### 4.4 Conclusão automática

- **Função**: `autoCompleteDueAppointments(business, clock, opts?: { limit?: number })` em `src/lib/agenda/autoComplete.ts`.
- **Seleção**: `where: { businessId, flow: "DATE_ONLY", status: "AGENDADO", autoCompleteDisabledAt: null, date: { lt: dateKeyToDbDate(todayKey(clock)) } }`, `orderBy: [{ date: "asc" }, { createdAt: "asc" }]`, `take: limit` (default 50). Usa o índice `(businessId, flow, status, date)`.
- **Execução**:
  - Para cada atendimento, `completeAppointmentInTx(tx, …)`: refatoração de [completeAppointment](../src/lib/agenda/mutations.ts#L278) em núcleo `tx` mais casca, com os dados de pagamento **lidos do próprio agendamento**.
  - **Uma transação por atendimento**: falhar um não desfaz os outros.
  - Usuário da venda e dos lançamentos = `business.userId` (o dono).
- **Idempotência**: as mesmas três camadas de hoje.
  1. Atualização condicional AGENDADO → CONCLUIDO; `count = 0` → pula.
  2. `clientRequestId` `agenda:<id>[:<seq>]` com `@@unique([businessId, clientRequestId])`.
  3. `saleId @unique`.
  - Chamadas concorrentes (duas abas): uma vence o status; a outra recebe `count = 0` e pula sem erro.
- **Datas**: `saleDate = date`; a parcela à vista tem `dueDate = paidAt = date`, então o FinancialEntry tem `occurredAt = date`. Parcelas a prazo mantêm o `dueDate` gravado. Substitui [resolveSaleDateFromAppointment](../src/lib/agenda/calculations.ts#L97).
- **Muitas pendências**:
  - O limite de 50 por chamada evita travar a página.
  - Se sobrar, a próxima carga continua.
  - A página da Agenda mostra um aviso "N atendimentos ainda sendo concluídos" quando `remaining > 0`.
  - Um lote único maior (`limit: 500`) só roda na rota interna de recuperação, se um dia for necessária.
- **Onde é chamada**: num único ponto de sincronização, `syncBusinessState(business, clock)`, que roda em sequência `materializeRecurringEntries`, `materializeRecurringBills` e `autoCompleteDueAppointments`. Substitui as chamadas soltas de hoje:
  - [dashboard/page.tsx:55-56](../src/app/(app)/dashboard/page.tsx#L55)
  - [caixa/page.tsx:25-26](../src/app/(app)/caixa/page.tsx#L25)
  - [TransactionListPage.tsx:55](../src/app/(app)/financeiro/_shared/TransactionListPage.tsx#L55)
  - [BillListPage.tsx:59](../src/app/(app)/financeiro/_shared/BillListPage.tsx#L59)
  - mais `agenda/page.tsx`, `vendas/page.tsx`, `vendas/[id]`, `clientes/[id]` e `GET /api/insights`.

### 4.5 Desfazer (estorno atômico)

- **Função**: `undoAppointmentCompletion(businessId, appointmentId, to: "CANCELADO" | "FALTOU", clock)`, numa **única** transação.
  1. Lê o agendamento (`status`, `saleId`, `completionSeq`). Se o status já for CANCELADO/FALTOU e houver `autoCompleteDisabledAt`, devolve `{ ok: true, alreadyUndone: true }` (idempotente). Se não for CONCLUIDO, devolve erro.
  2. Atualização condicional: `where { id, businessId, status: "CONCLUIDO", saleId }` → `{ status: to, saleId: null, cancelledAt: now, autoCompleteDisabledAt: now, completionSeq: { increment: 1 } }`. `count = 0` → `throw` (outra requisição mexeu antes).
  3. Para cada Bill da venda:
     - PAID: **apaga** o FinancialEntry vinculado (`deleteMany where billId`) e marca a Bill como CANCELLED (`paidAt` preservado para auditoria).
     - PENDING: CANCELLED.
  4. Sale → CANCELLED.
  5. Qualquer erro → `throw` → rollback total (mesma disciplina de [mutations.ts:272-277](../src/lib/agenda/mutations.ts#L272)).
- **Por que não reaproveitar `revertBillSettlement` e `cancelSale`**:
  - `revertBillSettlement` só desvincula o FinancialEntry ([bills/mutations.ts:225](../src/lib/finance/bills/mutations.ts#L225)); o dinheiro continuaria no Dashboard e no Caixa.
  - Nenhuma das duas aceita `tx`.
  - `cancelSale` recusa Bills PAID.
  - A operação composta é nova, mas segue as mesmas regras.
- **Parcelas a prazo parcialmente recebidas**: todas as recebidas são estornadas juntas, com os FinancialEntry apagados. O diálogo lista antes quanto será estornado (ex.: "2 de 3 parcelas já recebidas — ¥30.000 serão estornados do Caixa").
- **Proteção contra reconclusão**: `autoCompleteDisabledAt` mais `completionSeq` (4.1 e 4.3).
- **Venda cancelada**: continua visível em Vendas como "Cancelada", com a nota "estornada pela Agenda". Guardar `Sale.appointmentId` como histórico é a Decisão pendente 8.

### 4.6 UI

**Formulário novo** (`/agenda/novo` para todo agendamento novo; `/agenda/[id]/editar` usa o formulário do fluxo do registro):
1. **Cliente**: igual ao de hoje (busca + criar rápido).
2. **Data**: `<input type="date">`, default = `todayKey` do servidor. A data via atalho do calendário (`?date=`) continua funcionando, sem hora.
3. **Serviços**: linhas com nome, quantidade e preço editável (MoneyInput); "+ Criar novo serviço" com Nome e Preço (opcional).
4. **Total**: calculado (exibição apenas).
5. **Categoria de receita**: select com o default de 4.1.
6. **Pagamento**: "À vista" (meio de pagamento opcional) | "A prazo" (nº de parcelas, data e valor por parcela, meio opcional). É o mesmo componente do [CompleteAppointmentDialog](../src/components/agenda/CompleteAppointmentDialog.tsx), extraído para reuso.
7. **Observação** (opcional).
8. **Botão primário "Agendar"**.

- **Validações**: as mesmas do servidor (cliente, ≥ 1 serviço, data válida, total > 0 ou explicitamente 0, soma das parcelas = total, JPY inteiro).
- **Erros**: por campo, com `role="alert"`. Corrige a mensagem silenciosa atual em [AppointmentForm.tsx:130](../src/components/agenda/AppointmentForm.tsx#L130).

**Listas:**
- **Sem horário no DATE_ONLY**. A linha mostra cliente, serviços, valor total, forma de pagamento e badge de status.
- **Legado** continua mostrando "HH:MM–HH:MM".
- **Ordenação estável**: `date ASC, startAt ASC NULLS LAST, createdAt ASC, id ASC`.

**Ações por status (DATE_ONLY):**
- AGENDADO: "Concluir agora" (se `date ≤ hoje`), "Faltou" (se `date ≤ hoje`), "Cancelar" e "Editar".
- CONCLUIDO: "Ver venda #N" e "Desfazer…" (escolha Cancelado/Faltou).
- CANCELADO/FALTOU: "Reabrir" (com a regra da 4.3).

**B7 — onde ficam Cancelar/Faltou/Desfazer: recomendação de mostrar nas três abas.**
- As três já usam o mesmo `AppointmentRow`.
- Esconder em Calendário/Dia exigiria uma prop de "modo" e criaria divergência: o usuário que concluiu por engano no painel do dia teria de trocar de aba para desfazer.
- A aba Mês continua sendo onde se vê tudo; as ações aparecem onde o atendimento aparece.

**Textos de confirmação:**
- **Cancelar** (AGENDADO): "Cancelar este agendamento? Nenhum valor foi lançado."
- **Desfazer** (CONCLUIDO, à vista): "Desfazer a conclusão? A venda #1043 será cancelada e ¥8.000 serão retirados do faturamento e do Caixa de 20/10/2026. Este atendimento não será concluído automaticamente de novo."
- **Desfazer** (a prazo, com parcelas recebidas): lista quantas parcelas foram recebidas e o valor estornado.

**Convenções**: cantos retos; paleta de status reservada (o badge Cancelado tracejado continua); ícones `lucide-react` (`Undo2` em Desfazer, `CalendarDays` na data); o botão "Novo agendamento" continua no modelo de contorno de [CreateButton.tsx](../src/components/CreateButton.tsx).

### 4.7 Removido do fluxo novo × mantido no legado

| Item | DATE_ONLY | LEGACY |
|---|---|---|
| Horário de início / `datetime-local` | removido | mantido |
| Duração (agendamento e criação rápida) | removida | mantida (só leitura dos serviços existentes) |
| `endAt` e "Fim previsto" | removidos | mantidos |
| Detecção de conflito ([calculations.ts:72-82](../src/lib/agenda/calculations.ts#L72)) | removida | mantida |
| Hora padrão 09:00 ([novo/page.tsx:12](../src/app/(app)/agenda/novo/page.tsx#L12)) | removida | não se aplica (o legado não cria mais) |
| CONFIRMADO | removido | mantido |
| Modal de conclusão com pagamento | substituído pelo pagamento na criação + "Concluir agora" | mantido |
| Conclusão automática | sim | nunca |
| Desfazer | sim | sim (Decisão pendente 7) |

**Fim da criação no legado**: depois da Etapa A3, nenhum agendamento novo é LEGACY. O legado só é editado ou concluído enquanto existir.

---

## 5. Impacto em outras áreas

| Área | Lê | Impacto |
|---|---|---|
| Dashboard | FinancialEntry ([finance/queries.ts](../src/lib/finance/queries.ts), [dashboardService.ts](../src/lib/finance/dashboardService.ts)) + Bill (previsão, [BillsForecastPanel](../src/components/dashboard/BillsForecastPanel.tsx)) | Períodos por fuso (F3). A conclusão automática à vista entra no Faturamento no dia do atendimento. O Desfazer retira. |
| Caixa | FinancialEntry + Business ([cash/queries.ts](../src/lib/finance/cash/queries.ts)) | Igual ao Dashboard. O estorno apaga o FinancialEntry, e o saldo acumulado recua. |
| Insights | FinancialEntry + Business ([insights](../src/lib/insights)) | O fingerprint (`count + max(updatedAt)`) muda com a conclusão e o estorno, e o cache se invalida sozinho. Períodos por fuso (F3). |
| Assistente | [AssistantPanel](../src/components/dashboard/AssistantPanel.tsx) não consulta dados (só ícone/texto) | Nenhum. |
| Vendas | Sale, Bill, SaleItem ([sales/queries.ts](../src/lib/sales/queries.ts)) | As vendas automáticas aparecem como CONFIRMED (paga, se à vista). O Desfazer gera vendas CANCELLED. "Atrasado" por fuso (F3). |
| Clientes | Sale, Bill, Client ([clients/queries.ts](../src/lib/clients/queries.ts)) + histórico de agendamentos | O histórico mostra "às HH:MM" ([clientes/[id]/page.tsx:189](../src/app/(app)/clientes/[id]/page.tsx#L189)): no DATE_ONLY mostra só a data. |
| Contas a receber | Bill | Parcelas a prazo das vendas automáticas aparecem como hoje. As estornadas ficam CANCELLED. |
| Importação | FinancialEntry | Duplicata por dia de calendário (F3). |

---

## 6. Plano de implementação em etapas

Cada etapa compila, passa lint e as duas suítes, e pode ser commitada sozinha. Toda migração tem rollback descrito e roda primeiro em `app_db_test` (`npm run test:db:prepare`) e só depois em `app_db`, com backup `pg_dump` antes.

**F0 — Fechar a Fase 0** (pré-requisito)
- **Objetivo**: commitar o isolamento de testes; remover as 5 duplicatas (backup já existe).
- **Arquivos**: os da Fase 0.
- **Migração**: nenhuma (DELETE transacional por id).
- **Pronto quando**: Playwright verde em 3100; 0 grupos duplicados; contagens do `app_db` inalteradas pela suíte.
- **Risco**: baixo.

**F1 — Utilitário único de datas**
- **Objetivo**: `src/lib/time/zoned.ts` (API da 3.2), seguro para DST; `agenda/time.ts` passa a delegar para ele com `"Asia/Tokyo"` fixo.
- **Migração**: nenhuma.
- **Testes**: unit para Tokyo, UTC, America/New_York, America/Sao_Paulo, Europe/Lisbon e Australia/Lord_Howe (DST de 30 min); dias de mudança de DST; 29/02; virada de ano. Todos os testes da agenda continuam verdes.
- **Pronto quando**: nenhum comportamento muda.
- **Risco**: baixo.

**F2 — `Business.country` / `Business.timezone`**
- **Objetivo**: colunas com default; `clockFor(business)`.
- **Migração**: `business_timezone` (aditiva).
- **Testes**: integração (default aplicado em empresa nova e existente).
- **Risco**: baixo.

**F3 — Servidor sem fuso do processo**
- **Objetivo**: migrar todo o 3.3, grupos 1–5 e 9 (períodos, dashboard, insights, vencidos, vendas, clientes, caixa, importação, agenda) para `clock`. A guarda estática é estendida a `src/lib/**`.
- **Migração**: nenhuma.
- **Testes**: matriz TZ=UTC × TZ=Asia/Tokyo em todo `tests/unit` e `tests/integration`; casos de virada de dia/mês com `now` injetado.
- **Pronto quando**: saída idêntica nos dois TZ com `timezone = Asia/Tokyo`.
- **Risco**: médio (muitos arquivos). Mitigação: dividir em F3a (period, dashboard, insights), F3b (bills, sales, clients, cash) e F3c (importação, agenda).

**F4 — Cliente e exibição sem fuso do navegador**
- **Objetivo**: `todayKey` por prop nos 6 formulários; `formatDateKey`/`formatInstant` nas 13 exibições; guarda estática estendida a `src/app` e `src/components`.
- **Testes**: E2E com o navegador em outro fuso (`timezoneId: "America/Sao_Paulo"` no Playwright) mostrando a data da empresa.
- **Risco**: baixo.

**F5 — Idempotência dos recorrentes por dia**
- **Objetivo**: `occurrence_date` + unique novo (3.4); `occurrences.ts` em `DateKey`.
- **Migração**: `recurring_occurrence_date` (com pré-checagem que aborta se houver duplicata).
- **Testes**: integração rodando a materialização em TZ=UTC e depois em TZ=Asia/Tokyo **sem** gerar duplicata (o cenário exato do incidente); concorrência (2 chamadas em paralelo).
- **Risco**: médio. Depende de F0.

**F6a / F6b / F6c — Datas financeiras como `@db.Date`** (3.5 (i))
- **F6a**: `FinancialEntry.occurredAt` + `Business.openingBalanceDate`.
- **F6b**: `Bill.dueDate/issueDate/paidAt` + `RecurringBill.startDate/endDate`.
- **F6c**: `Sale.saleDate` + `RecurringEntry.startDate/endDate`.
- **Cada uma**: migração com backfill via `AT TIME ZONE 'Asia/Tokyo'`; teste que compara, para cada empresa, os totais por dia de Tóquio antes e depois (deve ser idêntico); rotas passam a usar `dateKeyToDbDate`.
- **Risco**: médio, isolado por tabela.

**F7 — Configurações: País / Fuso**
- **Objetivo**: tabela país→fusos, UI (3.6), Zod e rota. A troca de fuso fica **habilitada só depois de F6c** e, até lá, é bloqueada na API.
- **Testes**: unit (tabela ⊂ `Intl.supportedValuesOf`), integração (Zod) e E2E (país com 1 e com vários fusos; trocar o fuso muda "hoje" e não muda datas gravadas).
- **Risco**: baixo.

**A1 — Schema da Agenda (aditivo)**
- **Objetivo**: 4.1 inteiro; listas e agrupamento passam a usar `date` nos dois fluxos (comportamento visível idêntico no legado).
- **Migrações**: `agenda_date_flow`, `agenda_payment` e `agenda_nullable_time`.
- **Testes**: integração (backfill de `date` = dia de Tóquio do `startAt` em 100% das linhas); a suíte da agenda inteira continua verde.
- **Risco**: médio.

**A2 — Núcleo transacional de conclusão**
- **Objetivo**: extrair `completeAppointmentInTx`; `clientRequestId` com `completionSeq`; o legado continua chamando pela casca atual.
- **Testes**: os existentes de [complete.test.ts](../tests/integration/agenda/complete.test.ts), mais `completionSeq`.
- **Risco**: baixo.

**A3 — Criação no fluxo novo**
- **Objetivo**: formulário novo (4.6), schema/rota de criação DATE_ONLY, criação rápida de serviço sem duração, edição por fluxo, listas sem hora para DATE_ONLY, "Concluir agora" manual.
- **Testes**: unit (validação de parcelas), integração (criação com à vista e a prazo), E2E (criar 3 atendimentos no mesmo dia, ordem estável).
- **Risco**: médio.

**A4 — Conclusão automática**
- **Objetivo**: `autoCompleteDueAppointments` + `syncBusinessState` nos pontos da 4.4.
- **Testes**: integração com `now` injetado (23:59/00:00 no fuso), concorrência (`Promise.all` de 2 chamadas → 1 venda), lote > 50, legado nunca selecionado, CANCELADO/FALTOU nunca selecionados.
- **Risco**: médio.

**A5 — Desfazer**
- **Objetivo**: `undoAppointmentCompletion` (4.5) + UI nas três abas + regra de Reabrir.
- **Testes**: integração (à vista: FinancialEntry apagado e Caixa recua; a prazo parcial; desfazer 2× é idempotente; desfazer e depois avançar o relógio não reconclui; reconclusão manual cria uma venda **nova** com `:1`), E2E (fluxo completo).
- **Risco**: médio (mexe em dinheiro).

**A6 — Limpeza**
- **Objetivo**: remover do código do fluxo novo os caminhos de conflito, "Fim previsto" e CONFIRMADO; atualizar `CLAUDE.md` (seções Agenda e fuso); remover a nota de limitação de fuso de [period.ts:2-9](../src/lib/finance/period.ts#L2).
- **Risco**: baixo.

---

## 7. Estratégia de testes

**Matriz obrigatória**: `TZ=UTC` e `TZ=Asia/Tokyo` para Vitest (unit + integração) e Playwright, em toda etapa a partir de F1.
- **Bloqueante**: só depois de a Fase 0 (A) estar commitada. Rodar a matriz contra `app_db` foi exatamente a causa do incidente; a trava `_test` já impede isso.
- Scripts sugeridos: `test:tz` (roda `vitest run` duas vezes com cada TZ, via `cross-env` ou um script node que passa `env`) e `test:e2e:tz`.
- **Observação**: hoje [agenda.spec.ts](../tests/e2e/agenda.spec.ts) falha em TZ=UTC e bills/vendas falham entre 00:00 e 09:00 JST, porque os **testes** calculam datas no fuso local ou em UTC. Corrigir isso faz parte de F3/F4: os helpers de teste passam a calcular datas com `todayKey({ timeZone: "Asia/Tokyo", now })`.

**Casos de borda (integração, com `now` injetado):**
- 23:59:59 e 00:00:00 no fuso da empresa: "hoje", vencido, conclusão automática e ocorrência de recorrente.
- 00:00–09:00 JST com servidor em UTC: o resultado tem de ser idêntico ao do servidor em JST.
- Virada de mês e de ano; 31 → 30/28/29; 29/02 em ano não bissexto (recorrente anual, [occurrences.ts:63-75](../src/lib/finance/recurring/occurrences.ts#L63)).
- DST (America/New_York, Europe/Lisbon): o dia de 23 h e o de 25 h.
- Troca de fuso: datas gravadas inalteradas; "hoje" muda; materialização sem duplicatas.
- Conclusão automática concorrente: `Promise.all([auto(), auto()])` → 1 Sale, 1 FinancialEntry.
- Desfazer duas vezes: a segunda chamada é no-op `alreadyUndone`.
- Desfazer + `now` +2 dias + auto → nada é reconcluído.

**E2E**: o relógio do servidor não é controlável no `next dev`. Os cenários de virada de dia ficam em integração. Os E2E usam datas relativas ao `todayKey` da empresa e `page.clock` só para o lado do cliente.

**Regressão do legado**: [agenda.spec.ts](../tests/e2e/agenda.spec.ts) e os testes de integração da agenda atuais continuam rodando contra agendamentos LEGACY criados via Prisma direto (sem a UI antiga de criação depois de A3).

---

## 8. Riscos e mitigações

| Risco | Mitigação | Rollback |
|---|---|---|
| **46 agendamentos AGENDADO/CONFIRMADO no passado e 34 CONCLUIDO** (`app_db` local) seriam concluídos em massa | Conclusão automática só para `flow = DATE_ONLY`; os existentes ficam LEGACY pelo default. Teste explícito garante que o legado nunca é selecionado | — |
| Backfill de `Appointment.date` ou das colunas `@db.Date` muda o dia de algum registro | Migração com consulta de verificação (totais por dia de Tóquio antes = depois); rodar antes em `app_db_test` com uma cópia restaurada do dump | `ALTER … TYPE timestamp USING col::timestamp`; dump |
| Constraint nova de recorrentes falha por duplicatas | Pré-checagem que aborta a migração; F0 remove as conhecidas | `DROP INDEX` novo, recriar o antigo |
| Estorno apaga FinancialEntry por engano | Apaga só os FinancialEntry com `billId` das Bills **daquela** Sale, numa transação condicional; confirmação explícita com o valor | Restaurar do dump (não há lixeira) |
| Primeira carga depois de dias sem acesso fica lenta | Lote de 50 por chamada + aviso | — |
| Host de produção em UTC | F3 + matriz de TZ provam a independência | — |
| `next dev` reinicia ao editar `next.config.ts` | Já observado na Fase 0; evitar mexer em `next.config.ts` com o servidor do usuário rodando, ou avisar antes | — |
| Usuário troca o fuso antes de F6c | Troca bloqueada na API até F6c | — |
| Reconclusão devolve venda cancelada | `completionSeq` no `clientRequestId` (4.1) | — |

---

## 9. Decisões pendentes

1. **Perguntar país/fuso no onboarding?**
   - Opções: (a) não, default JP/Tokyo e ajuste em Configurações; (b) novo passo no onboarding.
   - **Recomendo (a) agora e (b) quando houver usuários fora do Japão.** Não muda o onboarding atual (wizard com 6 passos testados).
2. **Fonte país→fusos.**
   - Opções: tabela própria × biblioteca.
   - **Recomendo tabela própria**: sem dependência, ~15 KB, muda raramente (3.6).
3. **Converter as datas financeiras para `@db.Date` (F6) ou manter timestamps com convenção "meia-noite UTC = data"?**
   - **Recomendo `@db.Date`.** O banco garante a semântica, e a troca de fuso fica segura (3.5).
4. **`Bill.paidAt` hoje pode ser um instante** (default `new Date()` em [settle/route.ts:37](../src/app/api/financeiro/bills/[id]/settle/route.ts#L37)).
   - Opções: virar data (recomendado, é "dia do recebimento") × manter timestamp mais `paidOn` data.
   - **Recomendo virar data.**
5. **Parcelas a prazo ao remarcar a data do atendimento.**
   - Opções: (a) deslocar todas as parcelas pelo mesmo delta; (b) manter as datas absolutas; (c) pedir ao usuário.
   - **Recomendo (a) com aviso visível** no formulário ("as parcelas foram ajustadas"), porque mantém a intenção "30 dias depois do atendimento".
6. **CONFIRMADO no fluxo novo.**
   - Opções: remover × manter como etiqueta sem efeito.
   - **Recomendo remover**: sem horário e com conclusão automática, ele não tem função; também simplifica a máquina de estados.
7. **Desfazer também para concluídos LEGACY.**
   - **Recomendo sim**: B6 fala de "atendimento já concluído"; os 34 concluídos existentes também podem ter sido "por engano". Usa o mesmo `undoAppointmentCompletion`.
8. **Rastro da venda estornada.**
   - Opções: (a) só `Sale.status = CANCELLED` e `notes`; (b) `Sale.appointmentId` (FK opcional) para o histórico.
   - **Recomendo (b)**: o vínculo se perde quando `saleId` é limpo, e o histórico do cliente deveria mostrar "concluído e desfeito".
9. **Estorno: apagar o FinancialEntry × criar lançamento negativo de estorno.**
   - **Recomendo apagar.** O FinancialEntry foi gerado pelo sistema naquela mesma conclusão; um negativo exigiria aceitar valores negativos (hoje sempre positivos) e poluiria categorias e insights.
10. **Valor zero.**
    - Opções: permitir atendimento com total 0 (cortesia) × exigir > 0.
    - **Recomendo permitir**, gerando venda sem parcelas e sem FinancialEntry. Hoje `createSale` exige ≥ 1 parcela positiva, então isso pede ajuste. Alternativa: não gerar venda quando o total é 0, e é a que recomendo por ser mais simples.
11. **Limite do lote da conclusão automática.**
    - **Recomendo 50 por chamada**, configurável por parâmetro.
12. **Sincronização no `GET /api/insights` e nas páginas de Vendas/Clientes.**
    - **Recomendo sim**, via `syncBusinessState`, para que "faturamento" seja consistente em qualquer página.

---

## 10. Fora de escopo (registrado)

- Hover com contorno nas ações de texto ("Editar / remarcar", "Trocar", "Remover"…).
- Contraste dos textos secundários (`text-gray-500` / `neutral-400`).
- Tela de gestão de serviços (listar, editar preço/nome, desativar). Hoje só existe a criação rápida.
- Unificação de Contas recorrentes × Lançamentos recorrentes (dois moldes e duas materializações).
- Isolamento da porta/banco além do que a Fase 0 já fez (ex.: banco por worker).
- Notificações ou lembretes de agendamento.

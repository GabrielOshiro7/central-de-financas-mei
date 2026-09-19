# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

A multi-step business-management system being built in stages (see `docs-etapa1-prompt.md` and
subsequent stage prompts in the conversation history for the authoritative spec of each stage).
Etapa 1 delivered auth; Etapa 2 delivered onboarding + a placeholder financial dashboard. Treat
each stage's prompt as the source of truth for scope — don't add features from a future stage
without being asked.

## Commands

```bash
npm install
cp .env.example .env          # defaults already match docker-compose.yml
docker compose up -d          # Postgres on localhost:5432
npx prisma migrate dev        # apply migrations (also runs generate implicitly on first use)
npx prisma generate           # regenerate the Prisma client after schema.prisma changes
npx next typegen              # regenerate route types (see "Typed routes" below)
npm run dev                   # http://localhost:3000

npm run lint
npx tsc --noEmit

npm run test                  # Vitest: unit + integration (needs Postgres running)
npx vitest run tests/unit/money.test.ts   # single file
npx vitest run -t "some test name"        # single test by name

npm run test:e2e              # Playwright E2E (spawns its own dev server, see below)
npx playwright test tests/e2e/onboarding.spec.ts   # single file
npx playwright show-trace test-results/<dir>/trace.zip   # inspect a failed run
```

Prisma Studio: `npm run prisma:studio`.

## Architecture

### Auth (own implementation, not Auth.js/NextAuth)

- Sessions are DB-backed (`Session` model), keyed by the **SHA-256 hash** of a random token; the
  raw token is the only thing stored in the `session` cookie (httpOnly, `sameSite=lax`, secure in
  prod). See `src/lib/auth/session.ts` for the create/validate/invalidate primitives and
  `src/lib/auth/cookies.ts` for the Next-facing wrappers (`getCurrentUser`,
  `getCurrentUserWithSession`, `createUserSession`, `destroyUserSession`).
- Two-layer route protection, deliberately split:
  - `src/proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`; same mechanics) does an
    **optimistic, cookie-presence-only** check for `/onboarding`, `/dashboard`, `/empresa`,
    `/financeiro`, `/assistente`, `/configuracoes` and redirects to `/login` if the cookie is
    missing. It never touches the DB.
  - The real check happens in `src/app/(app)/layout.tsx`, which calls
    `requireOnboardedUser()` (`src/lib/auth/guards.ts`) **once** for every page under the `(app)`
    route group — it validates the session against the DB and redirects to `/onboarding` if the
    user's `Business.onboardingCompleted` is false. `/onboarding` itself does its own lighter
    check (logged in, not yet onboarding-complete) directly in its `page.tsx`.
  - Route groups don't affect the URL — `(app)/dashboard` still serves `/dashboard`. When adding a
    new protected page, put it under `src/app/(app)/` to inherit the guard + nav for free, and add
    its path to `proxy.ts`'s `matcher`.
- Password reset and "change password while logged in" are separate flows with separate session
  semantics: reset-password invalidates **all** sessions (`invalidateAllUserSessions`); changing
  the password from Configurações invalidates all **other** sessions but keeps the current one
  alive (`invalidateOtherSessions`, needs the current session id from
  `getCurrentUserWithSession`).
- Rate limiting (`src/lib/auth/rateLimit.ts`) is an in-memory fixed-window limiter, per-process —
  it will not work correctly across multiple server instances (would need Redis/Upstash for that).
  It's bypassed only when `DISABLE_RATE_LIMIT=1`, which `playwright.config.ts` sets for its spawned
  dev server so the E2E suite's rapid, same-IP requests don't trip it. Never set that var in dev
  or production.
- All user-facing error copy in login/forgot-password is intentionally generic to avoid account
  enumeration; registration is the one place that says "e-mail already registered" (accepted
  UX/security tradeoff, see the stage-1 prompt).

### Prisma 7 specifics (this repo predates most training data on this version)

- The connection URL lives in `prisma.config.ts`, **not** in `schema.prisma`'s `datasource` block
  (that's a Prisma 7 breaking change). `schema.prisma` only declares `provider = "postgresql"`.
- The Postgres connection uses a driver adapter (`@prisma/adapter-pg`) instantiated in
  `src/lib/db.ts`, not the old `url`-in-schema connection.
- `Decimal` is **not** a named export of `@prisma/client` at the type level (only reachable via
  `Prisma.Decimal`, an `export import` inside the `Prisma` namespace). The pattern used throughout
  this codebase is `import { Prisma } from "@prisma/client"; const { Decimal } = Prisma;`.
- A `Prisma.Decimal` instance is a class, not a plain object — it **cannot** cross the
  server-component → client-component boundary (Next throws "Only plain objects can be passed to
  Client Components"). Server components must call `.toString()`/`.toNumber()` before passing
  Decimal-bearing data (e.g. `Business.averageMonthlyRevenue`) into a `"use client"` component. See
  `src/app/(app)/empresa/page.tsx` → `EmpresaForm` for the pattern (a plain `EmpresaFormData` type,
  not the raw Prisma `Business`).
- `prisma migrate dev`/`db push` no longer auto-run `generate` — run `npx prisma generate`
  explicitly after schema changes if you're not going through `migrate dev`.

### Typed routes (Next 16)

Page/layout/route-handler prop types (`PageProps<'/path/[param]'>`, `LayoutProps<'/path'>`,
`RouteContext<'/api/path'>`) are globally available, generated types — no import needed. They're
regenerated by `next dev`, `next build`, or `npx next typegen`. If `tsc --noEmit` complains that a
route string doesn't satisfy a `PageProps`/`LayoutProps` constraint after adding a new route, run
`npx next typegen` first before treating it as a real type error.

### Money

Never `Float`/`number` for currency amounts in the schema or in calculations — always
`Prisma.Decimal` (`@db.Decimal(14, 2)` columns). Formatting goes through `formatMoney()` in
`src/lib/money.ts`, which uses `Intl.NumberFormat({ style: "currency", currency })` — this already
applies the correct decimal digits per currency (0 for JPY, 2 for BRL/USD) without a manual lookup
table. `isIntegerCurrency()` / the `step6Schema`/`businessEditSchema` Zod refinements in
`src/lib/onboarding/schema.ts` enforce that JPY amounts have no fractional part at the validation
layer, before they ever reach a Decimal.

### Financial calculation engine

`src/lib/finance/calculations.ts` (`summarizeEntries`) is a pure function over an array of
`{ type: REVENUE|COST|EXPENSE, amount: Decimal }` — no DB dependency, unit-tested directly. Margin
is `null` (not `NaN`/an exception) when revenue is zero. `src/lib/finance/queries.ts` wraps it with
the actual Prisma queries (`getFinancialSummary`, `getMonthlySeries`), scoped by `businessId` and a
`PeriodKey` resolved by `src/lib/finance/period.ts` (`resolvePeriodRange`, month-bucket logic for
the dashboard chart). There is intentionally no UI/route to create `FinancialEntry` rows yet
(that's a future stage) — the model and calculation engine exist now specifically so they can be
exercised by tests that insert rows directly via Prisma. Because of this, the dashboard's cards and
chart are *genuinely* empty by default (real query returning zero rows), not a hardcoded empty
state — don't "fix" that by hardcoding placeholder numbers.

`Business.averageMonthlyRevenue` (entered during onboarding) is company-profile metadata, not a
financial entry — it's only ever displayed on `/empresa`, explicitly labeled as profile info. It
must never feed the dashboard's Faturamento card or any calculation; keep that separation when
touching either page.

### Onboarding

A single-page step wizard (`src/app/onboarding/OnboardingWizard.tsx`, client component) backed by
`Business.onboardingStep` (int) for resumability. Each step's answer is persisted immediately via
`POST /api/onboarding/answer` (`{ step, data }`) — the route re-validates server-side per step using
the Zod schemas in `src/lib/onboarding/schema.ts`, allows re-answering any step `<= onboardingStep`
(so "voltar" can edit an earlier answer) but rejects skipping ahead, and takes
`max(currentStep, step + 1)` so re-answering never regresses progress. Changing `businessType` on a
resubmit resets `revenueModel`/`revenueModelOther` since the option list is type-dependent. The
business-type-to-revenue-options mapping is centralized in `src/lib/onboarding/options.ts` — add
new business types or revenue options there, not inline in components. `POST
/api/onboarding/complete` independently re-verifies all required fields are present before setting
`onboardingCompleted = true` (defense against a client that skipped the step guard somehow).

### Cross-user isolation

Every query that resolves a `Business` does it via `where: { userId: <id from the session> }` —
never from a client-supplied id (body, query string, or URL param). There is no `/business/[id]`-
style route; `/empresa`, `/financeiro`, etc. are implicitly scoped to "my company." When adding a
new authenticated route, follow the same rule: derive the owner from `getCurrentUser()`/
`requireOnboardedUser()`, never trust an id from the request.

### Icons

`lucide-react` is the standard icon library for new UI (introduced with the app Sidebar,
`src/components/nav/Sidebar.tsx`) — import icons from it directly (`import { Settings } from
"lucide-react"`) rather than adding emoji or another hand-rolled `<svg>`. A few pre-existing
components still use hand-rolled inline SVG (`ThemeToggle`'s sun/moon, `Logo`'s brand mark) or plain
emoji (some badge/metric icons) from before this convention — leave those as-is unless you're
already rewriting that component, but don't add a third icon style anywhere new.

## Testing notes

- `tests/unit/` — pure functions, no DB.
- `tests/integration/` — call route handlers or query functions directly against the real
  Postgres from `docker compose up -d` (no HTTP, no Next request context). This only works for
  code that doesn't touch `next/headers` (`cookies()`); anything session-dependent has to be an E2E
  test instead (see `tests/integration/sqlInjection.test.ts`/`resetToken.test.ts` for the pattern:
  import the route's `POST` export and call it with a plain `Request`).
- `tests/e2e/` — Playwright, real browser + real dev server (`playwright.config.ts`'s `webServer`
  always starts a **fresh** server, `reuseExistingServer: false` — a stray already-running `npm run
  dev` was previously found to leak accumulated rate-limiter state across runs and caused flaky
  failures). If a dev server is left running from manual testing before running `npm run test:e2e`
  by hand outside Playwright, kill it first (Playwright's own runs handle this automatically).
- When adding a whole new test-only npm dependency category (e.g. a new assertion lib), check
  `package.json` engines/peer constraints first — this repo hit a `vitest@5` requiring
  `@types/node >= 22` while the scaffold shipped `@types/node ^20`.

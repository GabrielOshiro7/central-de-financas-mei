function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M10 15V5M10 5L5 10M10 5l5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Composição abstrata (cards, barras, indicadores) representando
 * inteligência/organização/crescimento, só com a paleta da seção 4 do
 * briefing da landing — puramente decorativo, por isso aria-hidden.
 */
export function HeroVisual() {
  return (
    <div className="relative mx-auto aspect-4/3 w-full max-w-[480px]" aria-hidden="true">
      {/* backdrop e sombras usam preto fixo, não --color-landing-foreground:
          esse token vira quase-branco no dark mode e o 5% de opacidade
          passaria de "sombra sutil" pra "glow" claro em volta do card */}
      <div className="absolute inset-4 rounded-[2rem] bg-black/5 dark:bg-black/20" />

      <div
        data-anim="hero-card"
        className="absolute inset-x-6 inset-y-10 flex flex-col justify-between rounded-2xl border border-landing-border bg-landing-card p-6 shadow-xl shadow-black/5 dark:shadow-none"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-landing-muted">Receita mensal</span>
          <span className="h-2 w-2 rounded-full bg-landing-primary" />
        </div>

        <div className="flex h-32 items-end gap-3">
          <div
            data-anim="hero-bar"
            className="w-full rounded-t-md bg-landing-secondary/15"
            style={{ height: "45%" }}
          />
          <div
            data-anim="hero-bar"
            className="w-full rounded-t-md bg-landing-secondary/25"
            style={{ height: "65%" }}
          />
          <div
            data-anim="hero-bar"
            className="w-full rounded-t-md bg-landing-secondary/40"
            style={{ height: "50%" }}
          />
          <div
            data-anim="hero-bar"
            data-bar-featured="true"
            className="w-full rounded-t-md bg-landing-primary"
            style={{ height: "85%" }}
          />
          <div
            data-anim="hero-bar"
            className="w-full rounded-t-md bg-landing-secondary/25"
            style={{ height: "60%" }}
          />
        </div>

        <div className="h-px w-full bg-landing-border" />

        <div className="flex items-center justify-between text-xs text-landing-muted">
          <span>Jan</span>
          <span>Fev</span>
          <span>Mar</span>
          <span>Abr</span>
          <span>Mai</span>
        </div>
      </div>

      <div
        data-anim="hero-badge"
        className="absolute -right-2 top-2 flex items-center gap-2 rounded-xl border border-landing-border bg-landing-card px-4 py-3 shadow-lg shadow-black/5 dark:shadow-none"
      >
        <span
          data-anim="hero-badge-icon"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-landing-primary/10 text-landing-primary"
        >
          <ArrowUpIcon />
        </span>
        <div>
          <p className="text-sm font-semibold text-landing-foreground">+24%</p>
          <p className="text-[11px] text-landing-muted">crescimento</p>
        </div>
      </div>

      <div
        data-anim="hero-mini"
        className="absolute -left-6 -bottom-4 flex flex-col gap-2 rounded-xl border border-landing-border bg-landing-card px-4 py-3 shadow-lg shadow-black/5 dark:shadow-none"
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${i === 1 ? "bg-landing-primary" : "bg-landing-secondary/40"}`}
            />
            <span className="h-1.5 w-16 rounded-full bg-landing-border" />
          </div>
        ))}
      </div>
    </div>
  );
}

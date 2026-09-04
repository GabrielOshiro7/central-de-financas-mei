export function ProgressIndicator({ current, total }: { current: number; total: number }) {
  const pct = Math.min(100, Math.round((current / total) * 100));
  return (
    <div className="mb-6">
      <div className="mb-2 text-xs text-gray-500 dark:text-neutral-400">
        Pergunta {current} de {total}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-neutral-800">
        <div
          className="h-full rounded-full bg-gray-900 transition-all dark:bg-neutral-100"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

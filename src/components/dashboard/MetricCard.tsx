export function MetricCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-sm text-gray-500 dark:text-neutral-400">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold ${
          value ? "text-gray-900 dark:text-neutral-100" : "text-gray-400 dark:text-neutral-600"
        }`}
      >
        {value ?? "Sem dados"}
      </div>
    </div>
  );
}

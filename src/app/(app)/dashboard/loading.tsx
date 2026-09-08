function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-200 dark:bg-neutral-800 ${className}`} />;
}

// Skeleton por bloco (secao 29 da Etapa 4) - convencao nativa do App Router
// (loading.tsx e mostrado automaticamente enquanto o server component da
// pagina busca os dados), em vez de um "Carregando..." generico cobrindo a
// tela inteira.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <SkeletonBlock className="h-7 w-40" />
          <SkeletonBlock className="h-4 w-56" />
        </div>
        <SkeletonBlock className="h-9 w-36" />
      </div>

      <SkeletonBlock className="h-12 w-full max-w-2xl" />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-24" />
        ))}
      </div>

      <SkeletonBlock className="h-56 w-full" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkeletonBlock className="h-40" />
        <SkeletonBlock className="h-40" />
      </div>

      <SkeletonBlock className="h-48 w-full" />
    </div>
  );
}

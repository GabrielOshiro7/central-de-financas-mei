function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-200 dark:bg-neutral-800 ${className}`} />;
}

// Mesmo padrao de dashboard/loading.tsx (Etapa 4) - skeleton por bloco,
// convencao nativa do App Router.
export default function CaixaLoading() {
  return (
    <div className="flex flex-col gap-8">
      <SkeletonBlock className="h-7 w-40" />
      <SkeletonBlock className="h-40 w-full max-w-xl" />
      <SkeletonBlock className="h-24 w-full max-w-xl" />
      <SkeletonBlock className="h-12 w-full max-w-md" />
      <SkeletonBlock className="h-56 w-full" />
    </div>
  );
}

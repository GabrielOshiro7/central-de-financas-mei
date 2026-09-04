import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12 dark:bg-neutral-950">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900 text-2xl font-bold text-white dark:bg-neutral-100 dark:text-neutral-900">
          N
        </div>

        <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-neutral-100">
          Nome do Sistema
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
          Seu sistema de gestão empresarial
        </p>

        <div className="mt-8 flex w-full flex-col gap-3">
          <Link
            href="/login"
            className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Entrar
          </Link>
          <Link
            href="/register"
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-900 transition hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
          >
            Criar conta
          </Link>
        </div>

        <Link
          href="/forgot-password"
          className="mt-6 text-sm text-gray-500 underline-offset-4 hover:underline dark:text-neutral-400"
        >
          Recuperar senha
        </Link>
      </div>
    </div>
  );
}

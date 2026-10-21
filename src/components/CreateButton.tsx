import { Plus } from "lucide-react";

// Botão de criação de nível de página (ex.: "Nova receita", "Nova venda",
// "Novo cliente"). Cores = botão de contorno padrão do app (as do "Cancelar"
// dos modais, a variação mais usada; disabled:opacity-60 é o disabled dessa
// mesma família). Só o ícone Plus usa o Ember (text-ember, o mesmo token do
// sublinhado da aba ativa do Financeiro) - o texto fica na cor do contorno. O
// disabled reduz a opacidade do botão inteiro, ícone incluso. O contorno de
// foco não existe no estilo de contorno; foi definido aqui. h-9.5 (38px) é a
// mesma altura explícita dos selects/datas do painel de filtros do Financeiro
// (TransactionFilters) - a altura natural de um <select> varia por navegador,
// então os dois lados fixam o mesmo valor.
export const CREATE_BUTTON_CLASS =
  "inline-flex h-9.5 items-center justify-center gap-1.5 border border-gray-300 px-4 py-2 text-sm font-semibold whitespace-nowrap text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 dark:focus-visible:outline-neutral-100";

export const CREATE_BUTTON_ICON_CLASS = "shrink-0 text-ember";

// Conteúdo do botão (ícone + rótulo). Sem estado nem hooks: serve dentro de
// <button> (componentes cliente) e de <Link> (páginas de servidor). O ícone é
// decorativo (aria-hidden), então o nome acessível é só o rótulo, sem "+".
export function CreateButtonContent({ label }: { label: string }) {
  return (
    <>
      <Plus size={16} strokeWidth={2} className={CREATE_BUTTON_ICON_CLASS} aria-hidden="true" />
      {label}
    </>
  );
}

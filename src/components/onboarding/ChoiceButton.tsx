import type { ReactNode } from "react";

export function ChoiceButton({
  selected,
  onClick,
  children,
  disabled = false,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`w-full border px-4 py-3 text-left text-sm transition ${
        disabled
          ? "cursor-not-allowed opacity-50 border-gray-300 text-gray-500 dark:border-neutral-700 dark:text-neutral-500"
          : selected
            ? "border-gray-900 bg-gray-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
            : "border-gray-300 text-gray-900 hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

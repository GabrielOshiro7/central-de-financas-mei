export function SubmitButton({
  pending,
  children,
  pendingText,
}: {
  pending: boolean;
  children: string;
  pendingText: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
    >
      {pending ? pendingText : children}
    </button>
  );
}

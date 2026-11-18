import type { InputHTMLAttributes } from "react";

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  // Texto curto de FINALIDADE, abaixo do campo (ex.: "Usado so para identificar o cliente nas suas
  // vendas."). Obrigatorio em campos de identificador ou de dado financeiro sensivel.
  hint?: string;
  // Obrigatorio? Por padrao, vale a convencao do app: todo campo opcional traz "(opcional)" no rotulo,
  // entao sem isso o campo e obrigatorio. Exposto como aria-required (WCAG 3.3.2: a obrigatoriedade
  // nao pode depender so do visual).
  required?: boolean;
};

export function FormField({ label, error, hint, id, required, ...inputProps }: FormFieldProps) {
  const isRequired = required ?? !/opcional/i.test(label);
  const hintId = hint && id ? `${id}-hint` : undefined;
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-700 dark:text-neutral-300"
      >
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hintId}
        aria-required={isRequired}
        {...inputProps}
        aria-invalid={Boolean(error)}
        className="mt-1 w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
      />
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
          {hint}
        </p>
      )}
      {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

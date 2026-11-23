import type { InputHTMLAttributes } from "react";
import { PasswordInput } from "@/components/ui/PasswordInput";

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

// type="password" usa o PasswordInput (campo com botao mostrar/ocultar senha): TODO campo de senha do app passa por aqui.
export function FormField({ label, error, hint, id, required, type, ...inputProps }: FormFieldProps) {
  const isRequired = required ?? !/opcional/i.test(label);
  const hintId = hint && id ? `${id}-hint` : undefined;
  // Erro do campo: o <p> tem role="alert" e id, e o input o referencia em aria-describedby (junto com a dica).
  const errorId = error && id ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-700 dark:text-neutral-300"
      >
        {label}
      </label>
      {type === "password" ? (
        <PasswordInput
          id={id}
          aria-describedby={describedBy}
          aria-required={isRequired}
          {...inputProps}
          aria-invalid={Boolean(error)}
        />
      ) : (
        <input
          id={id}
          type={type}
          aria-describedby={describedBy}
          aria-required={isRequired}
          {...inputProps}
          aria-invalid={Boolean(error)}
          className="mt-1 w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />
      )}
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

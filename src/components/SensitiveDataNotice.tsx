import { SENSITIVE_DATA_NOTICE } from "@/lib/privacy/sensitiveDataNotice";

// Aviso padrao abaixo de todo campo livre de observacao que pode guardar dados de terceiros.
export function SensitiveDataNotice() {
  return <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">{SENSITIVE_DATA_NOTICE}</p>;
}

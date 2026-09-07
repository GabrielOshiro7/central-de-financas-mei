"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Currency } from "@prisma/client";

type RawFields = {
  data: string;
  tipo: string;
  categoria: string;
  descricao: string;
  valor: string;
  observacao: string;
};

type PreviewRow = {
  rowNumber: number;
  raw: RawFields;
  errors: string[];
  isDuplicate: boolean;
};

type ConfirmResult = {
  inserted: number;
  skippedDuplicates: number;
  failed: { rowNumber: number; errors: string[] }[];
};

type DuplicateAction = "skip" | "import_anyway";

export function ImportWizard({ currency }: { currency: Currency | null }) {
  const router = useRouter();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const xlsxInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [hasPreview, setHasPreview] = useState(false);
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ConfirmResult | null>(null);

  const validCount = rows.filter((r) => r.errors.length === 0).length;
  const invalidCount = rows.length - validCount;
  const duplicateCount = rows.filter((r) => r.errors.length === 0 && r.isDuplicate).length;
  const importableCount =
    duplicateAction === "skip" ? rows.filter((r) => r.errors.length === 0 && !r.isDuplicate).length : validCount;

  async function handleFileSelected(file: File) {
    setUploading(true);
    setUploadError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/financeiro/import/preview", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? "Não foi possível ler o arquivo.");
        return;
      }
      setRows(
        data.rows.map((r: { rowNumber: number; raw: RawFields; errors: string[]; isDuplicate: boolean }) => ({
          rowNumber: r.rowNumber,
          raw: r.raw,
          errors: r.errors,
          isDuplicate: r.isDuplicate,
        }))
      );
      setDuplicateAction(null);
      setHasPreview(true);
    } catch {
      setUploadError("Erro de conexão. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }

  function updateRow(rowNumber: number, field: keyof RawFields, value: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.rowNumber === rowNumber
          ? { ...r, raw: { ...r.raw, [field]: value }, errors: [], isDuplicate: false }
          : r
      )
    );
  }

  function removeRow(rowNumber: number) {
    setRows((prev) => prev.filter((r) => r.rowNumber !== rowNumber));
  }

  function startOver() {
    setRows([]);
    setHasPreview(false);
    setDuplicateAction(null);
    setUploadError(null);
    setResult(null);
  }

  async function handleConfirm() {
    setConfirming(true);
    setUploadError(null);
    try {
      const res = await fetch("/api/financeiro/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duplicateAction: duplicateAction ?? "import_anyway",
          rows: rows.map((r) => ({ rowNumber: r.rowNumber, ...r.raw })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? "Não foi possível concluir a importação.");
        return;
      }
      const confirmResult = data as ConfirmResult;
      setResult(confirmResult);
      setRows((prev) =>
        prev
          .filter((r) => confirmResult.failed.some((f) => f.rowNumber === r.rowNumber))
          .map((r) => ({
            ...r,
            errors: confirmResult.failed.find((f) => f.rowNumber === r.rowNumber)?.errors ?? [],
          }))
      );
      router.refresh();
    } catch {
      setUploadError("Erro de conexão. Tente novamente.");
    } finally {
      setConfirming(false);
    }
  }

  if (!hasPreview) {
    return (
      <div className="flex flex-col gap-8">
        <div className="rounded-xl border border-gray-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => xlsxInputRef.current?.click()}
              disabled={uploading}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              📄 Importar Excel
            </button>
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              disabled={uploading}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              📄 Importar CSV
            </button>
          </div>
          <input
            ref={xlsxInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
          />
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
          />

          {uploading && <p className="mt-4 text-sm text-gray-500 dark:text-neutral-400">Lendo arquivo...</p>}
          {uploadError && (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              {uploadError}
            </p>
          )}

          <p className="mt-6 text-xs text-gray-400 dark:text-neutral-500">Formatos aceitos: .xlsx e .csv</p>
        </div>

        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <p className="text-sm text-gray-600 dark:text-neutral-400">Não possui um arquivo?</p>
          <div className="mt-3 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href="/api/financeiro/import/template?format=xlsx"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Baixar template Excel
            </a>
            <a
              href="/api/financeiro/import/template?format=csv"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Baixar template CSV
            </a>
          </div>
          {currency === "JPY" && (
            <p className="mt-4 text-xs text-gray-400 dark:text-neutral-500">
              Sua empresa usa iene (¥): os valores no arquivo não devem ter casas decimais.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm text-gray-700 dark:text-neutral-300">
          Encontramos {rows.length} lançamento{rows.length === 1 ? "" : "s"}.
        </p>
        <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400">✓ {validCount} registros válidos</p>
        {invalidCount > 0 && (
          <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">⚠ {invalidCount} registros com problemas</p>
        )}
      </div>

      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          {result.inserted} lançamento{result.inserted === 1 ? "" : "s"} importado{result.inserted === 1 ? "" : "s"}{" "}
          com sucesso.
          {result.skippedDuplicates > 0 && ` ${result.skippedDuplicates} duplicado(s) ignorado(s).`}
          {result.failed.length > 0 && ` ${result.failed.length} continuam com problema - corrija abaixo e tente de novo.`}
        </div>
      )}

      {duplicateCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Encontramos possíveis lançamentos duplicados.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDuplicateAction("skip")}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                duplicateAction === "skip"
                  ? "border-amber-600 bg-amber-600 text-white"
                  : "border-amber-300 text-amber-800 hover:bg-amber-100 dark:text-amber-300"
              }`}
            >
              Ignorar duplicados
            </button>
            <button
              type="button"
              onClick={() => setDuplicateAction("import_anyway")}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                duplicateAction === "import_anyway"
                  ? "border-amber-600 bg-amber-600 text-white"
                  : "border-amber-300 text-amber-800 hover:bg-amber-100 dark:text-amber-300"
              }`}
            >
              Importar mesmo assim
            </button>
            <button
              type="button"
              onClick={() => setDuplicateAction(null)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                duplicateAction === null
                  ? "border-amber-600 bg-amber-600 text-white"
                  : "border-amber-300 text-amber-800 hover:bg-amber-100 dark:text-amber-300"
              }`}
            >
              Revisar
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-neutral-800 dark:text-neutral-400">
              <th className="px-3 py-2 font-medium">Linha</th>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Categoria</th>
              <th className="px-3 py-2 font-medium">Descrição</th>
              <th className="px-3 py-2 font-medium">Valor</th>
              <th className="px-3 py-2 font-medium">Observação</th>
              <th className="px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.rowNumber}
                className={`border-b border-gray-100 align-top last:border-0 dark:border-neutral-800 ${
                  row.errors.length > 0
                    ? "bg-red-50 dark:bg-red-950/30"
                    : row.isDuplicate
                      ? "bg-amber-50 dark:bg-amber-950/20"
                      : ""
                }`}
              >
                <td className="px-3 py-2 text-gray-500 dark:text-neutral-400">{row.rowNumber}</td>
                {(["data", "tipo", "categoria", "descricao", "valor", "observacao"] as const).map((field) => (
                  <td key={field} className="px-3 py-2">
                    <input
                      value={row.raw[field]}
                      onChange={(e) => updateRow(row.rowNumber, field, e.target.value)}
                      className="w-full min-w-[100px] rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => removeRow(row.rowNumber)}
                    className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                  >
                    Remover
                  </button>
                  {row.errors.length > 0 && (
                    <ul className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {row.errors.map((err) => (
                        <li key={err}>{err}</li>
                      ))}
                    </ul>
                  )}
                  {row.isDuplicate && row.errors.length === 0 && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Possível duplicado</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {uploadError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {uploadError}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={startOver}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Começar de novo
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirming || importableCount === 0 || (duplicateCount > 0 && duplicateAction === null)}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {confirming ? "Importando..." : `Importar ${importableCount} lançamento${importableCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

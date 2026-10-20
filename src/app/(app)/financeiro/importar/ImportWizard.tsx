"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Currency, FinancialEntryType } from "@prisma/client";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText } from "lucide-react";
import { normalizeCategoryName } from "@/lib/finance/categoryName";
import { parseImportEntryType, ENTRY_TYPE_LABELS } from "@/lib/finance/options";

type RawFields = {
  data: string;
  tipo: string;
  categoria: string;
  descricao: string;
  valor: string;
  observacao: string;
};

type CategoryStatus = "existing" | "new" | "missing";

type PreviewRow = {
  rowNumber: number;
  raw: RawFields;
  type: FinancialEntryType | null;
  categoryStatus: CategoryStatus;
  categoryNormalized: string;
  errors: string[];
  isDuplicate: boolean;
};

type ConfirmResult = {
  inserted: number;
  skippedDuplicates: number;
  categoriesCreated: number;
  failed: { rowNumber: number; errors: string[] }[];
};

type DuplicateAction = "skip" | "import_anyway";

export type ImportCategoryOption = { id: string; name: string; type: FinancialEntryType };

type NewCategoryGroup = {
  key: string;
  type: FinancialEntryType;
  normalizedName: string;
  name: string;
  rowCount: number;
};

function groupNewCategories(rows: PreviewRow[]): NewCategoryGroup[] {
  const groups = new Map<string, NewCategoryGroup>();
  for (const row of rows) {
    if (row.errors.length > 0 || row.categoryStatus !== "new" || !row.type) continue;
    const key = `${row.type}:${row.categoryNormalized}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rowCount += 1;
    } else {
      groups.set(key, {
        key,
        type: row.type,
        normalizedName: row.categoryNormalized,
        name: row.raw.categoria.trim(),
        rowCount: 1,
      });
    }
  }
  return Array.from(groups.values());
}

// Reclassifica categoria/tipo de uma linha apos edicao na previa, usando so
// as categorias ja visiveis para a empresa (passadas por prop) - a mesma
// logica de normalizeCategoryName usada no servidor, para a previa nao
// mostrar um estado que a confirmacao (autoritativa) vai contradizer.
function reclassify(
  type: FinancialEntryType | null,
  categoriaRaw: string,
  categories: ImportCategoryOption[]
): { categoryStatus: CategoryStatus; categoryNormalized: string } {
  const categoryNormalized = normalizeCategoryName(categoriaRaw);
  if (!categoryNormalized) return { categoryStatus: "missing", categoryNormalized };
  const match = type
    ? categories.find((c) => c.type === type && normalizeCategoryName(c.name) === categoryNormalized)
    : undefined;
  return { categoryStatus: match ? "existing" : "new", categoryNormalized };
}

export function ImportWizard({
  currency,
  categories,
}: {
  currency: Currency | null;
  categories: ImportCategoryOption[];
}) {
  const router = useRouter();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const xlsxInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [hasPreview, setHasPreview] = useState(false);
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction | null>(null);
  const [categoryDecisions, setCategoryDecisions] = useState<Map<string, string>>(new Map()); // key -> mapToCategoryId ("" = criar nova, o padrao)
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ConfirmResult | null>(null);

  const validCount = rows.filter((r) => r.errors.length === 0).length;
  const invalidCount = rows.length - validCount;
  const duplicateCount = rows.filter((r) => r.errors.length === 0 && r.isDuplicate).length;
  const importableCount =
    duplicateAction === "skip" ? rows.filter((r) => r.errors.length === 0 && !r.isDuplicate).length : validCount;
  const newCategoryGroups = useMemo(() => groupNewCategories(rows), [rows]);

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
        data.rows.map(
          (r: {
            rowNumber: number;
            raw: RawFields;
            type: FinancialEntryType | null;
            categoryStatus: CategoryStatus;
            categoryNormalized: string;
            errors: string[];
            isDuplicate: boolean;
          }) => ({
            rowNumber: r.rowNumber,
            raw: r.raw,
            type: r.type,
            categoryStatus: r.categoryStatus,
            categoryNormalized: r.categoryNormalized,
            errors: r.errors,
            isDuplicate: r.isDuplicate,
          })
        )
      );
      setDuplicateAction(null);
      setCategoryDecisions(new Map());
      setHasPreview(true);
    } catch {
      setUploadError("Erro de conexão. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }

  function updateRow(rowNumber: number, field: keyof RawFields, value: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowNumber !== rowNumber) return r;
        const raw = { ...r.raw, [field]: value };
        const type = field === "tipo" ? parseImportEntryType(value) : r.type;
        const { categoryStatus, categoryNormalized } = reclassify(type, raw.categoria, categories);
        return { ...r, raw, type, categoryStatus, categoryNormalized, errors: [], isDuplicate: false };
      })
    );
  }

  function removeRow(rowNumber: number) {
    setRows((prev) => prev.filter((r) => r.rowNumber !== rowNumber));
  }

  function startOver() {
    setRows([]);
    setHasPreview(false);
    setDuplicateAction(null);
    setCategoryDecisions(new Map());
    setUploadError(null);
    setResult(null);
  }

  async function handleConfirm() {
    setConfirming(true);
    setUploadError(null);
    try {
      const decisions = newCategoryGroups
        .filter((g) => categoryDecisions.get(g.key))
        .map((g) => ({ key: g.key, action: "map" as const, mapToCategoryId: categoryDecisions.get(g.key)! }));

      const res = await fetch("/api/financeiro/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duplicateAction: duplicateAction ?? "import_anyway",
          categoryDecisions: decisions,
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
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => xlsxInputRef.current?.click()}
              disabled={uploading}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              <FileSpreadsheet size={18} strokeWidth={1.75} aria-hidden="true" />
              Importar Excel
            </button>
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              disabled={uploading}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              <FileText size={18} strokeWidth={1.75} aria-hidden="true" />
              Importar CSV
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
        <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
          {validCount} registros válidos
        </p>
        {invalidCount > 0 && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" />
            {invalidCount} registros com problemas
          </p>
        )}
      </div>

      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          {result.inserted} lançamento{result.inserted === 1 ? "" : "s"} importado{result.inserted === 1 ? "" : "s"}{" "}
          com sucesso.
          {result.categoriesCreated > 0 && ` ${result.categoriesCreated} categoria(s) nova(s) criada(s).`}
          {result.skippedDuplicates > 0 && ` ${result.skippedDuplicates} duplicado(s) ignorado(s).`}
          {result.failed.length > 0 && ` ${result.failed.length} continuam com problema - corrija abaixo e tente de novo.`}
        </div>
      )}

      {newCategoryGroups.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-300">
            {newCategoryGroups.length} nova{newCategoryGroups.length === 1 ? "" : "s"} categoria
            {newCategoryGroups.length === 1 ? "" : "s"} será{newCategoryGroups.length === 1 ? "" : "ão"} criada
            {newCategoryGroups.length === 1 ? "" : "s"} ao confirmar:
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {newCategoryGroups.map((group) => {
              const optionsForType = categories.filter((c) => c.type === group.type);
              const selected = categoryDecisions.get(group.key) ?? "";
              return (
                <li key={group.key} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-blue-900 dark:text-blue-200">
                    <strong>{group.name}</strong> ({ENTRY_TYPE_LABELS[group.type]}, {group.rowCount} linha
                    {group.rowCount === 1 ? "" : "s"})
                  </span>
                  <select
                    aria-label={`O que fazer com a categoria nova "${group.name}"`}
                    value={selected}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCategoryDecisions((prev) => {
                        const next = new Map(prev);
                        if (value) next.set(group.key, value);
                        else next.delete(group.key);
                        return next;
                      });
                    }}
                    className="rounded-lg border border-blue-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-blue-800 dark:bg-neutral-800 dark:text-neutral-100"
                  >
                    <option value="">Criar como nova categoria</option>
                    {optionsForType.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        Mapear para &quot;{opt.name}&quot;
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
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
              <th className="px-3 py-2 font-medium">Valor {currency ? `(${currency})` : ""}</th>
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
                      : row.categoryStatus === "new"
                        ? "bg-blue-50 dark:bg-blue-950/20"
                        : ""
                }`}
              >
                <td className="px-3 py-2 text-gray-500 dark:text-neutral-400">{row.rowNumber}</td>
                {(["data", "tipo", "categoria", "descricao", "valor", "observacao"] as const).map((field) => (
                  <td key={field} className="px-3 py-2">
                    <input
                      value={row.raw[field]}
                      onChange={(e) => updateRow(row.rowNumber, field, e.target.value)}
                      className="w-full min-w-[100px] rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
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
                  {row.categoryStatus === "new" && row.errors.length === 0 && (
                    <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">Categoria nova</p>
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
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
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

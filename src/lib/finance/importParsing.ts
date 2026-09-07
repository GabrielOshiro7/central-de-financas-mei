import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";

// Limites concretos da secao 26 do prompt da Etapa 3.
export const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_IMPORT_ROWS = 10_000;

export const IMPORT_COLUMNS = ["data", "tipo", "categoria", "descricao", "valor", "observacao"] as const;
export const REQUIRED_IMPORT_COLUMNS = ["data", "tipo", "categoria", "descricao", "valor"] as const;

export type RawImportRow = Record<string, string>;

export type ParseSuccess = { ok: true; headers: string[]; rows: RawImportRow[] };
export type ParseFailure = { ok: false; error: string };
export type ParseResult = ParseSuccess | ParseFailure;

// Remove acentos e normaliza espaco/maiuscula para comparar nomes de coluna
// de forma tolerante (igual a regra de nome de categoria - secao 4).
const COMBINING_DIACRITICS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, "g");

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .trim()
    .toLowerCase();
}

function missingColumns(headers: string[]): string[] {
  const normalized = new Set(headers.map(normalizeHeader));
  return REQUIRED_IMPORT_COLUMNS.filter((c) => !normalized.has(c));
}

function checkFileSize(buffer: Buffer): string | null {
  if (buffer.length === 0) return "O arquivo está vazio.";
  if (buffer.length > MAX_IMPORT_FILE_SIZE_BYTES) {
    return "O arquivo é muito grande (máximo de 10MB). Divida-o em partes menores e tente novamente.";
  }
  return null;
}

function finalizeRows(rawHeaders: string[], rows: RawImportRow[]): ParseResult {
  const missing = missingColumns(rawHeaders);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `O arquivo não tem a(s) coluna(s) obrigatória(s): ${missing.join(", ")}.`,
    };
  }
  if (rows.length === 0) {
    return { ok: false, error: "Nenhum lançamento encontrado no arquivo." };
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `O arquivo tem ${rows.length} linhas (máximo de ${MAX_IMPORT_ROWS}). Divida-o em partes menores e tente novamente.`,
    };
  }
  return { ok: true, headers: rawHeaders.map(normalizeHeader), rows };
}

export function parseCsvBuffer(buffer: Buffer): ParseResult {
  const sizeError = checkFileSize(buffer);
  if (sizeError) return { ok: false, error: sizeError };

  let records: Record<string, string>[];
  try {
    records = parse(buffer, {
      columns: (headerRow: string[]) => headerRow.map(normalizeHeader),
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch {
    return { ok: false, error: "Não foi possível ler o arquivo CSV. Verifique o formato e tente novamente." };
  }

  if (records.length === 0) {
    return { ok: false, error: "Nenhum lançamento encontrado no arquivo." };
  }

  const headers = Object.keys(records[0]);
  return finalizeRows(headers, records);
}

export async function parseXlsxBuffer(buffer: Buffer): Promise<ParseResult> {
  const sizeError = checkFileSize(buffer);
  if (sizeError) return { ok: false, error: sizeError };

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    return { ok: false, error: "Não foi possível ler o arquivo Excel. Verifique o formato e tente novamente." };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) {
    return { ok: false, error: "Nenhum lançamento encontrado no arquivo." };
  }

  const headerRow = sheet.getRow(1);
  const rawHeaders: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    rawHeaders[colNumber - 1] = normalizeHeader(String(cell.value ?? ""));
  });

  const rows: RawImportRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0 || row.values === undefined || (Array.isArray(row.values) && row.values.every((v) => v === null || v === undefined || v === ""))) {
      continue;
    }
    const record: RawImportRow = {};
    rawHeaders.forEach((header, index) => {
      if (!header) return;
      const cell = row.getCell(index + 1);
      record[header] = cellToString(cell.value);
    });
    rows.push(record);
  }

  return finalizeRows(rawHeaders.filter(Boolean), rows);
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "text" in value) return String((value as { text: unknown }).text ?? "");
  if (typeof value === "object" && "result" in value) return String((value as { result: unknown }).result ?? "");
  return String(value);
}

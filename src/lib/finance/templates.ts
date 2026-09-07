import ExcelJS from "exceljs";
import { IMPORT_COLUMNS } from "@/lib/finance/importParsing";

const EXAMPLE_ROWS: [string, string, string, string, string, string][] = [
  ["2026-09-01", "receita", "Venda de produtos", "Venda balcão", "50000", "Cliente X"],
  ["2026-09-02", "custo", "Mercadoria", "Compra fornecedor", "20000", "Fornecedor X"],
  ["2026-09-03", "despesa", "Aluguel", "Aluguel mensal", "100000", "Setembro"],
];

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function generateCsvTemplate(): string {
  const lines = [IMPORT_COLUMNS.join(","), ...EXAMPLE_ROWS.map((row) => row.map(csvEscape).join(","))];
  return lines.join("\r\n") + "\r\n";
}

export async function generateXlsxTemplate(): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();

  // Precisa ser a primeira aba: nosso parser de importacao (parseXlsxBuffer)
  // sempre le worksheets[0] como os dados.
  const dataSheet = workbook.addWorksheet("Lançamentos");
  dataSheet.addRow([...IMPORT_COLUMNS]);
  dataSheet.getRow(1).font = { bold: true };
  EXAMPLE_ROWS.forEach((row) => dataSheet.addRow(row));
  dataSheet.columns.forEach((col) => {
    col.width = 20;
  });

  const instructionsSheet = workbook.addWorksheet("Instruções");
  instructionsSheet.addRow(["Como preencher"]);
  instructionsSheet.getRow(1).font = { bold: true, size: 14 };
  const instructions = [
    "",
    "data: no formato AAAA-MM-DD (ex.: 2026-09-01) ou DD/MM/AAAA.",
    "tipo: receita, custo ou despesa.",
    "categoria: o nome de uma categoria já cadastrada (maiúsculas/minúsculas e espaços não importam).",
    "descricao: um texto curto descrevendo o lançamento.",
    "valor: número maior que zero (ex.: 50000 ou 50000.00). Para moeda em iene, não use casas decimais.",
    "observacao: opcional.",
    "",
    "Não altere os nomes das colunas na primeira linha da aba \"Lançamentos\".",
  ];
  instructions.forEach((line) => instructionsSheet.addRow([line]));
  instructionsSheet.getColumn(1).width = 90;

  return workbook.xlsx.writeBuffer();
}

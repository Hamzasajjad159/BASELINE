import type { CellValue, Workbook, Worksheet } from 'exceljs';
import type { RawTable } from '../domain/types';
import { recordsToTable } from './rawTable';

/** A file we could not open at all (as opposed to one with validation problems). */
export class UnreadableFileError extends Error {}

/** ISO date (YYYY-MM-DD) of a Date as stored by Excel (exceljs yields UTC midnight). */
function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function cellToString(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return dateToIso(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if ('richText' in value) return value.richText.map((r) => r.text).join('');
  if ('formula' in value || 'sharedFormula' in value) {
    return cellToString((value as { result?: CellValue }).result ?? null);
  }
  if ('hyperlink' in value) return String(value.text);
  if ('error' in value) return '';
  return '';
}

/** Prefer a sheet named "BOM" (case-insensitive), else the first worksheet. */
export function pickSheet(wb: Workbook): Worksheet | undefined {
  return wb.worksheets.find((ws) => ws.name.trim().toLowerCase() === 'bom') ?? wb.worksheets[0];
}

export async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<RawTable> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (cause) {
    throw new UnreadableFileError(
      'This file could not be read as an Excel workbook. It may be damaged, password-protected, ' +
        'or not really an .xlsx file. Re-save it from Excel as .xlsx, or export it as CSV.',
      { cause },
    );
  }
  const ws = pickSheet(wb);
  if (!ws) return recordsToTable([], [{ message: 'The workbook has no worksheets.' }]);

  const width = ws.columnCount;
  const records: { sourceRow: number; cells: string[] }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(cellToString(row.getCell(c).value));
    records.push({ sourceRow: rowNumber, cells });
  });
  return recordsToTable(records);
}

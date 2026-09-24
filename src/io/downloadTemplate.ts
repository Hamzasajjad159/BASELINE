import {
  COLUMNS,
  COLUMN_KEYS,
  INSTRUCTIONS_HEADER,
  buildCsvTemplate,
  exampleRow,
  instructionRows,
} from '../domain/template';
import { XLSX_MIME, downloadBlob } from './download';

/** Rows pre-formatted as Text in the BOM sheet (Excel applies column formats to new rows too). */
const TEXT_FORMAT = '@';
const VALIDATION_ROWS = 5000;

export function downloadCsvTemplate(): void {
  // BOM so Excel opens the UTF-8 file with the right encoding.
  const blob = new Blob(['﻿', buildCsvTemplate()], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, 'baseline_bom_template.csv');
}

export async function buildXlsxTemplate(): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Baseline';

  const bom = wb.addWorksheet('BOM', { views: [{ state: 'frozen', ySplit: 1 }] });
  bom.columns = COLUMNS.map((c) => ({
    header: c.key,
    key: c.key,
    width: Math.max(12, c.key.length + 2),
    // Text format everywhere so Excel keeps leading zeros and does not
    // reinterpret part numbers or dates.
    style: { numFmt: TEXT_FORMAT },
  }));
  const header = bom.getRow(1);
  header.font = { bold: true };
  COLUMNS.forEach((c, i) => {
    if (c.required) {
      header.getCell(i + 1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFDE68A' },
      };
    }
  });

  const makeBuyCol = COLUMN_KEYS.indexOf('make_buy') + 1;
  for (let r = 2; r <= VALIDATION_ROWS; r++) {
    bom.getCell(r, makeBuyCol).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"MAKE,BUY"'],
    };
  }

  const info = wb.addWorksheet('Instructions');
  info.addRow(['Baseline BOM template']).font = { bold: true, size: 14 };
  info.addRow([
    'Fill one row per BOM line on the "BOM" sheet. Yellow headers are required. ' +
      'All cells are formatted as text so leading zeros are kept.',
  ]);
  info.addRow([]);
  info.addRow([...INSTRUCTIONS_HEADER]).font = { bold: true };
  for (const row of instructionRows()) info.addRow(row);
  info.addRow([]);
  info.addRow(['Example row']).font = { bold: true };
  info.addRow([...COLUMN_KEYS]).font = { bold: true };
  info.addRow(exampleRow());
  info.getColumn(1).width = 22;
  info.getColumn(2).width = 10;
  info.getColumn(3).width = 18;
  info.getColumn(4).width = 70;
  info.getColumn(5).width = 50;
  info.getColumn(6).width = 18;

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export async function downloadXlsxTemplate(): Promise<void> {
  const buffer = await buildXlsxTemplate();
  downloadBlob(new Blob([buffer], { type: XLSX_MIME }), 'baseline_bom_template.xlsx');
}

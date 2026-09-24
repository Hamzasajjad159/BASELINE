import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { COLUMN_KEYS } from '../src/domain/template';
import { validateFile } from '../src/domain/validate';
import { buildXlsxTemplate } from '../src/io/downloadTemplate';
import { cellToString, parseXlsxBuffer, pickSheet } from '../src/io/parseXlsx';
import { fileKind, readBomFile, sha256Hex, UnsupportedFileError } from '../src/io/readFile';
import { BASE } from './helpers';

async function toBuffer(wb: ExcelJS.Workbook): Promise<ArrayBuffer> {
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('cellToString', () => {
  it('converts every exceljs cell value kind', () => {
    expect(cellToString(null)).toBe('');
    expect(cellToString(undefined as unknown as null)).toBe('');
    expect(cellToString('x')).toBe('x');
    expect(cellToString(2.5)).toBe('2.5');
    expect(cellToString(true)).toBe('true');
    expect(cellToString(new Date(Date.UTC(2026, 0, 5)))).toBe('2026-01-05');
    expect(cellToString({ richText: [{ text: 'Bra' }, { text: 'cket' }] })).toBe('Bracket');
    expect(cellToString({ formula: 'A1*2', result: 4, date1904: false })).toBe('4');
    expect(cellToString({ formula: 'A1', date1904: false })).toBe('');
    expect(cellToString({ sharedFormula: 'A1', result: 'y', date1904: false })).toBe('y');
    expect(cellToString({ text: 'link', hyperlink: 'https://x' })).toBe('link');
    expect(cellToString({ error: '#REF!' })).toBe('');
    expect(cellToString({} as never)).toBe('');
  });
});

describe('parseXlsxBuffer', () => {
  it('prefers the BOM sheet and keeps Excel row numbers', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Readme').addRow(['not this one']);
    const ws = wb.addWorksheet(' bom ');
    ws.addRow(['part_number', 'quantity', 'effectivity_start']);
    ws.addRow(['#example', '1', '']);
    ws.addRow([]);
    ws.addRow(['00123', 2, new Date(Date.UTC(2026, 2, 1))]);
    ws.getCell('A5').value = 'P-2';
    ws.getCell('B5').value = { formula: '1+1', result: 2, date1904: false };

    const t = await parseXlsxBuffer(await toBuffer(wb));
    expect(t.headers).toEqual(['part_number', 'quantity', 'effectivity_start']);
    expect(t.rows).toEqual([
      { part_number: '00123', quantity: '2', effectivity_start: '2026-03-01' },
      { part_number: 'P-2', quantity: '2', effectivity_start: '' },
    ]);
    expect(t.sourceRows).toEqual([4, 5]);
  });

  it('falls back to the first sheet', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Data').addRow(['a']);
    expect(pickSheet(wb)?.name).toBe('Data');
  });

  it('reports a workbook without sheets', async () => {
    const wb = new ExcelJS.Workbook();
    const t = await parseXlsxBuffer(await toBuffer(wb));
    expect(t.rows).toEqual([]);
    expect(t.parseWarnings[0]?.message).toContain('no worksheets');
  });

  it('round-trips the Excel template with leading zeros intact', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildXlsxTemplate());
    const bom = wb.getWorksheet('BOM') as ExcelJS.Worksheet;
    // Type into row 2 like a user would (rows 2+ already exist for the MAKE/BUY dropdown).
    COLUMN_KEYS.forEach((k, i) => {
      bom.getCell(2, i + 1).value = k === 'part_number' ? '000042' : BASE[k];
    });

    const t = await parseXlsxBuffer(await toBuffer(wb));
    const v = validateFile(t);
    expect(v.issues).toEqual([]);
    expect(v.rows[0]?.part_number).toBe('000042');
    expect(v.rows[0]?.sourceRow).toBe(2);
  });
});

describe('readBomFile', () => {
  it('reads CSV and computes the SHA-256 of the bytes', async () => {
    const f = new File(['part_number\nA\n'], 'a.CSV');
    const loaded = await readBomFile(f);
    expect(loaded.fileName).toBe('a.CSV');
    expect(loaded.byteSize).toBe(14);
    expect(loaded.table.rows).toEqual([{ part_number: 'A' }]);
    expect(loaded.checksum).toBe(await sha256Hex(await f.arrayBuffer()));
  });

  it('reads XLSX', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('BOM').addRows([['part_number'], ['X']]);
    const loaded = await readBomFile(new File([await toBuffer(wb)], 'b.xlsx'));
    expect(loaded.table.rows).toEqual([{ part_number: 'X' }]);
  });

  it('sha256Hex matches the known digest of "abc"', async () => {
    const bytes = new TextEncoder().encode('abc').buffer as ArrayBuffer;
    expect(await sha256Hex(bytes)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('rejects unsupported types with a helpful message', () => {
    expect(fileKind('x.txt')).toBe('csv');
    expect(() => fileKind('old.xls')).toThrow(UnsupportedFileError);
    expect(() => fileKind('old.xls')).toThrow('Save the file as .xlsx');
    expect(() => fileKind('doc.pdf')).toThrow('Unsupported file type ".pdf"');
  });
});

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { COLUMN_KEYS } from '../src/domain/template';
import { buildXlsxTemplate } from '../src/io/downloadTemplate';

describe('buildXlsxTemplate', () => {
  it('produces a BOM sheet formatted as text and an Instructions sheet', async () => {
    const buffer = await buildXlsxTemplate();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const bom = wb.getWorksheet('BOM');
    expect(bom).toBeDefined();
    const headers = (bom?.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual([...COLUMN_KEYS]);
    for (let c = 1; c <= COLUMN_KEYS.length; c++) {
      expect(bom?.getColumn(c).numFmt).toBe('@');
    }
    const makeBuy = bom?.getCell(2, COLUMN_KEYS.indexOf('make_buy') + 1);
    expect(makeBuy?.dataValidation.formulae).toEqual(['"MAKE,BUY"']);

    const info = wb.getWorksheet('Instructions');
    expect(info).toBeDefined();
    const text = JSON.stringify(info?.getSheetValues());
    expect(text).toContain('also accepted as');
    expect(text).toContain('Bracket, mounting');
  });
});

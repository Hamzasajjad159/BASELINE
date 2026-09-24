// Builds public/samples/*.xlsx from the hand-crafted CSV samples (the CSVs are the source of truth).
// Every cell is written as text so find numbers like "010" and part numbers keep their exact form.
// Usage: npm run samples — only after editing a CSV: exceljs stamps zip entries with the current
// time, so rebuilt files differ byte-wise even when their content is identical.
// tests/samples.test.ts checks that each XLSX parses to the same rows as its CSV.
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';

const FIXED_DATE = new Date(Date.UTC(2026, 0, 1)); // workbook metadata only

for (const version of ['A', 'B']) {
  const base = `public/samples/sample_version_${version}`;
  const { data } = Papa.parse(readFileSync(`${base}.csv`, 'utf-8').trim(), { header: false });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Baseline';
  wb.created = FIXED_DATE;
  wb.modified = FIXED_DATE;
  const ws = wb.addWorksheet('BOM', { views: [{ state: 'frozen', ySplit: 1 }] });
  for (const cells of data) ws.addRow(cells);
  ws.columns.forEach((col, i) => {
    col.numFmt = '@';
    col.width = Math.max(10, ...data.map((r) => String(r[i] ?? '').length + 2));
  });
  ws.getRow(1).font = { bold: true };

  await wb.xlsx.writeFile(`${base}.xlsx`);
  console.log(`wrote ${base}.xlsx (${data.length - 1} rows)`);
}

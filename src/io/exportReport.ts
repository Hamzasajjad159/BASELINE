import { buildReport, reportFileStem, reportToCsv } from '../domain/report';
import type { ReportMeta, Table } from '../domain/report';
import type { DiffResult } from '../domain/types';
import { XLSX_MIME, downloadBlob } from './download';

export async function buildXlsxReport(result: DiffResult, meta: ReportMeta): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const tables = buildReport(result, meta);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Baseline';
  wb.created = new Date(meta.generatedAt);

  const addSheet = (name: string, table: Table, headerRow: number | null) => {
    const ws = wb.addWorksheet(name, {
      views: headerRow ? [{ state: 'frozen', ySplit: headerRow }] : [],
    });
    // Strings only, formatted as text: nothing is ever evaluated as a formula.
    for (const row of table) ws.addRow(row);
    ws.columns.forEach((col, i) => {
      col.numFmt = '@';
      const longest = Math.max(...table.map((r) => (r[i] ?? '').length));
      col.width = Math.min(60, Math.max(10, longest + 2));
    });
    if (headerRow) {
      ws.getRow(headerRow).font = { bold: true };
      const width = table[headerRow - 1]?.length ?? 1;
      ws.autoFilter = {
        from: { row: headerRow, column: 1 },
        to: { row: headerRow, column: width },
      };
    }
    return ws;
  };

  const summary = addSheet('Summary', tables.summary, null);
  summary.getCell('A1').font = { bold: true, size: 14 };
  const countsHeader = tables.summary.findIndex(([k]) => k === 'Change type') + 1;
  summary.getRow(countsHeader).font = { bold: true };
  addSheet('Changes', tables.changes, 1);
  addSheet('Warnings', tables.warnings, 1);

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export function downloadCsvReport(result: DiffResult, meta: ReportMeta): void {
  const csv = reportToCsv(buildReport(result, meta));
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `${reportFileStem(result.header.assemblyNumber, meta.generatedAt)}.csv`);
}

export async function downloadXlsxReport(result: DiffResult, meta: ReportMeta): Promise<void> {
  const buffer = await buildXlsxReport(result, meta);
  downloadBlob(
    new Blob([buffer], { type: XLSX_MIME }),
    `${reportFileStem(result.header.assemblyNumber, meta.generatedAt)}.xlsx`,
  );
}

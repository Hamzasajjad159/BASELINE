import type { RawTable } from '../domain/types';

/** A record is skipped if it is blank or its first cell starts with '#' (template comments). */
export function isSkippableRecord(cells: readonly string[]): boolean {
  const first = (cells[0] ?? '').trimStart();
  return first.startsWith('#') || cells.every((c) => c.trim() === '');
}

/**
 * Build a RawTable from records that carry their source row number.
 * The first non-skippable record is the header row.
 */
export function recordsToTable(
  records: readonly { sourceRow: number; cells: string[] }[],
  parseWarnings: RawTable['parseWarnings'] = [],
): RawTable {
  const table: RawTable = { headers: [], rows: [], sourceRows: [], parseWarnings };
  let headerSeen = false;
  for (const { sourceRow, cells } of records) {
    if (isSkippableRecord(cells)) continue;
    if (!headerSeen) {
      table.headers = cells.map((c) => c.trim());
      headerSeen = true;
      continue;
    }
    const row: Record<string, string> = {};
    table.headers.forEach((h, i) => {
      // Leftmost wins for repeated header names, matching resolveHeaders.
      if (!(h in row)) row[h] = cells[i] ?? '';
    });
    if (
      cells.length > table.headers.length &&
      cells.slice(table.headers.length).some((c) => c.trim())
    ) {
      table.parseWarnings.push({
        sourceRow,
        message: `Row has ${cells.length} cells but the header has ${table.headers.length}; extra cells were ignored.`,
      });
    }
    table.rows.push(row);
    table.sourceRows.push(sourceRow);
  }
  return table;
}

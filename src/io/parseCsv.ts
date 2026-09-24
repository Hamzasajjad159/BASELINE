import Papa from 'papaparse';
import type { RawTable } from '../domain/types';
import { isSkippableRecord, recordsToTable } from './rawTable';

const CANDIDATE_DELIMITERS = [',', ';', '\t'] as const;

/**
 * Pick the delimiter from the header line (the first non-blank, non-comment line).
 * Papaparse's own detection is confused by the template's '#' comment line.
 */
export function detectDelimiter(text: string): string {
  const header = text.split(/\r\n|\n|\r/).find((line) => !isSkippableRecord([line])) ?? '';
  let best: string = ',';
  let bestCount = 0;
  for (const d of CANDIDATE_DELIMITERS) {
    const count = header.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parse CSV text. Every record is kept so that record index + 1 equals the row number
 * a spreadsheet shows; blank and '#'-comment records are skipped afterwards.
 */
export function parseCsvText(input: string): RawTable {
  const text = input.replace(/^\uFEFF/, '');
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: false,
    delimiter: detectDelimiter(text),
  });
  const warnings: RawTable['parseWarnings'] = result.errors.map((e) => ({
    sourceRow: e.row === undefined ? undefined : e.row + 1,
    message: e.message,
  }));
  const records = result.data.map((cells, i) => ({ sourceRow: i + 1, cells }));
  return recordsToTable(records, warnings);
}

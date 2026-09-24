// DiffResult => report tables. Pure: the CSV text and the XLSX sheet data both come from here.
import { toCsv } from './csv';
import { COUNT_KEYS } from './diff';
import type {
  DiffResult,
  FieldChangeType,
  NormalizedRow,
  RowChange,
  ValidationIssue,
} from './types';

export interface ReportFile {
  fileName: string;
  checksum: string;
  /** Data rows in the file. */
  rows: number;
  /** Rows that took part in the comparison (after exclusion and dedupe). */
  rowsCompared: number;
  issues: readonly ValidationIssue[];
}

export interface ReportMeta {
  a: ReportFile;
  b: ReportFile;
  crossFile: readonly ValidationIssue[];
  /** ISO timestamp of report generation. */
  generatedAt: string;
  options: { stripLeadingZeros: boolean; ignoreFields: readonly FieldChangeType[] };
  includeUnchanged: boolean;
}

export type Table = string[][];

export interface ReportTables {
  summary: Table;
  changes: Table;
  warnings: Table;
}

export const CHANGE_COLUMNS = [
  'status',
  'severity',
  'config_change',
  'configuration',
  'part_number',
  'description',
  'parent_a',
  'parent_b',
  'find_number_a',
  'find_number_b',
  'quantity_a',
  'quantity_b',
  'uom_a',
  'uom_b',
  'revision_a',
  'revision_b',
  'change_types',
  'changes',
  'source_row_a',
  'source_row_b',
] as const;

const str = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? '' : String(v);

function describeChanges(c: RowChange): string {
  const parts = c.fields.map((f) => `${f.field}: ${f.before ?? '∅'} → ${f.after ?? '∅'}`);
  if (c.status === 'MOVED') parts.unshift(`parent: ${str(c.fromParent)} → ${str(c.toParent)}`);
  return parts.join('; ');
}

function changeRow(c: RowChange): string[] {
  const a: Partial<NormalizedRow> = c.a ?? {};
  const b: Partial<NormalizedRow> = c.b ?? {};
  const cur = (c.b ?? c.a) as NormalizedRow;
  return [
    c.status,
    str(c.severity),
    str(c.configChange),
    cur.configuration_name,
    cur.part_number,
    cur.description,
    str(a.parent_part_number),
    str(b.parent_part_number),
    str(a.find_number),
    str(b.find_number),
    str(a.quantity),
    str(b.quantity),
    str(a.uom),
    str(b.uom),
    str(a.part_revision),
    str(b.part_revision),
    [...new Set(c.fields.map((f) => f.type))].join(', '),
    describeChanges(c),
    str(a.sourceRow),
    str(b.sourceRow),
  ];
}

export function buildReport(result: DiffResult, meta: ReportMeta): ReportTables {
  const rows = meta.includeUnchanged
    ? result.rows
    : result.rows.filter((c) => c.status !== 'UNCHANGED');
  const { assemblyNumber, assemblyRevision } = result.header;

  const summary: Table = [
    ['Baseline BOM compare report', ''],
    ['Generated at', meta.generatedAt],
    ['Assembly', assemblyNumber],
    ['Assembly revision A', assemblyRevision.a],
    ['Assembly revision B', assemblyRevision.b],
    ['Assembly revision changed', assemblyRevision.changed ? 'yes' : 'no'],
    ['', ''],
  ];
  for (const [label, f] of [
    ['Version A', meta.a],
    ['Version B', meta.b],
  ] as const) {
    summary.push(
      [`${label} file`, f.fileName],
      [`${label} SHA-256`, f.checksum],
      [`${label} rows in file`, String(f.rows)],
      [`${label} rows compared`, String(f.rowsCompared)],
    );
  }
  summary.push(
    ['', ''],
    ['Option: ignore leading zeros', meta.options.stripLeadingZeros ? 'yes' : 'no'],
    [
      'Option: ignored change types',
      meta.options.ignoreFields.length > 0 ? meta.options.ignoreFields.join(', ') : 'none',
    ],
    ['Option: unchanged rows included', meta.includeUnchanged ? 'yes' : 'no'],
    ['', ''],
    ['Change type', 'Count'],
    ...COUNT_KEYS.map((k) => [k, String(result.counts[k])]),
  );

  const warnings: Table = [['source', 'severity', 'code', 'source_row', 'message']];
  const pushIssues = (source: string, issues: readonly ValidationIssue[]) => {
    for (const i of issues) {
      warnings.push([source, i.severity, i.code, str(i.sourceRow), i.message]);
    }
  };
  pushIssues('A', meta.a.issues);
  pushIssues('B', meta.b.issues);
  pushIssues('A+B', meta.crossFile);
  for (const w of result.warnings) warnings.push(['diff', 'warning', w.code, '', w.message]);

  return {
    summary,
    changes: [[...CHANGE_COLUMNS], ...rows.map(changeRow)],
    warnings,
  };
}

/**
 * Single-file CSV: the summary as '#'-prefixed comment lines, then the changes table.
 * The app's own CSV parser skips '#' lines, and spreadsheets show them as plain text rows.
 */
export function reportToCsv(tables: ReportTables): string {
  const comments = tables.summary
    .filter(([k]) => k !== '')
    .map(([k, v]) => `# ${k}${v ? `: ${v.replace(/[\r\n]+/g, ' ')}` : ''}`)
    .join('\r\n');
  return `${comments}\r\n${toCsv(tables.changes)}`;
}

/** File-name-safe stem: bom-compare_ASM-2000_2026-09-24T1805 */
export function reportFileStem(assemblyNumber: string, generatedAt: string): string {
  const safe = assemblyNumber.replace(/[^A-Za-z0-9._-]+/g, '_') || 'bom';
  const stamp = generatedAt.slice(0, 16).replace(/:/g, '');
  return `bom-compare_${safe}_${stamp}`;
}

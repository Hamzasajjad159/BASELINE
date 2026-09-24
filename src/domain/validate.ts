// Per-row, per-file and cross-file validation. Only file-level and cross-file errors block
// the comparison; row-level problems are listed and the user can proceed.
import { dedupe } from './dedupe';
import { matchKey } from './keys';
import {
  DEFAULT_NORMALIZE_OPTIONS,
  normalizeRow,
  parseDate,
  parseDecimal,
  parseInteger,
} from './normalize';
import type { NormalizeOptions } from './normalize';
import { REQUIRED_COLUMNS, getColumn, resolveHeaders, toBomRow } from './template';
import type { HeaderResolution } from './template';
import type { ColumnKey, NormalizedRow, RawTable, Snapshot, ValidationIssue } from './types';

/** B having more than this fraction fewer rows than A suggests an incomplete extraction. */
export const COMPLETENESS_THRESHOLD = 0.02;

/** Rows missing any of these cannot be matched and are excluded from the comparison. */
const KEY_COLUMNS: readonly ColumnKey[] = [
  'configuration_name',
  'parent_part_number',
  'part_number',
];

const EXCEL_SCIENTIFIC = /^\d+(\.\d+)?E\+?\d+$/i;

export interface FileValidation {
  issues: ValidationIssue[];
  /** Normalized, deduplicated rows that take part in the comparison. */
  rows: NormalizedRow[];
  resolution: HeaderResolution;
  /** Data rows in the file (before exclusion and dedupe). */
  dataRowCount: number;
  assemblyNumber: string;
  assemblyRevision: string;
  blocking: boolean;
}

export function isBlocking(issue: ValidationIssue): boolean {
  return issue.severity === 'error' && issue.scope !== 'row';
}

export function hasBlockingIssues(issues: readonly ValidationIssue[]): boolean {
  return issues.some(isBlocking);
}

function fileIssue(
  severity: ValidationIssue['severity'],
  code: string,
  message: string,
): ValidationIssue {
  return { severity, scope: 'file', code, message };
}

function rowIssue(
  severity: ValidationIssue['severity'],
  code: string,
  sourceRow: number,
  message: string,
  column?: ColumnKey,
): ValidationIssue {
  return column === undefined
    ? { severity, scope: 'row', code, sourceRow, message }
    : { severity, scope: 'row', code, sourceRow, message, column };
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values.filter((v) => v !== ''))];
}

function headerIssues(resolution: HeaderResolution): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (resolution.missingRequired.length > 0) {
    issues.push(
      fileIssue(
        'error',
        'MISSING_COLUMNS',
        `Missing required column(s): ${resolution.missingRequired.join(', ')}.`,
      ),
    );
  }
  if (resolution.unknown.length > 0) {
    issues.push(
      fileIssue(
        'info',
        'UNKNOWN_COLUMNS',
        `Ignored unrecognized column(s): ${resolution.unknown.join(', ')}.`,
      ),
    );
  }
  for (const { header, column } of resolution.ignoredDuplicates) {
    issues.push(
      fileIssue(
        'info',
        'DUPLICATE_COLUMN',
        `Column "${header}" was ignored because "${resolution.mapping[column]}" already maps to ${column}.`,
      ),
    );
  }
  return issues;
}

function valueIssues(row: NormalizedRow): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { raw, sourceRow } = row;

  for (const key of REQUIRED_COLUMNS) {
    if (raw[key].trim() === '') {
      const excluded = KEY_COLUMNS.includes(key) ? '; row excluded from the comparison' : '';
      issues.push(rowIssue('error', 'MISSING_VALUE', sourceRow, `Missing ${key}${excluded}.`, key));
    }
  }

  if (raw.quantity.trim() !== '') {
    const qty = parseDecimal(raw.quantity);
    if (qty === null || qty <= 0) {
      issues.push(
        rowIssue(
          'error',
          'BAD_QUANTITY',
          sourceRow,
          `Quantity "${raw.quantity}" must be a number greater than 0.`,
          'quantity',
        ),
      );
    }
  }

  if (raw.level.trim() !== '') {
    const level = parseInteger(raw.level);
    if (level === null || level < 1) {
      issues.push(
        rowIssue(
          'error',
          'BAD_LEVEL',
          sourceRow,
          `Level "${raw.level}" must be a whole number ≥ 1.`,
          'level',
        ),
      );
    }
  }

  if (raw.sequence_number.trim() !== '' && parseInteger(raw.sequence_number) === null) {
    issues.push(
      rowIssue(
        'warning',
        'BAD_SEQUENCE',
        sourceRow,
        `Sequence number "${raw.sequence_number}" is not a whole number.`,
        'sequence_number',
      ),
    );
  }

  for (const key of ['effectivity_start', 'effectivity_end'] as const) {
    const parsed = parseDate(raw[key]);
    if (parsed.error)
      issues.push(rowIssue('error', 'BAD_DATE', sourceRow, `${key}: ${parsed.error}.`, key));
  }
  if (row.effectivity_start && row.effectivity_end && row.effectivity_end < row.effectivity_start) {
    issues.push(
      rowIssue(
        'error',
        'EFFECTIVITY_ORDER',
        sourceRow,
        `effectivity_end ${row.effectivity_end} is before effectivity_start ${row.effectivity_start}.`,
        'effectivity_end',
      ),
    );
  }

  const allowed = getColumn('make_buy').enumValues as readonly string[];
  if (row.make_buy !== null && !allowed.includes(row.make_buy)) {
    issues.push(
      rowIssue(
        'error',
        'BAD_MAKE_BUY',
        sourceRow,
        `make_buy "${raw.make_buy}" must be ${allowed.join(' or ')}.`,
        'make_buy',
      ),
    );
  }

  for (const key of ['part_number', 'parent_part_number'] as const) {
    if (EXCEL_SCIENTIFIC.test(row[key])) {
      issues.push(
        rowIssue(
          'warning',
          'EXCEL_MANGLED',
          sourceRow,
          `${key} "${raw[key]}" looks like Excel converted it to scientific notation. Re-export with the column formatted as Text.`,
          key,
        ),
      );
    }
  }
  return issues;
}

/** Parent must exist in the same configuration, and a child's level must be its parent's + 1. */
function structureIssues(
  rows: readonly NormalizedRow[],
  assemblyNumber: string,
): ValidationIssue[] {
  const levelsByPart = new Map<string, Set<number | null>>();
  const scoped = (r: { configuration_name: string }, part: string) =>
    `${r.configuration_name}\n${part}`;
  for (const r of rows) {
    const k = scoped(r, r.part_number);
    const set = levelsByPart.get(k) ?? new Set<number | null>();
    set.add(r.level);
    levelsByPart.set(k, set);
  }

  const issues: ValidationIssue[] = [];
  for (const r of rows) {
    const isAssembly = r.parent_part_number === assemblyNumber;
    const partLevels = levelsByPart.get(scoped(r, r.parent_part_number));
    if (!isAssembly && !partLevels) {
      issues.push(
        rowIssue(
          'warning',
          'PARENT_NOT_FOUND',
          r.sourceRow,
          `Parent ${r.parent_part_number} does not appear as a part in configuration ${r.configuration_name}.`,
          'parent_part_number',
        ),
      );
      continue;
    }
    if (r.level === null) continue;
    const parentLevels = new Set<number>(isAssembly ? [0] : []);
    for (const l of partLevels ?? []) if (l !== null) parentLevels.add(l);
    if (parentLevels.size > 0 && !parentLevels.has(r.level - 1)) {
      issues.push(
        rowIssue(
          'warning',
          'LEVEL_MISMATCH',
          r.sourceRow,
          `Level ${r.level} does not follow its parent ${r.parent_part_number} (level ${[...parentLevels].join('/')}).`,
          'level',
        ),
      );
    }
  }
  return issues;
}

function duplicateKeyIssues(rows: readonly NormalizedRow[]): ValidationIssue[] {
  const groups = new Map<string, NormalizedRow[]>();
  for (const r of rows) {
    const k = matchKey(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const issues: ValidationIssue[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const first = group[0] as NormalizedRow;
    issues.push(
      rowIssue(
        'warning',
        'DUPLICATE_KEY',
        first.sourceRow,
        `${first.part_number} appears ${group.length} times under ${first.parent_part_number} ` +
          `(configuration ${first.configuration_name}, rows ${group.map((r) => r.sourceRow).join(', ')}); ` +
          'matching will pair them by find number, then by closest values.',
      ),
    );
  }
  return issues;
}

export function validateFile(
  table: RawTable,
  options: NormalizeOptions = DEFAULT_NORMALIZE_OPTIONS,
): FileValidation {
  const resolution = resolveHeaders(table.headers);
  const issues: ValidationIssue[] = [
    ...headerIssues(resolution),
    ...table.parseWarnings.map((w) =>
      w.sourceRow === undefined
        ? fileIssue('warning', 'PARSE_WARNING', w.message)
        : rowIssue('warning', 'PARSE_WARNING', w.sourceRow, w.message),
    ),
  ];
  const result: FileValidation = {
    issues,
    rows: [],
    resolution,
    dataRowCount: table.rows.length,
    assemblyNumber: '',
    assemblyRevision: '',
    blocking: false,
  };

  if (table.rows.length === 0) {
    issues.push(fileIssue('error', 'NO_ROWS', 'The file has no data rows.'));
  }
  if (resolution.missingRequired.length > 0 || table.rows.length === 0) {
    result.blocking = true;
    return result;
  }

  const normalized = table.rows.map((raw, i) =>
    normalizeRow(toBomRow(raw, resolution.mapping), table.sourceRows[i] as number, options),
  );

  const assemblies = distinct(normalized.map((r) => r.assembly_number));
  result.assemblyNumber = assemblies[0] ?? '';
  if (assemblies.length > 1) {
    issues.push(
      fileIssue(
        'error',
        'MULTIPLE_ASSEMBLIES',
        `The file contains more than one assembly_number: ${assemblies.join(', ')}.`,
      ),
    );
  }
  const revisions = distinct(normalized.map((r) => r.assembly_revision));
  result.assemblyRevision = revisions[0] ?? '';
  if (revisions.length > 1) {
    issues.push(
      fileIssue(
        'warning',
        'MULTIPLE_REVISIONS',
        `The file contains more than one assembly_revision: ${revisions.join(', ')}.`,
      ),
    );
  }

  for (const row of normalized) issues.push(...valueIssues(row));

  const usable = normalized.filter((r) => KEY_COLUMNS.every((k) => r[k] !== ''));
  issues.push(...structureIssues(usable, result.assemblyNumber));

  const deduped = dedupe(usable);
  for (const note of deduped.notes) {
    issues.push(
      rowIssue(
        note.kind === 'collapsed' ? 'info' : 'warning',
        note.kind === 'collapsed' ? 'DEDUPE_COLLAPSED' : 'DEDUPE_INCONSISTENT',
        note.sourceRows[0] as number,
        `${note.message} (rows ${note.sourceRows.join(', ')})`,
      ),
    );
  }
  issues.push(...duplicateKeyIssues(deduped.rows));

  result.rows = deduped.rows;
  result.blocking = hasBlockingIssues(issues);
  return result;
}

/** Checks that need both files. */
export function validatePair(a: FileValidation, b: FileValidation): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (a.assemblyNumber && b.assemblyNumber && a.assemblyNumber !== b.assemblyNumber) {
    issues.push({
      severity: 'error',
      scope: 'cross-file',
      code: 'ASSEMBLY_MISMATCH',
      message: `Version A is assembly ${a.assemblyNumber} but Version B is ${b.assemblyNumber}. Both files must describe the same assembly.`,
    });
  }
  if (a.dataRowCount > 0 && b.dataRowCount < a.dataRowCount * (1 - COMPLETENESS_THRESHOLD)) {
    const pct = ((1 - b.dataRowCount / a.dataRowCount) * 100).toFixed(1);
    issues.push({
      severity: 'warning',
      scope: 'cross-file',
      code: 'POSSIBLY_INCOMPLETE',
      message: `Version B has ${pct}% fewer rows than Version A (${b.dataRowCount} vs ${a.dataRowCount}). The extraction may be incomplete.`,
    });
  }
  return issues;
}

export function toSnapshot(
  label: Snapshot['label'],
  fileName: string,
  checksum: string,
  v: FileValidation,
): Snapshot {
  return {
    label,
    fileName,
    checksum,
    assemblyNumber: v.assemblyNumber,
    assemblyRevision: v.assemblyRevision,
    rows: v.rows,
  };
}

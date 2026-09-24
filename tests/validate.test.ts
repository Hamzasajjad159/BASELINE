import { describe, expect, it } from 'vitest';
import {
  hasBlockingIssues,
  isBlocking,
  toSnapshot,
  validateFile,
  validatePair,
} from '../src/domain/validate';
import type { BomRow, ValidationIssue } from '../src/domain/types';
import { table } from './helpers';

const codes = (issues: ValidationIssue[]) => issues.map((i) => i.code);
const one = (rows: Partial<BomRow>[]) => validateFile(table(rows));

describe('validateFile — file level', () => {
  it('accepts a clean file', () => {
    const v = one([{}, { part_number: 'P-2', find_number: '20' }]);
    expect(v.issues).toEqual([]);
    expect(v.blocking).toBe(false);
    expect(v.rows).toHaveLength(2);
    expect(v.dataRowCount).toBe(2);
    expect(v.assemblyNumber).toBe('ASM-1');
    expect(v.assemblyRevision).toBe('A');
  });

  it('blocks on missing required columns (after aliases) and skips row checks', () => {
    const v = validateFile(table([{}], ['assembly_number', 'PN', 'Qty']));
    expect(v.blocking).toBe(true);
    expect(v.rows).toEqual([]);
    expect(v.issues).toHaveLength(1);
    expect(v.issues[0]?.message).toContain('configuration_name');
    expect(v.resolution.missingRequired).not.toContain('part_number');
    expect(v.resolution.missingRequired).not.toContain('quantity');
  });

  it('blocks on zero data rows', () => {
    const v = one([]);
    expect(codes(v.issues)).toEqual(['NO_ROWS']);
    expect(v.blocking).toBe(true);
  });

  it('reports unknown and duplicate columns as info', () => {
    const t = table([{}]);
    t.headers.push('Weight', 'Qty');
    const v = validateFile(t);
    expect(v.issues.map((i) => [i.code, i.severity])).toEqual([
      ['UNKNOWN_COLUMNS', 'info'],
      ['DUPLICATE_COLUMN', 'info'],
    ]);
    expect(v.issues[1]?.message).toBe(
      'Column "Qty" was ignored because "quantity" already maps to quantity.',
    );
    expect(v.blocking).toBe(false);
  });

  it('passes through parse warnings with and without a row', () => {
    const t = table([{}]);
    t.parseWarnings.push({ message: 'file-wide' }, { sourceRow: 2, message: 'bad quote' });
    const v = validateFile(t);
    expect(v.issues.map((i) => [i.code, i.scope, i.sourceRow])).toEqual([
      ['PARSE_WARNING', 'file', undefined],
      ['PARSE_WARNING', 'row', 2],
    ]);
  });

  it('blocks on more than one assembly_number and warns on mixed revisions', () => {
    const v = one([
      {},
      {
        assembly_number: 'ASM-2',
        parent_part_number: 'ASM-2',
        part_number: 'P-2',
        assembly_revision: 'B',
      },
    ]);
    // ASM-2 is not the file's assembly (the first one wins), so its row's parent is unknown too.
    expect(codes(v.issues)).toEqual([
      'MULTIPLE_ASSEMBLIES',
      'MULTIPLE_REVISIONS',
      'PARENT_NOT_FOUND',
    ]);
    expect(v.blocking).toBe(true);
  });

  it('handles files where the assembly fields are blank', () => {
    const v = one([{ assembly_number: '', assembly_revision: '', parent_part_number: 'X' }]);
    expect(v.assemblyNumber).toBe('');
    expect(v.assemblyRevision).toBe('');
    expect(codes(v.issues)).toContain('MISSING_VALUE');
  });
});

describe('validateFile — row level', () => {
  it('flags missing required values; missing key values exclude the row', () => {
    const v = one([{ description: '' }, { part_number: '  ', find_number: '20' }]);
    const missing = v.issues.filter((i) => i.code === 'MISSING_VALUE');
    expect(missing.map((i) => [i.sourceRow, i.column, i.message])).toEqual([
      [2, 'description', 'Missing description.'],
      [3, 'part_number', 'Missing part_number; row excluded from the comparison.'],
    ]);
    expect(v.rows.map((r) => r.sourceRow)).toEqual([2]);
    expect(v.blocking).toBe(false);
  });

  it('reports a blank quantity or level once, as a missing value', () => {
    const v = one([{ quantity: ' ', level: '' }]);
    expect(v.issues.map((i) => [i.code, i.column])).toEqual([
      ['MISSING_VALUE', 'level'],
      ['MISSING_VALUE', 'quantity'],
    ]);
  });

  it('flags bad quantity, level, sequence, dates and make_buy', () => {
    const v = one([
      { quantity: 'abc', level: '0', sequence_number: '1.5', make_buy: 'lease' },
      { part_number: 'P-2', quantity: '0', level: 'x', effectivity_start: '2026-13-01' },
      { part_number: 'P-3', effectivity_start: '2026-06-01', effectivity_end: '2026-01-01' },
      { part_number: 'P-4', effectivity_end: 'someday' },
    ]);
    expect(v.issues.map((i) => [i.sourceRow, i.code, i.severity])).toEqual([
      [2, 'BAD_QUANTITY', 'error'],
      [2, 'BAD_LEVEL', 'error'],
      [2, 'BAD_SEQUENCE', 'warning'],
      [2, 'BAD_MAKE_BUY', 'error'],
      [3, 'BAD_QUANTITY', 'error'],
      [3, 'BAD_LEVEL', 'error'],
      [3, 'BAD_DATE', 'error'],
      [4, 'EFFECTIVITY_ORDER', 'error'],
      [5, 'BAD_DATE', 'error'],
    ]);
    expect(v.blocking).toBe(false);
  });

  it('warns about part numbers Excel turned into scientific notation', () => {
    const v = one([
      { part_number: '1.23457E+11' },
      { parent_part_number: '4E+05', part_number: 'P-2', level: '2' },
    ]);
    const mangled = v.issues.filter((i) => i.code === 'EXCEL_MANGLED');
    expect(mangled.map((i) => [i.sourceRow, i.column])).toEqual([
      [2, 'part_number'],
      [3, 'parent_part_number'],
    ]);
  });

  it('reports dedupe notes and remaining duplicate keys', () => {
    const sub = { parent_part_number: 'SA-1', level: '2' };
    const v = one([
      { part_number: 'SA-1', find_number: '10' },
      { ...sub, part_number: 'C-1', find_number: '1' },
      { ...sub, part_number: 'C-1', find_number: '1' },
      { ...sub, part_number: 'C-2', find_number: '2' },
      { ...sub, part_number: 'C-2', find_number: '2', quantity: '3' },
      { ...sub, part_number: 'C-3', find_number: '3' },
      { ...sub, part_number: 'C-3', find_number: '4' },
    ]);
    expect(v.issues.map((i) => [i.code, i.severity, i.sourceRow])).toEqual([
      ['DEDUPE_COLLAPSED', 'info', 3],
      ['DEDUPE_INCONSISTENT', 'warning', 5],
      ['DUPLICATE_KEY', 'warning', 5],
      ['DUPLICATE_KEY', 'warning', 7],
    ]);
    expect(v.issues[0]?.message).toContain('(rows 3, 4)');
    expect(v.issues[3]?.message).toContain('rows 7, 8');
    expect(v.rows).toHaveLength(6);
  });
});

describe('blocking helpers', () => {
  it('only non-row errors block', () => {
    const row: ValidationIssue = { severity: 'error', scope: 'row', code: 'X', message: '' };
    const file: ValidationIssue = { severity: 'error', scope: 'file', code: 'X', message: '' };
    const warn: ValidationIssue = {
      severity: 'warning',
      scope: 'cross-file',
      code: 'X',
      message: '',
    };
    expect(isBlocking(row)).toBe(false);
    expect(isBlocking(file)).toBe(true);
    expect(isBlocking(warn)).toBe(false);
    expect(hasBlockingIssues([row, warn])).toBe(false);
    expect(hasBlockingIssues([row, file])).toBe(true);
  });
});

describe('validatePair', () => {
  const rows = (n: number, overrides: Partial<BomRow> = {}) =>
    Array.from({ length: n }, (_, i) => ({
      part_number: `P-${i}`,
      find_number: `${i}`,
      ...overrides,
    }));

  it('accepts matching files', () => {
    expect(validatePair(one(rows(100)), one(rows(98)))).toEqual([]);
  });

  it('errors when the assemblies differ', () => {
    const b = one(rows(1, { assembly_number: 'ASM-9', parent_part_number: 'ASM-9' }));
    const issues = validatePair(one(rows(1)), b);
    expect(issues.map((i) => [i.code, i.severity, i.scope])).toEqual([
      ['ASSEMBLY_MISMATCH', 'error', 'cross-file'],
    ]);
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  it('warns when B has more than 2% fewer rows', () => {
    const issues = validatePair(one(rows(100)), one(rows(97)));
    expect(issues.map((i) => i.code)).toEqual(['POSSIBLY_INCOMPLETE']);
    expect(issues[0]?.message).toContain('3.0% fewer rows');
  });

  it('skips checks it cannot make', () => {
    expect(validatePair(one([]), one([]))).toEqual([]);
  });
});

describe('toSnapshot', () => {
  it('copies the validated rows and header', () => {
    const v = one([{}]);
    expect(toSnapshot('A', 'a.csv', 'abc', v)).toEqual({
      label: 'A',
      fileName: 'a.csv',
      checksum: 'abc',
      assemblyNumber: 'ASM-1',
      assemblyRevision: 'A',
      rows: v.rows,
    });
  });
});

describe('validateFile — unusable files', () => {
  it('reports an empty file once', () => {
    const v = validateFile({ headers: [], rows: [], sourceRows: [], parseWarnings: [] });
    expect(v.issues.map((i) => i.code)).toEqual(['EMPTY_FILE']);
    expect(v.blocking).toBe(true);
  });

  it('reports a file whose headers are all unrecognized once, with a sample of them', () => {
    const headers = ['Name', 'Email', 'Phone', 'City', 'Zip', 'Country'];
    const v = validateFile({
      headers,
      rows: [{ Name: 'x' }],
      sourceRows: [2],
      parseWarnings: [],
    });
    expect(v.issues.map((i) => i.code)).toEqual(['NO_RECOGNIZED_COLUMNS']);
    expect(v.issues[0]?.message).toContain('found: Name, Email, Phone, City, Zip, …');
    expect(v.blocking).toBe(true);
  });

  it('lists up to five unrecognized headers without an ellipsis', () => {
    const v = validateFile({
      headers: ['Foo', 'Bar'],
      rows: [],
      sourceRows: [],
      parseWarnings: [],
    });
    expect(v.issues[0]?.message).toContain('found: Foo, Bar)');
    expect(v.issues.map((i) => i.code)).toEqual(['NO_RECOGNIZED_COLUMNS', 'NO_ROWS']);
  });

  it('adds a template hint to missing-column errors', () => {
    const v = validateFile(table([{}], ['part_number']));
    expect(v.issues[0]?.message).toContain('Download the CSV or Excel template');
  });
});

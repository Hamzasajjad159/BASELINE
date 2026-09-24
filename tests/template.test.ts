import { describe, expect, it } from 'vitest';
import {
  COLUMNS,
  COLUMN_KEYS,
  REQUIRED_COLUMNS,
  buildCsvTemplate,
  exampleRow,
  getColumn,
  instructionRows,
  normalizeHeader,
  resolveHeaders,
  toBomRow,
} from '../src/domain/template';

describe('column definitions', () => {
  it('has unique keys and the documented required set', () => {
    expect(new Set(COLUMN_KEYS).size).toBe(COLUMN_KEYS.length);
    expect(REQUIRED_COLUMNS).toEqual([
      'assembly_number',
      'assembly_revision',
      'configuration_name',
      'parent_part_number',
      'level',
      'find_number',
      'part_number',
      'description',
      'quantity',
      'uom',
    ]);
  });

  it('has no alias that collides with another column or alias', () => {
    const seen = new Map<string, string>();
    for (const c of COLUMNS) {
      for (const name of [c.key, ...c.aliases]) {
        const n = normalizeHeader(name);
        expect(seen.get(n), `${name} on ${c.key}`).toBeUndefined();
        seen.set(n, c.key);
      }
    }
  });

  it('getColumn returns the definition', () => {
    expect(getColumn('make_buy').enumValues).toEqual(['MAKE', 'BUY']);
  });
});

describe('normalizeHeader', () => {
  it('ignores case, spaces and punctuation', () => {
    expect(normalizeHeader('Part No.')).toBe('partno');
    expect(normalizeHeader('  make/buy ')).toBe('makebuy');
    expect(normalizeHeader('part_number')).toBe('partnumber');
  });
});

describe('resolveHeaders', () => {
  it('maps canonical headers exactly', () => {
    const r = resolveHeaders([...COLUMN_KEYS]);
    expect(r.missingRequired).toEqual([]);
    expect(r.unknown).toEqual([]);
    expect(r.ignoredDuplicates).toEqual([]);
    expect(r.mapping.part_number).toBe('part_number');
  });

  it('maps aliases case-insensitively', () => {
    const r = resolveHeaders(['PN', 'Qty', 'Make/Buy', 'Item No.', 'Ref Des']);
    expect(r.mapping).toMatchObject({
      part_number: 'PN',
      quantity: 'Qty',
      make_buy: 'Make/Buy',
      find_number: 'Item No.',
      reference_designator: 'Ref Des',
    });
  });

  it('prefers the canonical name over an alias regardless of order', () => {
    const r = resolveHeaders(['Rev', 'part_revision']);
    expect(r.mapping.part_revision).toBe('part_revision');
    expect(r.ignoredDuplicates).toEqual([{ header: 'Rev', column: 'part_revision' }]);
  });

  it('reports unknown headers, ignoring blanks', () => {
    const r = resolveHeaders(['part_number', 'Weight', '']);
    expect(r.unknown).toEqual(['Weight']);
  });

  it('lists missing required columns', () => {
    const r = resolveHeaders(['part_number', 'qty']);
    expect(r.missingRequired).toContain('assembly_number');
    expect(r.missingRequired).not.toContain('part_number');
    expect(r.missingRequired).not.toContain('quantity');
  });

  it('keeps the leftmost of two alias matches', () => {
    const r = resolveHeaders(['Qty', 'QPA']);
    expect(r.mapping.quantity).toBe('Qty');
    expect(r.ignoredDuplicates).toEqual([{ header: 'QPA', column: 'quantity' }]);
  });
});

describe('toBomRow', () => {
  it('projects mapped headers and blanks the rest', () => {
    const row = toBomRow(
      { PN: 'X-1', Qty: '2' },
      { part_number: 'PN', quantity: 'Qty', uom: 'UoM' },
    );
    expect(row.part_number).toBe('X-1');
    expect(row.quantity).toBe('2');
    expect(row.uom).toBe('');
    expect(row.description).toBe('');
    expect(Object.keys(row)).toEqual([...COLUMN_KEYS]);
  });
});

describe('templates', () => {
  it('CSV template has the header and a commented example row', () => {
    const csv = buildCsvTemplate();
    const [header, example, trailing] = csv.split('\r\n');
    expect(header).toBe(COLUMN_KEYS.join(','));
    expect(example?.startsWith('#ASM-1000,')).toBe(true);
    expect(example).toContain('"Bracket, mounting"');
    expect(trailing).toBe('');
  });

  it('example row and instruction rows cover every column', () => {
    expect(exampleRow()).toHaveLength(COLUMN_KEYS.length);
    const rows = instructionRows();
    expect(rows.map((r) => r[0])).toEqual([...COLUMN_KEYS]);
    expect(rows.find((r) => r[0] === 'make_buy')?.[2]).toBe('enum (MAKE / BUY)');
    expect(rows.find((r) => r[0] === 'notes')?.[1]).toBe('no');
  });
});

import { describe, expect, it } from 'vitest';
import {
  MAX_PAIRING_COMPARISONS,
  compareFields,
  countDifferences,
  diff,
  maxSeverity,
  pairGroup,
} from '../src/domain/diff';
import type { BomRow, DiffResult, FieldChange } from '../src/domain/types';
import { norm, snap } from './helpers';

const run = (
  a: Partial<BomRow>[],
  b: Partial<BomRow>[],
  ignoreFields: FieldChange['type'][] = [],
) => diff(snap('A', a), snap('B', b), { ignoreFields });

const statuses = (r: DiffResult) => r.rows.map((c) => [c.status, (c.b ?? c.a)?.part_number]);
const nonZero = (r: DiffResult) =>
  Object.fromEntries(Object.entries(r.counts).filter(([, n]) => n > 0));

describe('diff — unchanged', () => {
  it('reports identical snapshots as unchanged', () => {
    const rows = [{}, { part_number: 'P-2', find_number: '20' }];
    const r = run(rows, rows);
    expect(statuses(r)).toEqual([
      ['UNCHANGED', 'P-1'],
      ['UNCHANGED', 'P-2'],
    ]);
    expect(r.rows.every((c) => c.severity === null && c.fields.length === 0)).toBe(true);
    expect(nonZero(r)).toEqual({ UNCHANGED: 2 });
    expect(r.warnings).toEqual([]);
    expect(r.configs).toEqual([
      { name: 'Default', inA: true, inB: true, status: 'UNCHANGED', changedRows: 0 },
    ]);
    expect(r.header).toEqual({
      assemblyNumber: 'ASM-1',
      assemblyRevision: { a: 'A', b: 'A', changed: false },
    });
  });

  it('treats quantities within 1e-9 as equal', () => {
    expect(run([{ quantity: '2' }], [{ quantity: '2.0000000001' }]).rows[0]?.status).toBe(
      'UNCHANGED',
    );
    expect(run([{ quantity: '2' }], [{ quantity: '2.000001' }]).rows[0]?.status).toBe('CHANGED');
  });
});

describe('diff — field change types', () => {
  const cases: [string, Partial<BomRow>, Partial<BomRow>, FieldChange['type'], string][] = [
    ['quantity', { quantity: '2' }, { quantity: '3' }, 'QTY_CHANGED', 'High'],
    ['uom', { uom: 'EA' }, { uom: 'KG' }, 'UOM_CHANGED', 'High'],
    ['find number', { find_number: '10' }, { find_number: '15' }, 'FIND_NO_CHANGED', 'Medium'],
    [
      'sequence',
      { sequence_number: '10' },
      { sequence_number: '20' },
      'SEQUENCE_CHANGED',
      'Medium',
    ],
    [
      'effectivity',
      { effectivity_start: '2026-01-01' },
      { effectivity_start: '2026-02-01' },
      'EFFECTIVITY_CHANGED',
      'Medium',
    ],
    ['revision', { part_revision: 'A' }, { part_revision: 'B' }, 'REVISION_CHANGED', 'Medium'],
    ['description', { description: 'Bolt' }, { description: 'Screw' }, 'ATTRIBUTE_CHANGED', 'Low'],
    ['item type', { item_type: 'Part' }, { item_type: 'Reference' }, 'ATTRIBUTE_CHANGED', 'Low'],
    ['make/buy', { make_buy: 'BUY' }, { make_buy: 'MAKE' }, 'ATTRIBUTE_CHANGED', 'Low'],
    [
      'ref des',
      { reference_designator: 'R1' },
      { reference_designator: 'R1, R2' },
      'ATTRIBUTE_CHANGED',
      'Low',
    ],
  ];

  for (const [name, before, after, type, severity] of cases) {
    it(`detects a ${name} change as ${type}`, () => {
      const r = run([before], [after]);
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]).toMatchObject({ status: 'CHANGED', severity });
      expect(r.rows[0]?.fields.map((f) => f.type)).toEqual([type]);
      expect(r.counts.CHANGED).toBe(1);
      expect(r.counts[type]).toBe(1);
    });
  }

  it('a find-number change is a change, not a remove plus add', () => {
    const r = run([{ find_number: '10' }], [{ find_number: '15' }]);
    expect(r.counts.ADDED + r.counts.REMOVED).toBe(0);
    expect(r.rows[0]?.fields[0]).toEqual({
      field: 'find_number',
      type: 'FIND_NO_CHANGED',
      before: '10',
      after: '15',
    });
  });

  it('records several field changes on one row and takes the highest severity', () => {
    const r = run(
      [{ description: 'Bolt', part_revision: 'A', quantity: '1', effectivity_start: '2026-01-01' }],
      [
        {
          description: 'Screw',
          part_revision: 'B',
          quantity: '4',
          effectivity_start: '2026-02-01',
          effectivity_end: '2027-01-01',
        },
      ],
    );
    expect(r.rows).toHaveLength(1);
    const change = r.rows[0];
    expect(change?.severity).toBe('High');
    expect(change?.fields.map((f) => [f.field, f.before, f.after])).toEqual([
      ['quantity', '1', '4'],
      ['effectivity_start', '2026-01-01', '2026-02-01'],
      ['effectivity_end', null, '2027-01-01'],
      ['part_revision', 'A', 'B'],
      ['description', 'Bolt', 'Screw'],
    ]);
    // Two effectivity fields still count once for EFFECTIVITY_CHANGED.
    expect(nonZero(r)).toEqual({
      CHANGED: 1,
      QTY_CHANGED: 1,
      EFFECTIVITY_CHANGED: 1,
      REVISION_CHANGED: 1,
      ATTRIBUTE_CHANGED: 1,
    });
  });

  it('compares missing quantities', () => {
    const a = norm({ quantity: 'x' });
    expect(compareFields(a, norm({ quantity: 'y' }))).toEqual([]);
    expect(compareFields(a, norm({ quantity: '1' }))).toEqual([
      { field: 'quantity', type: 'QTY_CHANGED', before: null, after: '1' },
    ]);
  });
});

describe('diff — added, removed, moved', () => {
  it('reports rows only in B as ADDED and only in A as REMOVED', () => {
    const r = run([{ part_number: 'OLD' }], [{ part_number: 'NEW' }]);
    expect(statuses(r)).toEqual([
      ['REMOVED', 'OLD'],
      ['ADDED', 'NEW'],
    ]);
    expect(r.rows.every((c) => c.severity === 'High')).toBe(true);
    expect(nonZero(r)).toEqual({ ADDED: 1, REMOVED: 1 });
  });

  it('collapses a single remove + add of the same part under another parent into MOVED', () => {
    const r = run(
      [
        { part_number: 'SA-1' },
        { part_number: 'SA-2', find_number: '20' },
        { parent_part_number: 'SA-1', part_number: 'C-1', level: '2', quantity: '2' },
      ],
      [
        { part_number: 'SA-1' },
        { part_number: 'SA-2', find_number: '20' },
        { parent_part_number: 'SA-2', part_number: 'C-1', level: '2', quantity: '3' },
      ],
    );
    const moved = r.rows.find((c) => c.status === 'MOVED');
    expect(moved).toMatchObject({ severity: 'High', fromParent: 'SA-1', toParent: 'SA-2' });
    expect(moved?.a?.parent_part_number).toBe('SA-1');
    expect(moved?.b?.parent_part_number).toBe('SA-2');
    expect(moved?.fields.map((f) => f.type)).toEqual(['QTY_CHANGED']);
    expect(nonZero(r)).toEqual({ MOVED: 1, QTY_CHANGED: 1, UNCHANGED: 2 });
  });

  it('keeps ADDED/REMOVED when the move is ambiguous', () => {
    const twoRemoved = run(
      [
        { parent_part_number: 'P1', part_number: 'SCREW' },
        { parent_part_number: 'P2', part_number: 'SCREW' },
      ],
      [{ parent_part_number: 'P3', part_number: 'SCREW' }],
    );
    expect(nonZero(twoRemoved)).toEqual({ REMOVED: 2, ADDED: 1 });

    const twoAdded = run(
      [{ parent_part_number: 'P1', part_number: 'SCREW' }],
      [
        { parent_part_number: 'P2', part_number: 'SCREW' },
        { parent_part_number: 'P3', part_number: 'SCREW' },
      ],
    );
    expect(nonZero(twoAdded)).toEqual({ REMOVED: 1, ADDED: 2 });
  });

  it('does not treat a part changing configuration as a move', () => {
    const r = run(
      [{ configuration_name: 'Alt', part_number: 'X' }, {}],
      [{ part_number: 'X', find_number: '99' }, {}],
    );
    expect(r.rows.some((c) => c.status === 'MOVED')).toBe(false);
  });
});

describe('diff — configurations', () => {
  it('tags rows of added/removed configurations and leaves them out of row counts', () => {
    const r = run(
      [{}, { configuration_name: 'Heavy', part_number: 'H-1' }],
      [
        { quantity: '2' },
        { configuration_name: 'Light', part_number: 'L-1' },
        { configuration_name: 'Light', part_number: 'L-2' },
      ],
    );
    expect(r.rows.map((c) => [c.status, c.configChange])).toEqual([
      ['CHANGED', undefined],
      ['REMOVED', 'CONFIG_REMOVED'],
      ['ADDED', 'CONFIG_ADDED'],
      ['ADDED', 'CONFIG_ADDED'],
    ]);
    expect(nonZero(r)).toEqual({ CHANGED: 1, QTY_CHANGED: 1, CONFIG_ADDED: 1, CONFIG_REMOVED: 1 });
    expect(r.configs).toEqual([
      { name: 'Default', inA: true, inB: true, status: 'CHANGED', changedRows: 1 },
      { name: 'Heavy', inA: true, inB: false, status: 'REMOVED', changedRows: 1 },
      { name: 'Light', inA: false, inB: true, status: 'ADDED', changedRows: 2 },
    ]);
  });
});

describe('diff — duplicate groups', () => {
  it('pairs exact find numbers first, then the closest remaining rows, and warns', () => {
    const r = run(
      [
        { find_number: '10', quantity: '1' },
        { find_number: '20', quantity: '5' },
      ],
      [
        { find_number: '20', quantity: '5' },
        { find_number: '30', quantity: '1' },
      ],
    );
    expect(r.rows.map((c) => [c.status, c.a?.find_number, c.b?.find_number])).toEqual([
      ['CHANGED', '10', '30'],
      ['UNCHANGED', '20', '20'],
    ]);
    expect(r.warnings.map((w) => w.code)).toEqual(['DUPLICATE_GROUP']);
    expect(r.warnings[0]?.message).toContain('2 in A, 2 in B');
    expect(new Set(r.rows.map((c) => c.key)).size).toBe(2);
  });

  it('pairs by fewest differences and leaves the rest unmatched', () => {
    const r = run(
      [
        { find_number: '1', quantity: '9', uom: 'KG' },
        { find_number: '2', quantity: '4' },
      ],
      [{ find_number: '3', quantity: '4' }],
    );
    expect(r.rows.map((c) => [c.status, c.a?.find_number, c.b?.find_number])).toEqual([
      ['CHANGED', '2', '3'],
      ['REMOVED', '1', undefined],
    ]);
  });

  it('warns for duplicates that exist only in B', () => {
    const r = run(
      [{ part_number: 'OTHER' }],
      [{ part_number: 'OTHER' }, { find_number: '1' }, { find_number: '2' }],
    );
    expect(r.warnings[0]?.message).toContain('0 in A, 2 in B');
    expect(nonZero(r)).toEqual({ ADDED: 2, UNCHANGED: 1 });
    expect(r.rows[2]?.key).toMatch(/#2$/);
  });

  it('pairs very large duplicate groups in source order', () => {
    const n = Math.floor(Math.sqrt(MAX_PAIRING_COMPARISONS)) + 1;
    const a = Array.from({ length: n }, (_, i) => norm({ find_number: `a${i}` }, i));
    const b = Array.from({ length: n + 1 }, (_, i) => norm({ find_number: `b${i}` }, i));
    const { pairs, removed, added } = pairGroup(a, b);
    expect(pairs).toHaveLength(n);
    expect(pairs[0]?.[1].find_number).toBe('b0');
    expect(pairs[n - 1]?.[1].find_number).toBe(`b${n - 1}`);
    expect(removed).toEqual([]);
    expect(added.map((r) => r.find_number)).toEqual([`b${n}`]);
  });

  it('pairs very large groups with more A rows than B rows', () => {
    const n = Math.floor(Math.sqrt(MAX_PAIRING_COMPARISONS)) + 2;
    const a = Array.from({ length: n }, (_, i) => norm({ find_number: `a${i}` }, i));
    const b = Array.from({ length: n - 1 }, (_, i) => norm({ find_number: `b${i}` }, i));
    const { removed } = pairGroup(a, b);
    expect(removed.map((r) => r.find_number)).toEqual([`a${n - 1}`]);
  });

  it('countDifferences agrees with compareFields', () => {
    const x = norm({ quantity: '1', description: 'a' });
    const y = norm({ quantity: '2', description: 'b', uom: 'KG' });
    expect(countDifferences(x, y)).toBe(compareFields(x, y).length);
    expect(countDifferences(x, x)).toBe(0);
  });

  it('pairGroup breaks cost ties by source order', () => {
    const a = [norm({ find_number: '1' }, 2), norm({ find_number: '2' }, 3)];
    const b = [norm({ find_number: '3' }, 2), norm({ find_number: '4' }, 3)];
    const { pairs, removed, added } = pairGroup(a, b);
    expect(pairs.map(([x, y]) => [x.find_number, y.find_number])).toEqual([
      ['1', '3'],
      ['2', '4'],
    ]);
    expect(removed).toEqual([]);
    expect(added).toEqual([]);
  });
});

describe('diff — options and header', () => {
  it('ignoreFields drops those change types; a row with nothing left is unchanged', () => {
    const r = run([{ description: 'Bolt' }], [{ description: 'Screw' }], ['ATTRIBUTE_CHANGED']);
    expect(r.rows[0]?.status).toBe('UNCHANGED');
    expect(r.counts.ATTRIBUTE_CHANGED).toBe(0);
  });

  it('a moved row stays MOVED even when its field changes are ignored', () => {
    const r = run(
      [
        { part_number: 'SA-1' },
        { part_number: 'SA-2', find_number: '2' },
        { parent_part_number: 'SA-1', part_number: 'C', level: '2', description: 'x' },
      ],
      [
        { part_number: 'SA-1' },
        { part_number: 'SA-2', find_number: '2' },
        { parent_part_number: 'SA-2', part_number: 'C', level: '2', description: 'y' },
      ],
      ['ATTRIBUTE_CHANGED'],
    );
    const moved = r.rows.find((c) => c.status === 'MOVED');
    expect(moved?.fields).toEqual([]);
  });

  it('reports an assembly revision change in the header, not as a row change', () => {
    const r = diff(
      snap('A', [{}], { assemblyRevision: 'A' }),
      snap('B', [{}], { assemblyRevision: 'B' }),
    );
    expect(r.header.assemblyRevision).toEqual({ a: 'A', b: 'B', changed: true });
    expect(r.rows[0]?.status).toBe('UNCHANGED');
  });

  it('falls back to A for the assembly number', () => {
    const r = diff(snap('A', [{}]), snap('B', [{}], { assemblyNumber: '' }));
    expect(r.header.assemblyNumber).toBe('ASM-1');
  });

  it('maxSeverity picks the highest', () => {
    expect(maxSeverity([])).toBeNull();
    const f = (type: FieldChange['type']): FieldChange => ({
      field: 'quantity',
      type,
      before: null,
      after: null,
    });
    expect(maxSeverity([f('ATTRIBUTE_CHANGED'), f('QTY_CHANGED'), f('REVISION_CHANGED')])).toBe(
      'High',
    );
    expect(maxSeverity([f('ATTRIBUTE_CHANGED'), f('REVISION_CHANGED')])).toBe('Medium');
  });
});

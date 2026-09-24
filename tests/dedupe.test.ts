import { describe, expect, it } from 'vitest';
import { dedupe } from '../src/domain/dedupe';
import { norm } from './helpers';

const child = (sourceRow: number, overrides = {}) =>
  norm({ parent_part_number: 'SA-100', level: '2', part_number: 'C-1', ...overrides }, sourceRow);

describe('dedupe', () => {
  it('leaves unique relationships untouched', () => {
    const rows = [norm({ part_number: 'A' }, 2), norm({ part_number: 'B' }, 3)];
    const r = dedupe(rows);
    expect(r.rows).toEqual(rows);
    expect(r.notes).toEqual([]);
  });

  it('collapses identical repeats of an expanded subassembly', () => {
    const rows = [
      child(3),
      norm({ part_number: 'X' }, 4),
      child(6, { notes: 'different notes are ignored' }),
    ];
    const r = dedupe(rows);
    expect(r.rows.map((x) => [x.part_number, x.sourceRow, x.occurrences])).toEqual([
      ['C-1', 3, 2],
      ['X', 4, 1],
    ]);
    expect(r.notes).toEqual([
      {
        kind: 'collapsed',
        message: 'C-1 (find 10) under SA-100 appears 2 times (expanded subassembly); counted once.',
        sourceRows: [3, 6],
      },
    ]);
  });

  it('keeps and reports repeats that differ', () => {
    const r = dedupe([child(3), child(6, { quantity: '2' })]);
    expect(r.rows.map((x) => x.sourceRow)).toEqual([3, 6]);
    expect(r.notes[0]?.kind).toBe('inconsistent');
    expect(r.notes[0]?.message).toContain('SA-100 is expanded inconsistently');
  });

  it('collapses the identical variants within an inconsistent group', () => {
    const r = dedupe([child(3), child(6, { quantity: '2' }), child(9)]);
    expect(r.rows.map((x) => [x.sourceRow, x.occurrences])).toEqual([
      [3, 2],
      [6, 1],
    ]);
    expect(r.notes[0]).toMatchObject({ kind: 'inconsistent', sourceRows: [3, 6, 9] });
  });

  it('does not merge different find numbers or configurations', () => {
    const r = dedupe([
      child(3),
      child(4, { find_number: '20' }),
      child(5, { configuration_name: 'Alt' }),
    ]);
    expect(r.rows).toHaveLength(3);
    expect(r.notes).toEqual([]);
  });

  it('names non-default configurations and blank find numbers', () => {
    const r = dedupe([
      child(3, { configuration_name: 'Heavy', find_number: '' }),
      child(4, { configuration_name: 'Heavy', find_number: '' }),
    ]);
    expect(r.notes[0]?.message).toBe(
      'C-1 (find —) under SA-100 in configuration Heavy appears 2 times (expanded subassembly); counted once.',
    );
  });
});

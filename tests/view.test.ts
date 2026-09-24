import { describe, expect, it } from 'vitest';
import { diff } from '../src/domain/diff';
import {
  DEFAULT_FILTER,
  current,
  filterRows,
  matchesType,
  parentOptions,
  parentsOf,
} from '../src/domain/view';
import type { RowFilter } from '../src/domain/view';
import { snap } from './helpers';

const result = diff(
  snap('A', [
    { part_number: 'SA-1' },
    { part_number: 'SA-2', find_number: '20' },
    { parent_part_number: 'SA-1', part_number: 'MOVER', level: '2' },
    { part_number: 'SAME', find_number: '30', description: 'Hex bolt' },
    { part_number: 'QTY', find_number: '40', quantity: '1' },
    { part_number: 'GONE', find_number: '50' },
    { configuration_name: 'Old', part_number: 'O-1' },
  ]),
  snap('B', [
    { part_number: 'SA-1' },
    { part_number: 'SA-2', find_number: '20' },
    { parent_part_number: 'SA-2', part_number: 'MOVER', level: '2' },
    { part_number: 'SAME', find_number: '30', description: 'Hex bolt' },
    { part_number: 'QTY', find_number: '40', quantity: '2', description: 'renamed' },
    { part_number: 'NEW', find_number: '60' },
    { configuration_name: 'New', part_number: 'N-1' },
  ]),
);

const parts = (f: Partial<RowFilter>) =>
  filterRows(result.rows, { ...DEFAULT_FILTER, ...f }).map((c) => current(c).part_number);

describe('filterRows', () => {
  it('hides unchanged rows by default', () => {
    expect(parts({})).toEqual(['MOVER', 'QTY', 'GONE', 'O-1', 'NEW', 'N-1']);
  });

  it('shows unchanged rows when asked, or when filtering for UNCHANGED', () => {
    expect(parts({ showUnchanged: true })).toContain('SAME');
    expect(parts({ type: 'UNCHANGED' })).toEqual(['SA-1', 'SA-2', 'SAME']);
  });

  it('filters by row status, field change type and config change', () => {
    expect(parts({ type: 'MOVED' })).toEqual(['MOVER']);
    expect(parts({ type: 'QTY_CHANGED' })).toEqual(['QTY']);
    expect(parts({ type: 'ATTRIBUTE_CHANGED' })).toEqual(['QTY']);
    expect(parts({ type: 'REMOVED' })).toEqual(['GONE']);
    expect(parts({ type: 'ADDED' })).toEqual(['NEW']);
    expect(parts({ type: 'CONFIG_ADDED' })).toEqual(['N-1']);
    expect(parts({ type: 'CONFIG_REMOVED' })).toEqual(['O-1']);
  });

  it('filters by configuration and by parent (either side of a move)', () => {
    expect(parts({ config: 'New' })).toEqual(['N-1']);
    expect(parts({ parent: 'SA-1' })).toEqual(['MOVER']);
    expect(parts({ parent: 'SA-2' })).toEqual(['MOVER']);
  });

  it('searches part numbers and descriptions case-insensitively', () => {
    expect(parts({ search: '  mov ' })).toEqual(['MOVER']);
    expect(parts({ search: 'RENAMED' })).toEqual(['QTY']);
    expect(parts({ search: 'hex', showUnchanged: true })).toEqual(['SAME']);
    expect(parts({ search: 'zzz' })).toEqual([]);
  });
});

describe('search over optional fields', () => {
  it('matches reference designators and tolerates missing revisions', () => {
    const r = diff(
      snap('A', [{ part_revision: '', reference_designator: 'R1' }]),
      snap('B', [{ part_revision: '', reference_designator: 'R1, R9' }]),
    );
    const hit = (search: string) => filterRows(r.rows, { ...DEFAULT_FILTER, search }).length;
    expect(hit('r9')).toBe(1);
    expect(hit('rev-x')).toBe(0);
  });
});

describe('helpers', () => {
  it('parentsOf lists both parents of a move and one otherwise', () => {
    const moved = result.rows.find((c) => c.status === 'MOVED');
    expect(moved && parentsOf(moved)).toEqual(['SA-1', 'SA-2']);
    const removed = result.rows.find((c) => c.status === 'REMOVED' && !c.configChange);
    expect(removed && parentsOf(removed)).toEqual(['ASM-1']);
  });

  it('parentOptions is distinct and sorted', () => {
    expect(parentOptions(result.rows)).toEqual(['ASM-1', 'SA-1', 'SA-2']);
  });

  it('matchesType ALL matches everything', () => {
    expect(result.rows.every((c) => matchesType(c, 'ALL'))).toBe(true);
  });
});

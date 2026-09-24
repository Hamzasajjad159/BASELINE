import { describe, expect, it } from 'vitest';
import { validateFile } from '../src/domain/validate';
import type { BomRow } from '../src/domain/types';
import { table } from './helpers';

const structure = (rows: Partial<BomRow>[]) =>
  validateFile(table(rows))
    .issues.filter((i) => i.code === 'PARENT_NOT_FOUND' || i.code === 'LEVEL_MISMATCH')
    .map((i) => [i.sourceRow, i.code]);

describe('structure checks', () => {
  it('accepts a consistent three-level structure', () => {
    expect(
      structure([
        { part_number: 'SA-1', level: '1' },
        { parent_part_number: 'SA-1', part_number: 'SA-2', level: '2' },
        { parent_part_number: 'SA-2', part_number: 'C-1', level: '3' },
      ]),
    ).toEqual([]);
  });

  it('warns when the parent is not in the same configuration', () => {
    expect(
      structure([
        { part_number: 'SA-1', configuration_name: 'Alt' },
        { parent_part_number: 'SA-1', part_number: 'C-1', level: '2' },
      ]),
    ).toEqual([[3, 'PARENT_NOT_FOUND']]);
  });

  it('warns when a level does not follow its parent', () => {
    expect(
      structure([
        { part_number: 'SA-1', level: '2' },
        { parent_part_number: 'SA-1', part_number: 'C-1', level: '2' },
      ]),
    ).toEqual([
      [2, 'LEVEL_MISMATCH'],
      [3, 'LEVEL_MISMATCH'],
    ]);
  });

  it('accepts any of the levels a reused subassembly appears at', () => {
    expect(
      structure([
        { part_number: 'SA-1', level: '1' },
        { part_number: 'SA-2', level: '1', find_number: '20' },
        { parent_part_number: 'SA-2', part_number: 'SA-1', level: '2' },
        { parent_part_number: 'SA-1', part_number: 'C-1', level: '3' },
        { parent_part_number: 'SA-1', part_number: 'C-1', level: '2' },
      ]),
    ).toEqual([]);
  });

  it('skips the level check when levels are unknown', () => {
    expect(
      structure([
        { part_number: 'SA-1', level: '' },
        { parent_part_number: 'SA-1', part_number: 'C-1', level: '5' },
        { parent_part_number: 'SA-1', part_number: 'C-2', level: '' },
      ]),
    ).toEqual([]);
  });
});

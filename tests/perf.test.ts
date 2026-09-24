import { describe, expect, it } from 'vitest';
import { diff } from '../src/domain/diff';
import { normalizeRow } from '../src/domain/normalize';
import type { Snapshot } from '../src/domain/types';
import { bom } from './helpers';

function big(label: 'A' | 'B', n: number, mutate: (i: number) => boolean): Snapshot {
  const rows = Array.from({ length: n }, (_, i) => {
    const parent = i < 50 ? 'ASM-1' : `SA-${i % 50}`;
    return normalizeRow(
      bom({
        configuration_name: i % 2 ? 'Heavy' : 'Default',
        parent_part_number: parent,
        level: i < 50 ? '1' : '2',
        part_number: i < 50 ? `SA-${i}` : `P-${i}`,
        find_number: String(i),
        quantity: mutate(i) ? '2' : '1',
      }),
      i + 2,
    );
  });
  return {
    label,
    fileName: '',
    checksum: '',
    assemblyNumber: 'ASM-1',
    assemblyRevision: 'A',
    rows,
  };
}

describe('performance', () => {
  it('diffs 5,000 rows in under a second', () => {
    const a = big('A', 5000, () => false);
    const b = big('B', 5000, (i) => i % 10 === 0);
    const t0 = performance.now();
    const r = diff(a, b);
    const elapsed = performance.now() - t0;
    expect(r.counts.CHANGED).toBe(500);
    expect(elapsed).toBeLessThan(1000);
  });
});

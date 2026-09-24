import type { NormalizedRow } from './types';

const SEP = '␟'; // unit-separator symbol: never appears in real BOM data

/** Matching key between A and B: configuration + parent + part. Find number is deliberately excluded. */
export function matchKey(
  row: Pick<NormalizedRow, 'configuration_name' | 'parent_part_number' | 'part_number'>,
): string {
  return [row.configuration_name, row.parent_part_number, row.part_number].join(SEP);
}

/** Dedupe key: the matching key plus find number. */
export function relationKey(
  row: Pick<
    NormalizedRow,
    'configuration_name' | 'parent_part_number' | 'part_number' | 'find_number'
  >,
): string {
  return [matchKey(row), row.find_number].join(SEP);
}

export function splitKey(key: string): string[] {
  return key.split(SEP);
}

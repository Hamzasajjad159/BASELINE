import { COLUMN_KEYS } from '../src/domain/template';
import type { BomRow, NormalizedRow, RawTable } from '../src/domain/types';
import { normalizeRow } from '../src/domain/normalize';

export const BASE: BomRow = {
  assembly_number: 'ASM-1',
  assembly_revision: 'A',
  configuration_name: 'Default',
  parent_part_number: 'ASM-1',
  level: '1',
  find_number: '10',
  sequence_number: '',
  part_number: 'P-1',
  part_revision: 'A',
  description: 'Widget',
  quantity: '1',
  uom: 'EA',
  effectivity_start: '',
  effectivity_end: '',
  item_type: 'Part',
  make_buy: 'BUY',
  reference_designator: '',
  notes: '',
};

export function bom(overrides: Partial<BomRow> = {}): BomRow {
  return { ...BASE, ...overrides };
}

/** Table with canonical headers; data rows start at source row 2. */
export function table(rows: Partial<BomRow>[], headers: readonly string[] = COLUMN_KEYS): RawTable {
  return {
    headers: [...headers],
    rows: rows.map((r) => {
      const full = bom(r);
      return Object.fromEntries(headers.map((h) => [h, (full as Record<string, string>)[h] ?? '']));
    }),
    sourceRows: rows.map((_, i) => i + 2),
    parseWarnings: [],
  };
}

export function norm(overrides: Partial<BomRow> = {}, sourceRow = 2): NormalizedRow {
  return normalizeRow(bom(overrides), sourceRow);
}

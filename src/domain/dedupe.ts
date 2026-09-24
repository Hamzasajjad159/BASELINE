// Collapse repeated expansions of the same subassembly in fully expanded BOM exports.
import { relationKey } from './keys';
import type { NormalizedRow } from './types';

export interface DedupeNote {
  kind: 'collapsed' | 'inconsistent';
  message: string;
  sourceRows: number[];
}

export interface DedupeResult {
  rows: NormalizedRow[];
  notes: DedupeNote[];
}

/** Everything the diff compares, plus level; excludes notes and raw text. */
function signature(r: NormalizedRow): string {
  return JSON.stringify([
    r.level,
    r.sequence_number,
    r.part_revision,
    r.description,
    r.quantity,
    r.uom,
    r.effectivity_start,
    r.effectivity_end,
    r.item_type,
    r.make_buy,
    r.reference_designator,
  ]);
}

function describe(r: NormalizedRow): string {
  const where =
    r.configuration_name === 'Default' ? '' : ` in configuration ${r.configuration_name}`;
  return `${r.part_number} (find ${r.find_number || '—'}) under ${r.parent_part_number}${where}`;
}

/**
 * Group rows by configuration + parent + part + find number. Identical repeats collapse
 * into the first occurrence with `occurrences` = count. Differing repeats are kept, one
 * row per distinct variant, and reported as an inconsistent expansion.
 */
export function dedupe(rows: readonly NormalizedRow[]): DedupeResult {
  const groups = new Map<string, NormalizedRow[]>();
  for (const row of rows) {
    const key = relationKey(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const kept = new Set<NormalizedRow>();
  const replacement = new Map<NormalizedRow, NormalizedRow>();
  const notes: DedupeNote[] = [];

  for (const group of groups.values()) {
    const variants = new Map<string, NormalizedRow[]>();
    for (const row of group) {
      const sig = signature(row);
      const v = variants.get(sig);
      if (v) v.push(row);
      else variants.set(sig, [row]);
    }

    for (const same of variants.values()) {
      const first = same[0] as NormalizedRow;
      kept.add(first);
      if (same.length > 1) {
        replacement.set(first, { ...first, occurrences: same.length });
      }
    }

    if (group.length > 1) {
      const first = group[0] as NormalizedRow;
      const sourceRows = group.map((r) => r.sourceRow);
      notes.push(
        variants.size === 1
          ? {
              kind: 'collapsed',
              message: `${describe(first)} appears ${group.length} times (expanded subassembly); counted once.`,
              sourceRows,
            }
          : {
              kind: 'inconsistent',
              message: `${first.parent_part_number} is expanded inconsistently: ${describe(first)} differs between its ${group.length} occurrences.`,
              sourceRows,
            },
      );
    }
  }

  return {
    rows: rows.filter((r) => kept.has(r)).map((r) => replacement.get(r) ?? r),
    notes,
  };
}

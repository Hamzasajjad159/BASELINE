// Pure view-model helpers for the diff table: filtering, option lists, and search.
import type { ChangeCountKey, NormalizedRow, RowChange } from './types';

export interface RowFilter {
  /** A row status, field change type or config change; 'ALL' for no type filter. */
  type: ChangeCountKey | 'ALL';
  config: string | 'ALL';
  parent: string | 'ALL';
  search: string;
  showUnchanged: boolean;
}

export const DEFAULT_FILTER: RowFilter = {
  type: 'ALL',
  config: 'ALL',
  parent: 'ALL',
  search: '',
  showUnchanged: false,
};

/** The row as it is now (B), or as it was when removed (A). */
export function current(c: RowChange): NormalizedRow {
  return (c.b ?? c.a) as NormalizedRow;
}

export function parentsOf(c: RowChange): string[] {
  const parents = [c.a?.parent_part_number, c.b?.parent_part_number].filter(
    (p): p is string => p !== undefined,
  );
  return [...new Set(parents)];
}

export function matchesType(c: RowChange, type: RowFilter['type']): boolean {
  if (type === 'ALL') return true;
  if (type === 'CONFIG_ADDED' || type === 'CONFIG_REMOVED') return c.configChange === type;
  if (c.configChange) return false;
  if (c.status === type) return true;
  return c.fields.some((f) => f.type === type);
}

function haystack(c: RowChange): string {
  const parts: string[] = [];
  for (const r of [c.a, c.b]) {
    if (!r) continue;
    parts.push(
      r.part_number,
      r.parent_part_number,
      r.description,
      r.find_number,
      r.configuration_name,
      r.part_revision ?? '',
      r.reference_designator ?? '',
    );
  }
  return parts.join('\n').toLowerCase();
}

export function filterRows(rows: readonly RowChange[], f: RowFilter): RowChange[] {
  const needle = f.search.trim().toLowerCase();
  return rows.filter((c) => {
    if (c.status === 'UNCHANGED' && !f.showUnchanged && f.type !== 'UNCHANGED') return false;
    if (!matchesType(c, f.type)) return false;
    if (f.config !== 'ALL' && current(c).configuration_name !== f.config) return false;
    if (f.parent !== 'ALL' && !parentsOf(c).includes(f.parent)) return false;
    if (needle && !haystack(c).includes(needle)) return false;
    return true;
  });
}

/** Distinct, sorted parent part numbers across all rows, for the parent filter. */
export function parentOptions(rows: readonly RowChange[]): string[] {
  return [...new Set(rows.flatMap(parentsOf))].sort();
}

import type { ChangeCountKey, ComparableField, RowStatus, Severity } from '../domain/types';

export const COUNT_LABELS: Record<ChangeCountKey, string> = {
  ADDED: 'Added',
  REMOVED: 'Removed',
  MOVED: 'Moved',
  CHANGED: 'Changed',
  UNCHANGED: 'Unchanged',
  QTY_CHANGED: 'Quantity',
  UOM_CHANGED: 'Unit of measure',
  FIND_NO_CHANGED: 'Find number',
  SEQUENCE_CHANGED: 'Sequence',
  EFFECTIVITY_CHANGED: 'Effectivity',
  REVISION_CHANGED: 'Revision',
  ATTRIBUTE_CHANGED: 'Attributes',
  CONFIG_ADDED: 'Config added',
  CONFIG_REMOVED: 'Config removed',
};

export const FIELD_LABELS: Record<ComparableField, string> = {
  quantity: 'Qty',
  uom: 'UoM',
  find_number: 'Find no.',
  sequence_number: 'Seq.',
  effectivity_start: 'Eff. start',
  effectivity_end: 'Eff. end',
  part_revision: 'Rev',
  description: 'Description',
  item_type: 'Type',
  make_buy: 'Make/buy',
  reference_designator: 'Ref des',
};

/** Row background + badge colors: green = added, red = removed, amber = changed, blue = moved. */
export const STATUS_STYLES: Record<RowStatus, { row: string; badge: string }> = {
  ADDED: { row: 'bg-green-50', badge: 'bg-green-100 text-green-800 ring-green-600/20' },
  REMOVED: { row: 'bg-red-50', badge: 'bg-red-100 text-red-800 ring-red-600/20' },
  CHANGED: { row: 'bg-amber-50', badge: 'bg-amber-100 text-amber-800 ring-amber-600/20' },
  MOVED: { row: 'bg-blue-50', badge: 'bg-blue-100 text-blue-800 ring-blue-600/20' },
  UNCHANGED: { row: 'bg-white', badge: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
};

export const SEVERITY_STYLES: Record<Severity, string> = {
  High: 'text-red-700',
  Medium: 'text-amber-700',
  Low: 'text-slate-500',
};

export function shortHash(hex: string): string {
  return hex.slice(0, 12);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

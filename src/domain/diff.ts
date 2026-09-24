// Pure diff engine: (A, B, options) => DiffResult. No I/O, no React.
import { matchKey } from './keys';
import type {
  ChangeCountKey,
  ComparableField,
  ConfigCompare,
  DiffOptions,
  DiffResult,
  DiffWarning,
  FieldChange,
  FieldChangeType,
  NormalizedRow,
  RowChange,
  Severity,
  Snapshot,
} from './types';

export const QTY_TOLERANCE = 1e-9;

export const FIELD_RULES: readonly { field: ComparableField; type: FieldChangeType }[] = [
  { field: 'quantity', type: 'QTY_CHANGED' },
  { field: 'uom', type: 'UOM_CHANGED' },
  { field: 'find_number', type: 'FIND_NO_CHANGED' },
  { field: 'sequence_number', type: 'SEQUENCE_CHANGED' },
  { field: 'effectivity_start', type: 'EFFECTIVITY_CHANGED' },
  { field: 'effectivity_end', type: 'EFFECTIVITY_CHANGED' },
  { field: 'part_revision', type: 'REVISION_CHANGED' },
  { field: 'description', type: 'ATTRIBUTE_CHANGED' },
  { field: 'item_type', type: 'ATTRIBUTE_CHANGED' },
  { field: 'make_buy', type: 'ATTRIBUTE_CHANGED' },
  { field: 'reference_designator', type: 'ATTRIBUTE_CHANGED' },
];

export const FIELD_SEVERITY: Record<FieldChangeType, Severity> = {
  QTY_CHANGED: 'High',
  UOM_CHANGED: 'High',
  FIND_NO_CHANGED: 'Medium',
  SEQUENCE_CHANGED: 'Medium',
  EFFECTIVITY_CHANGED: 'Medium',
  REVISION_CHANGED: 'Medium',
  ATTRIBUTE_CHANGED: 'Low',
};

const SEVERITY_RANK: Record<Severity, number> = { Low: 1, Medium: 2, High: 3 };

export const COUNT_KEYS: readonly ChangeCountKey[] = [
  'ADDED',
  'REMOVED',
  'MOVED',
  'CHANGED',
  'UNCHANGED',
  'QTY_CHANGED',
  'UOM_CHANGED',
  'FIND_NO_CHANGED',
  'SEQUENCE_CHANGED',
  'EFFECTIVITY_CHANGED',
  'REVISION_CHANGED',
  'ATTRIBUTE_CHANGED',
  'CONFIG_ADDED',
  'CONFIG_REMOVED',
];

export const DEFAULT_DIFF_OPTIONS: DiffOptions = { ignoreFields: [] };

function display(row: NormalizedRow, field: ComparableField): string | null {
  const v = row[field];
  return v === null ? null : String(v);
}

function fieldEqual(a: NormalizedRow, b: NormalizedRow, field: ComparableField): boolean {
  if (field === 'quantity') {
    if (a.quantity === null || b.quantity === null) return a.quantity === b.quantity;
    return Math.abs(a.quantity - b.quantity) <= QTY_TOLERANCE;
  }
  return a[field] === b[field];
}

/** Field-level differences between two rows, skipping ignored change types. */
export function compareFields(
  a: NormalizedRow,
  b: NormalizedRow,
  ignore: ReadonlySet<FieldChangeType> = new Set(),
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const { field, type } of FIELD_RULES) {
    if (ignore.has(type) || fieldEqual(a, b, field)) continue;
    changes.push({ field, type, before: display(a, field), after: display(b, field) });
  }
  return changes;
}

/** Allocation-free count of differing fields, used as the pairing cost. */
export function countDifferences(a: NormalizedRow, b: NormalizedRow): number {
  let n = 0;
  for (const { field } of FIELD_RULES) if (!fieldEqual(a, b, field)) n += 1;
  return n;
}

/**
 * Closest-values pairing compares every remaining A row with every remaining B row.
 * Beyond this many comparisons (e.g. one part repeated 500+ times under one parent)
 * the remaining rows are paired in source order instead, to keep the diff fast.
 */
export const MAX_PAIRING_COMPARISONS = 250_000;

export function maxSeverity(fields: readonly FieldChange[]): Severity | null {
  let best: Severity | null = null;
  for (const f of fields) {
    const s = FIELD_SEVERITY[f.type];
    if (best === null || SEVERITY_RANK[s] > SEVERITY_RANK[best]) best = s;
  }
  return best;
}

function groupByKey(rows: readonly NormalizedRow[]): Map<string, NormalizedRow[]> {
  const groups = new Map<string, NormalizedRow[]>();
  for (const r of rows) {
    const k = matchKey(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  return groups;
}

interface Pairing {
  pairs: [NormalizedRow, NormalizedRow][];
  removed: NormalizedRow[];
  added: NormalizedRow[];
}

/**
 * Pair rows that share a matching key. Exact find_number matches first, then the remaining
 * rows by fewest differing fields, with source order as the tie-break.
 */
export function pairGroup(
  aRows: readonly NormalizedRow[],
  bRows: readonly NormalizedRow[],
): Pairing {
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const matched: [number, number][] = [];

  aRows.forEach((a, i) => {
    const j = bRows.findIndex((b, jj) => !usedB.has(jj) && b.find_number === a.find_number);
    if (j !== -1) {
      usedA.add(i);
      usedB.add(j);
      matched.push([i, j]);
    }
  });

  const restA = aRows.map((_, i) => i).filter((i) => !usedA.has(i));
  const restB = bRows.map((_, j) => j).filter((j) => !usedB.has(j));
  if (restA.length * restB.length > MAX_PAIRING_COMPARISONS) {
    restA.forEach((i, k) => {
      const j = restB[k];
      if (j === undefined) return;
      usedA.add(i);
      usedB.add(j);
      matched.push([i, j]);
    });
  } else {
    const candidates: { cost: number; i: number; j: number }[] = [];
    for (const i of restA) {
      for (const j of restB) {
        candidates.push({
          cost: countDifferences(aRows[i] as NormalizedRow, bRows[j] as NormalizedRow),
          i,
          j,
        });
      }
    }
    candidates.sort((x, y) => x.cost - y.cost || x.i - y.i || x.j - y.j);
    for (const { i, j } of candidates) {
      if (usedA.has(i) || usedB.has(j)) continue;
      usedA.add(i);
      usedB.add(j);
      matched.push([i, j]);
    }
  }

  matched.sort((x, y) => x[0] - y[0]);
  return {
    pairs: matched.map(([i, j]) => [aRows[i], bRows[j]] as [NormalizedRow, NormalizedRow]),
    removed: aRows.filter((_, i) => !usedA.has(i)),
    added: bRows.filter((_, j) => !usedB.has(j)),
  };
}

function configNames(rows: readonly NormalizedRow[]): string[] {
  return [...new Set(rows.map((r) => r.configuration_name))];
}

/** Collapse one REMOVED + one ADDED of the same part (same config, different parent) into MOVED. */
function detectMoves(changes: RowChange[], ignore: ReadonlySet<FieldChangeType>): RowChange[] {
  const byPart = new Map<string, { removed: RowChange[]; added: RowChange[] }>();
  for (const c of changes) {
    if (c.configChange || (c.status !== 'ADDED' && c.status !== 'REMOVED')) continue;
    const row = (c.a ?? c.b) as NormalizedRow;
    const k = `${row.configuration_name}\n${row.part_number}`;
    const entry = byPart.get(k) ?? { removed: [], added: [] };
    (c.status === 'REMOVED' ? entry.removed : entry.added).push(c);
    byPart.set(k, entry);
  }

  const replaced = new Map<RowChange, RowChange | null>();
  for (const { removed, added } of byPart.values()) {
    if (removed.length !== 1 || added.length !== 1) continue;
    const rem = removed[0] as RowChange;
    const add = added[0] as RowChange;
    const a = rem.a as NormalizedRow;
    const b = add.b as NormalizedRow;
    const fields = compareFields(a, b, ignore);
    replaced.set(rem, {
      key: `${matchKey(a)}→${b.parent_part_number}`,
      status: 'MOVED',
      severity: 'High',
      a,
      b,
      fields,
      fromParent: a.parent_part_number,
      toParent: b.parent_part_number,
    });
    replaced.set(add, null);
  }

  const out: RowChange[] = [];
  for (const c of changes) {
    const r = replaced.get(c);
    if (r === undefined) out.push(c);
    else if (r !== null) out.push(r);
  }
  return out;
}

function emptyCounts(): Record<ChangeCountKey, number> {
  return Object.fromEntries(COUNT_KEYS.map((k) => [k, 0])) as Record<ChangeCountKey, number>;
}

export function diff(
  a: Snapshot,
  b: Snapshot,
  options: DiffOptions = DEFAULT_DIFF_OPTIONS,
): DiffResult {
  const ignore = new Set(options.ignoreFields);
  const configsA = configNames(a.rows);
  const configsB = configNames(b.rows);
  const setA = new Set(configsA);
  const setB = new Set(configsB);

  const groupsA = groupByKey(a.rows);
  const groupsB = groupByKey(b.rows);
  const keys = [...new Set([...groupsA.keys(), ...groupsB.keys()])];

  const warnings: DiffWarning[] = [];
  let changes: RowChange[] = [];

  for (const key of keys) {
    const aRows = groupsA.get(key) ?? [];
    const bRows = groupsB.get(key) ?? [];
    if (aRows.length > 1 || bRows.length > 1) {
      const sample = (aRows[0] ?? bRows[0]) as NormalizedRow;
      warnings.push({
        code: 'DUPLICATE_GROUP',
        key,
        message:
          `${sample.part_number} appears more than once under ${sample.parent_part_number} ` +
          `(configuration ${sample.configuration_name}: ${aRows.length} in A, ${bRows.length} in B); ` +
          'rows were paired by find number, then by closest values.',
      });
    }

    const { pairs, removed, added } = pairGroup(aRows, bRows);
    for (const [ra, rb] of pairs) {
      const fields = compareFields(ra, rb, ignore);
      changes.push({
        key,
        status: fields.length > 0 ? 'CHANGED' : 'UNCHANGED',
        severity: maxSeverity(fields),
        a: ra,
        b: rb,
        fields,
      });
    }
    for (const ra of removed) {
      const change: RowChange = { key, status: 'REMOVED', severity: 'High', a: ra, fields: [] };
      if (!setB.has(ra.configuration_name)) change.configChange = 'CONFIG_REMOVED';
      changes.push(change);
    }
    for (const rb of added) {
      const change: RowChange = { key, status: 'ADDED', severity: 'High', b: rb, fields: [] };
      if (!setA.has(rb.configuration_name)) change.configChange = 'CONFIG_ADDED';
      changes.push(change);
    }
  }

  changes = detectMoves(changes, ignore);

  // Keys must be unique per row; duplicate groups get an occurrence suffix.
  const seen = new Map<string, number>();
  for (const c of changes) {
    const n = seen.get(c.key) ?? 0;
    seen.set(c.key, n + 1);
    if (n > 0) c.key = `${c.key}#${n + 1}`;
  }

  const counts = emptyCounts();
  const configStats = new Map<string, number>();
  for (const c of changes) {
    const config = ((c.b ?? c.a) as NormalizedRow).configuration_name;
    if (c.status !== 'UNCHANGED') configStats.set(config, (configStats.get(config) ?? 0) + 1);
    if (c.configChange) continue;
    counts[c.status] += 1;
    for (const type of new Set(c.fields.map((f) => f.type))) counts[type] += 1;
  }

  const configs: ConfigCompare[] = [...new Set([...configsA, ...configsB])].map((name) => {
    const inA = setA.has(name);
    const inB = setB.has(name);
    const changedRows = configStats.get(name) ?? 0;
    const status: ConfigCompare['status'] = !inA
      ? 'ADDED'
      : !inB
        ? 'REMOVED'
        : changedRows > 0
          ? 'CHANGED'
          : 'UNCHANGED';
    if (status === 'ADDED') counts.CONFIG_ADDED += 1;
    if (status === 'REMOVED') counts.CONFIG_REMOVED += 1;
    return { name, inA, inB, status, changedRows };
  });

  return {
    header: {
      assemblyNumber: b.assemblyNumber || a.assemblyNumber,
      assemblyRevision: {
        a: a.assemblyRevision,
        b: b.assemblyRevision,
        changed: a.assemblyRevision !== b.assemblyRevision,
      },
    },
    configs,
    rows: changes,
    counts,
    warnings,
  };
}

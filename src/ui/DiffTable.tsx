import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { COUNT_KEYS } from '../domain/diff';
import type { ComparableField, FieldChangeType, RowChange } from '../domain/types';
import { current } from '../domain/view';
import type { RowFilter } from '../domain/view';
import Delta from './Delta';
import { COUNT_LABELS, FIELD_LABELS, SEVERITY_STYLES, STATUS_STYLES } from './labels';

const GRID =
  'grid grid-cols-[7.5rem_7rem_9rem_6rem_9rem_minmax(10rem,1fr)_minmax(12rem,1.3fr)] gap-x-3';

/** Fields that have their own column; the rest are listed under "Changed fields". */
const OWN_COLUMN: ReadonlySet<ComparableField> = new Set(['find_number', 'description']);

const IGNORABLE: FieldChangeType[] = [
  'ATTRIBUTE_CHANGED',
  'REVISION_CHANGED',
  'EFFECTIVITY_CHANGED',
  'SEQUENCE_CHANGED',
  'FIND_NO_CHANGED',
];

interface DiffTableProps {
  rows: readonly RowChange[];
  totalRows: number;
  /** True when the comparison found no differences at all (not just none after filtering). */
  noDifferences: boolean;
  filter: RowFilter;
  onFilter: (f: RowFilter) => void;
  configs: readonly string[];
  parents: readonly string[];
  ignoreFields: readonly FieldChangeType[];
  onIgnoreFields: (f: FieldChangeType[]) => void;
  onOpen: (row: RowChange) => void;
}

function fieldChange(row: RowChange, field: ComparableField) {
  return row.fields.find((f) => f.field === field);
}

function StatusBadge({ row }: { row: RowChange }) {
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span
        className={`rounded px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[row.status].badge}`}
      >
        {row.status.toLowerCase()}
      </span>
      {row.configChange ? (
        <span className="text-[11px] text-slate-500">whole config</span>
      ) : (
        row.severity && (
          <span className={`text-[11px] ${SEVERITY_STYLES[row.severity]}`}>{row.severity}</span>
        )
      )}
    </span>
  );
}

function Row({ row }: { row: RowChange }) {
  const r = current(row);
  const find = fieldChange(row, 'find_number');
  const desc = fieldChange(row, 'description');
  const others = row.fields.filter((f) => !OWN_COLUMN.has(f.field));
  return (
    <>
      <StatusBadge row={row} />
      <span className="truncate" title={r.configuration_name}>
        {r.configuration_name}
      </span>
      <span className="truncate font-mono text-xs leading-5">
        {row.status === 'MOVED' ? (
          <Delta before={row.fromParent ?? null} after={row.toParent ?? null} />
        ) : (
          r.parent_part_number
        )}
      </span>
      <span className="font-mono text-xs leading-5">
        {find ? <Delta before={find.before} after={find.after} /> : r.find_number}
      </span>
      <span className="truncate font-mono text-xs leading-5 font-semibold" title={r.part_number}>
        {r.part_number}
      </span>
      <span className="min-w-0">
        {desc ? <Delta before={desc.before} after={desc.after} /> : r.description}
      </span>
      <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {others.map((f) => (
          <span key={f.field}>
            <span className="text-slate-500">{FIELD_LABELS[f.field]}: </span>
            <Delta before={f.before} after={f.after} />
          </span>
        ))}
        {r.occurrences > 1 && <span className="text-slate-500">×{r.occurrences} expanded</span>}
      </span>
    </>
  );
}

const selectClass = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-sm';

export default function DiffTable(props: DiffTableProps) {
  const {
    rows,
    totalRows,
    noDifferences,
    filter,
    onFilter,
    configs,
    parents,
    ignoreFields,
    onIgnoreFields,
    onOpen,
  } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  // React Compiler is not used here, so its memoization warning for this hook does not apply.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 48,
    overscan: 12,
  });
  const set = (patch: Partial<RowFilter>) => onFilter({ ...filter, ...patch });

  const onKey = (e: KeyboardEvent, row: RowChange) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(row);
    }
  };

  return (
    <section aria-label="Changes" className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
        <h2 className="mr-2 self-center font-semibold">Changes</h2>
        <label className="flex flex-col text-xs text-slate-600">
          Change type
          <select
            className={selectClass}
            value={filter.type}
            onChange={(e) => set({ type: e.target.value as RowFilter['type'] })}
          >
            <option value="ALL">All changes</option>
            {COUNT_KEYS.map((k) => (
              <option key={k} value={k}>
                {COUNT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-600">
          Configuration
          <select
            className={selectClass}
            value={filter.config}
            onChange={(e) => set({ config: e.target.value })}
          >
            <option value="ALL">All</option>
            {configs.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-600">
          Parent
          <select
            className={selectClass}
            value={filter.parent}
            onChange={(e) => set({ parent: e.target.value })}
          >
            <option value="ALL">All</option>
            {parents.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-600">
          Search
          <input
            type="search"
            placeholder="Part, description, find no…"
            className={`${selectClass} w-56`}
            value={filter.search}
            onChange={(e) => set({ search: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-1.5 self-center text-sm">
          <input
            type="checkbox"
            checked={filter.showUnchanged}
            onChange={(e) => set({ showUnchanged: e.target.checked })}
          />
          Show unchanged
        </label>
        <details className="relative self-center text-sm">
          <summary className="cursor-pointer text-sky-700 select-none">
            Ignore{ignoreFields.length > 0 ? ` (${ignoreFields.length})` : ''}…
          </summary>
          <div className="absolute z-10 mt-1 w-56 space-y-1 rounded-md border border-slate-200 bg-white p-3 shadow-lg">
            {IGNORABLE.map((t) => (
              <label key={t} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ignoreFields.includes(t)}
                  onChange={(e) =>
                    onIgnoreFields(
                      e.target.checked ? [...ignoreFields, t] : ignoreFields.filter((x) => x !== t),
                    )
                  }
                />
                {COUNT_LABELS[t]} changes
              </label>
            ))}
          </div>
        </details>
        <span className="ml-auto self-center text-sm text-slate-500">
          {rows.length} of {totalRows} rows
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[64rem]">
          <div
            role="row"
            className={`${GRID} border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500`}
          >
            <span>Status</span>
            <span>Configuration</span>
            <span>Parent</span>
            <span>Find no.</span>
            <span>Part number</span>
            <span>Description</span>
            <span>Changed fields</span>
          </div>
          {rows.length === 0 ? (
            noDifferences ? (
              <div className="p-8 text-center">
                <p className="font-medium text-green-800">
                  No differences found: Version B matches Version A.
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {ignoreFields.length > 0
                    ? 'Some change types are being ignored. Clear "Ignore…" to check them too.'
                    : 'Turn on "Show unchanged" to browse every row.'}
                </p>
              </div>
            ) : (
              <p className="p-8 text-center text-sm text-slate-500">
                No rows match these filters.
                {!filter.showUnchanged && ' Turn on "Show unchanged" to see every row.'}
              </p>
            )
          ) : (
            <div ref={scrollRef} role="rowgroup" className="max-h-[70vh] overflow-y-auto">
              <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map((v) => {
                  const row = rows[v.index] as RowChange;
                  return (
                    <div
                      key={row.key}
                      ref={virtualizer.measureElement}
                      data-index={v.index}
                      role="row"
                      tabIndex={0}
                      onClick={() => onOpen(row)}
                      onKeyDown={(e) => onKey(e, row)}
                      className={`${GRID} absolute inset-x-0 cursor-pointer items-start border-b border-slate-100 px-4 py-2 text-sm hover:brightness-95 focus:outline-2 focus:outline-sky-500 ${STATUS_STYLES[row.status].row}`}
                      style={{ transform: `translateY(${v.start}px)` }}
                    >
                      <Row row={row} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

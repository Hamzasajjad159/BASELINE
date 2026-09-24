import { useEffect, useRef } from 'react';
import { COLUMN_KEYS } from '../domain/template';
import type { ColumnKey, NormalizedRow, RowChange } from '../domain/types';
import { current } from '../domain/view';
import { COUNT_LABELS, STATUS_STYLES } from './labels';

interface RowDetailDrawerProps {
  row: RowChange | null;
  onClose: () => void;
}

function cell(r: NormalizedRow | undefined, key: ColumnKey): string {
  if (!r) return '';
  return r.raw[key];
}

export default function RowDetailDrawer({ row, onClose }: RowDetailDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!row) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [row, onClose]);

  if (!row) return null;
  const r = current(row);
  const changed = new Set<string>(row.fields.map((f) => f.field));
  if (row.status === 'MOVED') changed.add('parent_part_number').add('level');

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      <button
        type="button"
        aria-label="Close details"
        className="absolute inset-0 cursor-default bg-slate-900/30"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[row.status].badge}`}
              >
                {row.status.toLowerCase()}
              </span>
              {row.configChange && (
                <span className="text-xs text-slate-500">{COUNT_LABELS[row.configChange]}</span>
              )}
              {row.severity && (
                <span className="text-xs text-slate-500">{row.severity} severity</span>
              )}
            </div>
            <h2 id="drawer-title" className="mt-1 font-mono text-lg font-semibold">
              {r.part_number}
            </h2>
            <p className="text-sm text-slate-600">
              {r.description} · {r.configuration_name}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
          >
            Close ✕
          </button>
        </header>
        <div className="overflow-y-auto p-4">
          <table className="w-full table-fixed text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="w-44 py-1 font-medium">Column</th>
                <th className="py-1 font-medium">
                  Version A {row.a && <span className="font-normal">(row {row.a.sourceRow})</span>}
                </th>
                <th className="py-1 font-medium">
                  Version B {row.b && <span className="font-normal">(row {row.b.sourceRow})</span>}
                </th>
              </tr>
            </thead>
            <tbody>
              {COLUMN_KEYS.map((key) => {
                const hit = changed.has(key);
                return (
                  <tr key={key} className={`border-t border-slate-100 ${hit ? 'bg-amber-50' : ''}`}>
                    <td className="py-1.5 pr-2 font-mono text-xs text-slate-600">{key}</td>
                    <td
                      className={`py-1.5 pr-2 break-words ${hit ? 'text-slate-500 line-through' : ''}`}
                    >
                      {row.a ? cell(row.a, key) || <span className="text-slate-300">—</span> : ''}
                    </td>
                    <td className={`py-1.5 break-words ${hit ? 'font-medium' : ''}`}>
                      {row.b ? cell(row.b, key) || <span className="text-slate-300">—</span> : ''}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-slate-100 text-slate-500">
                <td className="py-1.5 font-mono text-xs">expanded copies</td>
                <td>{row.a?.occurrences ?? ''}</td>
                <td>{row.b?.occurrences ?? ''}</td>
              </tr>
            </tbody>
          </table>
          {!row.a && <p className="mt-3 text-sm text-slate-500">Not present in Version A.</p>}
          {!row.b && <p className="mt-3 text-sm text-slate-500">Not present in Version B.</p>}
          <p className="mt-4 text-xs text-slate-500">
            Values are shown as they appear in the files. Highlighted rows differ after
            normalization (trimmed, uppercased identifiers, leading zeros removed).
          </p>
        </div>
      </aside>
    </div>
  );
}

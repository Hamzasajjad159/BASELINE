import type { ChangeCountKey, DiffResult } from '../domain/types';
import type { RowFilter } from '../domain/view';
import { COUNT_LABELS } from './labels';

const GROUPS: { title: string; keys: ChangeCountKey[] }[] = [
  { title: 'Rows', keys: ['ADDED', 'REMOVED', 'MOVED', 'CHANGED', 'UNCHANGED'] },
  {
    title: 'Field changes',
    keys: [
      'QTY_CHANGED',
      'UOM_CHANGED',
      'FIND_NO_CHANGED',
      'SEQUENCE_CHANGED',
      'EFFECTIVITY_CHANGED',
      'REVISION_CHANGED',
      'ATTRIBUTE_CHANGED',
    ],
  },
  { title: 'Configurations', keys: ['CONFIG_ADDED', 'CONFIG_REMOVED'] },
];

const ACCENT: Partial<Record<ChangeCountKey, string>> = {
  ADDED: 'border-l-green-500',
  REMOVED: 'border-l-red-500',
  MOVED: 'border-l-blue-500',
  CHANGED: 'border-l-amber-500',
  UNCHANGED: 'border-l-slate-300',
};

interface SummaryCardsProps {
  result: DiffResult;
  active: RowFilter['type'];
  onSelect: (type: RowFilter['type']) => void;
}

export default function SummaryCards({ result, active, onSelect }: SummaryCardsProps) {
  const { assemblyNumber, assemblyRevision } = result.header;
  return (
    <section aria-label="Summary" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold">Summary — {assemblyNumber}</h2>
        <p className="text-sm text-slate-600">
          Assembly revision{' '}
          {assemblyRevision.changed ? (
            <span className="font-medium text-amber-800">
              <s className="text-slate-500">{assemblyRevision.a || '—'}</s> →{' '}
              {assemblyRevision.b || '—'}
            </span>
          ) : (
            <span className="font-medium">{assemblyRevision.a || '—'} (unchanged)</span>
          )}
        </p>
      </div>
      {GROUPS.map((g) => (
        <div key={g.title}>
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {g.title}
          </h3>
          <div className="flex flex-wrap gap-2">
            {g.keys.map((k) => {
              const n = result.counts[k];
              const selected = active === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(selected ? 'ALL' : k)}
                  className={`min-w-28 rounded-md border border-l-4 bg-white px-3 py-2 text-left shadow-sm transition ${
                    ACCENT[k] ?? 'border-l-slate-400'
                  } ${selected ? 'ring-2 ring-sky-500' : 'hover:bg-slate-50'} ${
                    n === 0 ? 'opacity-60' : ''
                  }`}
                >
                  <div className="text-2xl font-semibold tabular-nums">{n}</div>
                  <div className="text-xs text-slate-600">{COUNT_LABELS[k]}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

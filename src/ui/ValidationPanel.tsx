import { useState } from 'react';
import { isBlocking } from '../domain/validate';
import type { FileValidation } from '../domain/validate';
import type { IssueSeverity, ValidationIssue } from '../domain/types';

const SEVERITY_ORDER: IssueSeverity[] = ['error', 'warning', 'info'];

const SEVERITY_STYLE: Record<IssueSeverity, { dot: string; text: string; label: string }> = {
  error: { dot: 'bg-red-500', text: 'text-red-800', label: 'Errors' },
  warning: { dot: 'bg-amber-500', text: 'text-amber-800', label: 'Warnings' },
  info: { dot: 'bg-sky-500', text: 'text-sky-800', label: 'Info' },
};

const INITIAL_LIMIT = 50;

function countBy(issues: readonly ValidationIssue[]): Record<IssueSeverity, number> {
  const counts: Record<IssueSeverity, number> = { error: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity] += 1;
  return counts;
}

function Counts({ issues }: { issues: readonly ValidationIssue[] }) {
  const counts = countBy(issues);
  return (
    <span className="flex gap-3 text-xs">
      {SEVERITY_ORDER.map((s) => (
        <span key={s} className={`flex items-center gap-1 ${SEVERITY_STYLE[s].text}`}>
          <span className={`h-2 w-2 rounded-full ${SEVERITY_STYLE[s].dot}`} />
          {counts[s]} {SEVERITY_STYLE[s].label.toLowerCase()}
        </span>
      ))}
    </span>
  );
}

function IssueList({ issues }: { issues: readonly ValidationIssue[] }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = [...issues].sort(
    (x, y) =>
      SEVERITY_ORDER.indexOf(x.severity) - SEVERITY_ORDER.indexOf(y.severity) ||
      (x.sourceRow ?? 0) - (y.sourceRow ?? 0),
  );
  const shown = showAll ? sorted : sorted.slice(0, INITIAL_LIMIT);

  if (issues.length === 0) return <p className="text-sm text-green-700">No problems found.</p>;
  return (
    <>
      <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 text-sm">
        {shown.map((i, idx) => (
          <li key={idx} className="flex gap-2">
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_STYLE[i.severity].dot}`}
              aria-label={i.severity}
            />
            <span>
              {i.sourceRow !== undefined && (
                <span className="mr-1 font-mono text-xs text-slate-500">row {i.sourceRow}</span>
              )}
              {isBlocking(i) && <span className="mr-1 font-semibold text-red-700">Blocking:</span>}
              {i.message}
            </span>
          </li>
        ))}
      </ul>
      {sorted.length > INITIAL_LIMIT && (
        <button
          type="button"
          className="mt-2 text-sm text-sky-700 hover:underline"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? 'Show fewer' : `Show all ${sorted.length}`}
        </button>
      )}
    </>
  );
}

interface ValidationPanelProps {
  a: FileValidation | null;
  b: FileValidation | null;
  crossFile: readonly ValidationIssue[];
}

export default function ValidationPanel({ a, b, crossFile }: ValidationPanelProps) {
  if (!a && !b) return null;
  const all = [...(a?.issues ?? []), ...(b?.issues ?? []), ...crossFile];

  return (
    <section aria-label="Validation" className="rounded-lg border border-slate-200 bg-white">
      {crossFile.length > 0 && (
        <div className="space-y-2 p-4 pb-0">
          {crossFile.map((i) => (
            <div
              key={i.code}
              role={i.severity === 'error' ? 'alert' : 'status'}
              className={`rounded-md border px-3 py-2 text-sm ${
                i.severity === 'error'
                  ? 'border-red-300 bg-red-50 text-red-900'
                  : 'border-amber-300 bg-amber-50 text-amber-900'
              }`}
            >
              {i.message}
            </div>
          ))}
        </div>
      )}
      <details open={all.some((i) => i.severity !== 'info')} className="group p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <h2 className="font-semibold">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
            Validation
          </h2>
          <Counts issues={all} />
        </summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {(
            [
              ['Version A', a],
              ['Version B', b],
            ] as const
          ).map(([label, v]) => (
            <div key={label}>
              <h3 className="mb-2 flex items-center justify-between text-sm font-medium">
                {label}
                {v && <Counts issues={v.issues} />}
              </h3>
              {v ? (
                <IssueList issues={v.issues} />
              ) : (
                <p className="text-sm text-slate-500">No file yet.</p>
              )}
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

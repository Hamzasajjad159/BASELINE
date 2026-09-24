import { useState } from 'react';
import type { ReportMeta } from '../domain/report';
import type { DiffResult } from '../domain/types';
import { downloadCsvReport, downloadXlsxReport } from '../io/exportReport';

interface ExportBarProps {
  result: DiffResult;
  /** Everything except the timestamp and unchanged-rows choice, which are set on export. */
  meta: Omit<ReportMeta, 'generatedAt' | 'includeUnchanged'>;
}

const buttonClass =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60';

export default function ExportBar({ result, meta }: ExportBarProps) {
  const [includeUnchanged, setIncludeUnchanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const full = (): ReportMeta => ({
    ...meta,
    includeUnchanged,
    generatedAt: new Date().toISOString(),
  });

  const onXlsx = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadXlsxReport(result, full());
    } catch (e) {
      setError(`Could not build the Excel report: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const changed = result.rows.filter((r) => r.status !== 'UNCHANGED').length;
  return (
    <section
      aria-label="Export"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
    >
      <h2 className="font-semibold">Export report</h2>
      <button
        type="button"
        className={buttonClass}
        onClick={() => downloadCsvReport(result, full())}
      >
        CSV
      </button>
      <button type="button" className={buttonClass} onClick={onXlsx} disabled={busy}>
        {busy ? 'Preparing…' : 'Excel (Summary, Changes, Warnings)'}
      </button>
      <label className="flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          checked={includeUnchanged}
          onChange={(e) => setIncludeUnchanged(e.target.checked)}
        />
        Include unchanged rows
      </label>
      <span className="text-sm text-slate-500">
        {includeUnchanged ? result.rows.length : changed} rows · current ignore settings apply
      </span>
      {error && (
        <p role="alert" className="w-full text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}

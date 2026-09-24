import { useState } from 'react';
import { downloadCsvTemplate, downloadXlsxTemplate } from '../io/downloadTemplate';

const buttonClass =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60';

export default function Header() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onXlsx = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadXlsxTemplate();
    } catch (e) {
      setError(`Could not build the Excel template: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Baseline — BOM Compare</h1>
        <p className="mt-1 text-sm text-slate-600">
          Compare two BOM snapshots. Files are processed locally in your browser and never uploaded.
        </p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={downloadCsvTemplate}>
            Download template (CSV)
          </button>
          <button type="button" className={buttonClass} onClick={onXlsx} disabled={busy}>
            {busy ? 'Preparing…' : 'Download template (Excel)'}
          </button>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    </header>
  );
}

import { useCallback, useMemo, useRef, useState } from 'react';
import { diff } from './domain/diff';
import type { FieldChangeType, RowChange } from './domain/types';
import { hasBlockingIssues, toSnapshot, validateFile, validatePair } from './domain/validate';
import type { FileValidation } from './domain/validate';
import { DEFAULT_FILTER, filterRows, parentOptions } from './domain/view';
import type { RowFilter } from './domain/view';
import { loadSamples } from './io/loadSample';
import { readBomFile } from './io/readFile';
import ConfigCompare from './ui/ConfigCompare';
import DiffTable from './ui/DiffTable';
import Header from './ui/Header';
import RowDetailDrawer from './ui/RowDetailDrawer';
import SummaryCards from './ui/SummaryCards';
import UploadPanel from './ui/UploadPanel';
import type { Slot } from './ui/UploadPanel';
import ValidationPanel from './ui/ValidationPanel';

type Which = 'a' | 'b';

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function useValidation(slot: Slot, stripLeadingZeros: boolean): FileValidation | null {
  return useMemo(
    () => (slot.status === 'loaded' ? validateFile(slot.file.table, { stripLeadingZeros }) : null),
    [slot, stripLeadingZeros],
  );
}

export default function App() {
  const [slots, setSlots] = useState<Record<Which, Slot>>({
    a: { status: 'empty' },
    b: { status: 'empty' },
  });
  const [stripLeadingZeros, setStripLeadingZeros] = useState(true);
  const [ignoreFields, setIgnoreFields] = useState<FieldChangeType[]>([]);
  const [compared, setCompared] = useState(false);
  const [filter, setFilter] = useState<RowFilter>(DEFAULT_FILTER);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  // Guards against a slow read overwriting a newer file dropped into the same slot.
  const tokens = useRef<Record<Which, number>>({ a: 0, b: 0 });

  const setSlot = (which: Which, slot: Slot) => setSlots((s) => ({ ...s, [which]: slot }));

  const resetResults = () => {
    setCompared(false);
    setFilter(DEFAULT_FILTER);
    setOpenKey(null);
  };

  const onFile = async (which: Which, file: File) => {
    const token = ++tokens.current[which];
    resetResults();
    setSlot(which, { status: 'loading', fileName: file.name });
    try {
      const loaded = await readBomFile(file);
      if (tokens.current[which] === token) setSlot(which, { status: 'loaded', file: loaded });
    } catch (e) {
      if (tokens.current[which] === token) {
        setSlot(which, { status: 'error', fileName: file.name, message: errorMessage(e) });
      }
    }
  };

  const onClear = (which: Which) => {
    tokens.current[which] += 1;
    resetResults();
    setSlot(which, { status: 'empty' });
  };

  const onLoadSample = async () => {
    tokens.current.a += 1;
    tokens.current.b += 1;
    resetResults();
    setSampleLoading(true);
    try {
      const { a, b } = await loadSamples();
      setSlots({ a: { status: 'loaded', file: a }, b: { status: 'loaded', file: b } });
      setCompared(true);
    } catch (e) {
      const message = errorMessage(e);
      setSlots({
        a: { status: 'error', fileName: 'sample A', message },
        b: { status: 'error', fileName: 'sample B', message },
      });
    } finally {
      setSampleLoading(false);
    }
  };

  const validationA = useValidation(slots.a, stripLeadingZeros);
  const validationB = useValidation(slots.b, stripLeadingZeros);
  const crossFile = useMemo(
    () => (validationA && validationB ? validatePair(validationA, validationB) : []),
    [validationA, validationB],
  );
  const canCompare =
    validationA !== null &&
    validationB !== null &&
    !validationA.blocking &&
    !validationB.blocking &&
    !hasBlockingIssues(crossFile);

  const result = useMemo(() => {
    if (!compared || !canCompare || slots.a.status !== 'loaded' || slots.b.status !== 'loaded') {
      return null;
    }
    return diff(
      toSnapshot('A', slots.a.file.fileName, slots.a.file.checksum, validationA),
      toSnapshot('B', slots.b.file.fileName, slots.b.file.checksum, validationB),
      { ignoreFields },
    );
  }, [compared, canCompare, slots, validationA, validationB, ignoreFields]);

  const visibleRows = useMemo(
    () => (result ? filterRows(result.rows, filter) : []),
    [result, filter],
  );
  const parents = useMemo(() => (result ? parentOptions(result.rows) : []), [result]);
  const openRow: RowChange | null = result?.rows.find((r) => r.key === openKey) ?? null;
  const closeDrawer = useCallback(() => setOpenKey(null), []);

  const blockedReason =
    !validationA || !validationB
      ? 'Upload both versions to compare.'
      : !canCompare
        ? 'Fix the blocking errors below to compare.'
        : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <Header onLoadSample={onLoadSample} sampleLoading={sampleLoading} />

      <UploadPanel
        slots={slots}
        validations={{ a: validationA, b: validationB }}
        onFile={onFile}
        onClear={onClear}
      />

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={!canCompare}
          onClick={() => setCompared(true)}
          className="rounded-md bg-slate-900 px-5 py-2 font-medium text-white shadow-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {result ? 'Compared ✓' : 'Compare'}
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={stripLeadingZeros}
            onChange={(e) => setStripLeadingZeros(e.target.checked)}
          />
          Ignore leading zeros in find and sequence numbers
        </label>
        {blockedReason && <span className="text-sm text-slate-500">{blockedReason}</span>}
      </div>

      <ValidationPanel a={validationA} b={validationB} crossFile={crossFile} />

      {result && (
        <>
          <SummaryCards
            result={result}
            active={filter.type}
            onSelect={(type) => setFilter((f) => ({ ...f, type }))}
          />
          <ConfigCompare
            configs={result.configs}
            active={filter.config}
            onSelect={(config) => setFilter((f) => ({ ...f, config }))}
          />
          <DiffTable
            rows={visibleRows}
            totalRows={result.rows.length}
            filter={filter}
            onFilter={setFilter}
            configs={result.configs.map((c) => c.name)}
            parents={parents}
            ignoreFields={ignoreFields}
            onIgnoreFields={setIgnoreFields}
            onOpen={(row) => setOpenKey(row.key)}
          />
        </>
      )}

      {!validationA && !validationB && slots.a.status === 'empty' && slots.b.status === 'empty' && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
          <h2 className="mb-2 font-semibold text-slate-900">How it works</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Download the CSV or Excel template and fill it with your BOM.</li>
            <li>Upload the baseline as Version A and the candidate as Version B.</li>
            <li>
              Review validation, then compare to see every added, removed, moved and changed row.
            </li>
          </ol>
          <p className="mt-3">
            Or click <strong>Load sample data</strong> to try it with a ready-made example.
          </p>
        </section>
      )}

      <RowDetailDrawer row={openRow} onClose={closeDrawer} />
    </div>
  );
}

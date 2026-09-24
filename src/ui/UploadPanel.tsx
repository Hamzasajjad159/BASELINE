import { useState } from 'react';
import type { DragEvent } from 'react';
import type { FileValidation } from '../domain/validate';
import type { LoadedFile } from '../io/readFile';
import { formatBytes, shortHash } from './labels';

export type Slot =
  | { status: 'empty' }
  | { status: 'loading'; fileName: string }
  | { status: 'error'; fileName: string; message: string }
  | { status: 'loaded'; file: LoadedFile };

interface DropZoneProps {
  label: string;
  hint: string;
  slot: Slot;
  validation: FileValidation | null;
  onFile: (file: File) => void;
  onClear: () => void;
}

function DropZone({ label, hint, slot, validation, onFile, onClear }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputId = `upload-${label.replace(/\s+/g, '-').toLowerCase()}`;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div
      className={`flex flex-col rounded-lg border-2 border-dashed p-4 transition-colors ${
        dragging ? 'border-sky-500 bg-sky-50' : 'border-slate-300 bg-white'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{label}</h2>
        <span className="text-xs text-slate-500">{hint}</span>
      </div>

      {slot.status === 'loaded' ? (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">File</dt>
          <dd className="truncate font-medium" title={slot.file.fileName}>
            {slot.file.fileName}{' '}
            <span className="font-normal text-slate-500">({formatBytes(slot.file.byteSize)})</span>
          </dd>
          <dt className="text-slate-500">Rows</dt>
          <dd>
            {slot.file.table.rows.length}
            {validation && validation.rows.length !== slot.file.table.rows.length && (
              <span className="text-slate-500"> ({validation.rows.length} compared)</span>
            )}
          </dd>
          {validation?.assemblyNumber && (
            <>
              <dt className="text-slate-500">Assembly</dt>
              <dd>
                {validation.assemblyNumber}
                {validation.assemblyRevision && ` rev ${validation.assemblyRevision}`}
              </dd>
            </>
          )}
          <dt className="text-slate-500">SHA-256</dt>
          <dd className="font-mono text-xs leading-5" title={slot.file.checksum}>
            {shortHash(slot.file.checksum)}…
          </dd>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-slate-600">
          {slot.status === 'loading'
            ? `Reading ${slot.fileName}…`
            : 'Drop a .csv or .xlsx file here, or choose one.'}
        </p>
      )}

      {slot.status === 'error' && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {slot.fileName}: {slot.message}
        </p>
      )}

      <div className="mt-auto flex gap-2 pt-3">
        <label
          htmlFor={inputId}
          className="cursor-pointer rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 focus-within:ring-2 focus-within:ring-sky-500"
        >
          {slot.status === 'loaded' ? 'Replace file' : 'Choose file'}
          <input
            id={inputId}
            type="file"
            accept=".csv,.txt,.xlsx"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = '';
            }}
          />
        </label>
        {slot.status !== 'empty' && slot.status !== 'loading' && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

interface UploadPanelProps {
  slots: { a: Slot; b: Slot };
  validations: { a: FileValidation | null; b: FileValidation | null };
  onFile: (which: 'a' | 'b', file: File) => void;
  onClear: (which: 'a' | 'b') => void;
}

export default function UploadPanel({ slots, validations, onFile, onClear }: UploadPanelProps) {
  return (
    <section aria-label="Upload" className="grid gap-4 md:grid-cols-2">
      <DropZone
        label="Version A"
        hint="baseline"
        slot={slots.a}
        validation={validations.a}
        onFile={(f) => onFile('a', f)}
        onClear={() => onClear('a')}
      />
      <DropZone
        label="Version B"
        hint="candidate"
        slot={slots.b}
        validation={validations.b}
        onFile={(f) => onFile('b', f)}
        onClear={() => onClear('b')}
      />
    </section>
  );
}

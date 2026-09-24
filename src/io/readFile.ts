import type { RawTable } from '../domain/types';
import { parseCsvText } from './parseCsv';
import { parseXlsxBuffer } from './parseXlsx';

export interface LoadedFile {
  fileName: string;
  byteSize: number;
  /** SHA-256 of the raw file bytes, lowercase hex. */
  checksum: string;
  table: RawTable;
}

export class UnsupportedFileError extends Error {}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fileKind(fileName: string): 'csv' | 'xlsx' {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'csv' || ext === 'txt') return 'csv';
  if (ext === 'xlsx') return 'xlsx';
  if (ext === 'xls') {
    throw new UnsupportedFileError(
      'Legacy .xls files are not supported. Save the file as .xlsx or .csv and try again.',
    );
  }
  throw new UnsupportedFileError(`Unsupported file type ".${ext}". Upload a .csv or .xlsx file.`);
}

export async function readBomFile(file: Blob & { name: string }): Promise<LoadedFile> {
  const kind = fileKind(file.name);
  const bytes = await file.arrayBuffer();
  const [checksum, table] = await Promise.all([
    sha256Hex(bytes),
    kind === 'csv'
      ? Promise.resolve(parseCsvText(new TextDecoder('utf-8').decode(bytes)))
      : parseXlsxBuffer(bytes),
  ]);
  return { fileName: file.name, byteSize: bytes.byteLength, checksum, table };
}

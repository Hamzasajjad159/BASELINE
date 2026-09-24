// Value and identifier normalization, applied identically to both snapshots.
import type { BomRow, NormalizedRow } from './types';

export interface NormalizeOptions {
  /** Strip leading zeros from find_number and sequence_number ("010" -> "10"). */
  stripLeadingZeros: boolean;
}

export const DEFAULT_NORMALIZE_OPTIONS: NormalizeOptions = { stripLeadingZeros: true };

/** Trim and collapse internal whitespace runs to a single space. */
export function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Identifiers: clean + uppercase. */
export function normalizeId(value: string): string {
  return cleanText(value).toUpperCase();
}

export function optionalText(value: string): string | null {
  const v = cleanText(value);
  return v === '' ? null : v;
}

/** "010" -> "10", "0010A" -> "10A", "000" -> "0", "0A" unchanged. */
export function stripLeadingZeros(value: string): string {
  return value.replace(/^0+(?=\d)/, '');
}

const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Strict decimal parse: rejects blanks, hex, thousands separators, and trailing junk. */
export function parseDecimal(value: string): number | null {
  const v = cleanText(value);
  return DECIMAL.test(v) ? Number(v) : null;
}

export function parseInteger(value: string): number | null {
  const n = parseDecimal(value);
  return n !== null && Number.isInteger(n) ? n : null;
}

export interface DateParse {
  /** ISO YYYY-MM-DD, or null when blank. */
  value: string | null;
  error?: string;
}

// Excel serial dates: days since 1899-12-30, valid from serial 61 (1900-03-01) onward.
// Earlier serials are skewed by Excel's fictitious 1900-02-29 and never occur in real BOMs.
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;
const MIN_EXCEL_SERIAL = 61;
const MAX_EXCEL_SERIAL = 2_958_465; // 9999-12-31

function isoFromParts(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Accepts YYYY-MM-DD (also with '/' or '.', or a trailing time part as produced by
 * Date.toISOString) and Excel serial day numbers. Ambiguous forms like 03/04/2026 are rejected.
 */
export function parseDate(value: string): DateParse {
  const v = cleanText(value);
  if (v === '') return { value: null };

  const ymd = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ][\d:.]+Z?)?$/.exec(v);
  if (ymd) {
    const iso = isoFromParts(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
    return iso ? { value: iso } : { value: null, error: `"${v}" is not a valid calendar date` };
  }

  if (/^\d+(\.\d+)?$/.test(v)) {
    const serial = Math.floor(Number(v));
    if (serial >= MIN_EXCEL_SERIAL && serial <= MAX_EXCEL_SERIAL) {
      return { value: new Date(EXCEL_EPOCH_MS + serial * DAY_MS).toISOString().slice(0, 10) };
    }
  }

  return { value: null, error: `"${v}" is not a date; use YYYY-MM-DD` };
}

/** Normalize one resolved row. Invalid values become null; validate.ts reports them. */
export function normalizeRow(
  raw: BomRow,
  sourceRow: number,
  options: NormalizeOptions = DEFAULT_NORMALIZE_OPTIONS,
): NormalizedRow {
  const zeros = (v: string) => (options.stripLeadingZeros ? stripLeadingZeros(v) : v);
  const sequence = optionalText(raw.sequence_number);
  const makeBuy = optionalText(raw.make_buy);
  const level = parseInteger(raw.level);
  return {
    sourceRow,
    raw,
    assembly_number: normalizeId(raw.assembly_number),
    assembly_revision: cleanText(raw.assembly_revision),
    configuration_name: cleanText(raw.configuration_name),
    parent_part_number: normalizeId(raw.parent_part_number),
    level: level !== null && level >= 1 ? level : null,
    find_number: zeros(cleanText(raw.find_number)),
    sequence_number: sequence === null ? null : zeros(sequence),
    part_number: normalizeId(raw.part_number),
    part_revision: optionalText(raw.part_revision),
    description: cleanText(raw.description),
    quantity: parseDecimal(raw.quantity),
    uom: normalizeId(raw.uom),
    effectivity_start: parseDate(raw.effectivity_start).value,
    effectivity_end: parseDate(raw.effectivity_end).value,
    item_type: optionalText(raw.item_type),
    make_buy: makeBuy === null ? null : makeBuy.toUpperCase(),
    reference_designator: optionalText(raw.reference_designator),
    notes: optionalText(raw.notes),
    occurrences: 1,
  };
}

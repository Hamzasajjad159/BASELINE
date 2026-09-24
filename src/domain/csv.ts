// Minimal RFC 4180 CSV writer shared by the template and the report export.

/**
 * Cells starting with these characters are interpreted as formulas by Excel/Sheets
 * (CSV injection). A leading apostrophe forces them to text.
 */
const FORMULA_START = /^[=+@\t\r]|^-(?![\d.])/;

export function escapeCsvCell(value: string): string {
  const guarded = FORMULA_START.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(guarded) || guarded !== guarded.trim()) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n') + '\r\n';
}

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COUNT_KEYS, diff } from '../src/domain/diff';
import { toSnapshot, validateFile, validatePair } from '../src/domain/validate';
import { parseCsvText } from '../src/io/parseCsv';
import { parseXlsxBuffer } from '../src/io/parseXlsx';

const load = (name: string) =>
  validateFile(parseCsvText(readFileSync(`public/samples/${name}`, 'utf-8')));

describe('sample data', () => {
  const a = load('sample_version_A.csv');
  const b = load('sample_version_B.csv');
  const result = diff(toSnapshot('A', 'A', '', a), toSnapshot('B', 'B', '', b));

  it('is valid, 30–60 rows, with only informational dedupe notes', () => {
    for (const v of [a, b]) {
      expect(v.blocking).toBe(false);
      expect(v.dataRowCount).toBeGreaterThanOrEqual(30);
      expect(v.dataRowCount).toBeLessThanOrEqual(60);
      expect(v.issues.map((i) => i.code)).toEqual(v.issues.map(() => 'DEDUPE_COLLAPSED'));
      expect(v.issues.length).toBeGreaterThan(0);
    }
    expect(validatePair(a, b)).toEqual([]);
  });

  it('has three levels and two main configurations in each file', () => {
    for (const v of [a, b]) {
      expect(new Set(v.rows.map((r) => r.level))).toEqual(new Set([1, 2, 3]));
      const configs = new Set(v.rows.map((r) => r.configuration_name));
      expect(configs.has('Standard') && configs.has('Heavy Duty')).toBe(true);
    }
  });

  it('triggers every change type at least once', () => {
    const missing = COUNT_KEYS.filter((k) => result.counts[k] === 0);
    expect(missing).toEqual([]);
    expect(result.header.assemblyRevision.changed).toBe(true);
  });

  it('shows a find-number change, a move and a multi-field change as intended', () => {
    const byPart = (p: string) => result.rows.filter((r) => (r.b ?? r.a)?.part_number === p);
    expect(byPart('LBL-001').map((r) => r.status)).toEqual(['CHANGED']);
    expect(byPart('0450-1003').find((r) => r.status === 'MOVED')).toMatchObject({
      fromParent: 'SA-100',
      toParent: 'SA-110',
    });
    const oil = byPart('OIL-VG220').find((r) => r.status === 'CHANGED');
    expect(oil?.fields.map((f) => f.type)).toEqual(['QTY_CHANGED', 'UOM_CHANGED']);
  });

  it('ignores leading zeros and lowercase units in the Heavy Duty rows', () => {
    const heavy = result.rows.filter((r) => r.a?.configuration_name === 'Heavy Duty');
    const changed = heavy.filter((r) => r.status !== 'UNCHANGED').map((r) => r.a?.part_number);
    expect(changed.sort()).toEqual(['FT-050', 'SHF-020']);
  });
});

describe('XLSX samples', () => {
  it('parse to exactly the same rows as the CSV samples', async () => {
    for (const v of ['A', 'B']) {
      const base = `public/samples/sample_version_${v}`;
      const csv = parseCsvText(readFileSync(`${base}.csv`, 'utf-8'));
      const bytes = readFileSync(`${base}.xlsx`);
      const xlsx = await parseXlsxBuffer(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      );
      expect(xlsx.headers).toEqual(csv.headers);
      expect(xlsx.rows).toEqual(csv.rows);
      expect(xlsx.sourceRows).toEqual(csv.sourceRows);
    }
  });
});

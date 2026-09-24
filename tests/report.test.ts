import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { diff } from '../src/domain/diff';
import { CHANGE_COLUMNS, buildReport, reportFileStem, reportToCsv } from '../src/domain/report';
import type { ReportMeta } from '../src/domain/report';
import { toSnapshot, validateFile, validatePair } from '../src/domain/validate';
import { buildXlsxReport } from '../src/io/exportReport';
import { parseCsvText } from '../src/io/parseCsv';

const load = (v: 'A' | 'B') =>
  validateFile(parseCsvText(readFileSync(`public/samples/sample_version_${v}.csv`, 'utf-8')));
const va = load('A');
const vb = load('B');
const result = diff(toSnapshot('A', 'a.csv', 'aaa', va), toSnapshot('B', 'b.csv', 'bbb', vb));

const meta = (overrides: Partial<ReportMeta> = {}): ReportMeta => ({
  a: {
    fileName: 'a.csv',
    checksum: 'aaa',
    rows: va.dataRowCount,
    rowsCompared: va.rows.length,
    issues: va.issues,
  },
  b: {
    fileName: 'b.csv',
    checksum: 'bbb',
    rows: vb.dataRowCount,
    rowsCompared: vb.rows.length,
    issues: vb.issues,
  },
  crossFile: validatePair(va, vb),
  generatedAt: '2026-09-24T18:05:09.123Z',
  options: { stripLeadingZeros: true, ignoreFields: [] },
  includeUnchanged: false,
  ...overrides,
});

const col = (name: (typeof CHANGE_COLUMNS)[number]) => CHANGE_COLUMNS.indexOf(name);

describe('buildReport', () => {
  const r = buildReport(result, meta());
  const lookup = (key: string) => r.summary.find(([k]) => k === key)?.[1];

  it('summarizes files, options, revision and counts', () => {
    expect(lookup('Assembly')).toBe('ASM-2000');
    expect(lookup('Assembly revision changed')).toBe('yes');
    expect(lookup('Version A SHA-256')).toBe('aaa');
    expect(lookup('Version B rows in file')).toBe('41');
    expect(lookup('Version B rows compared')).toBe('37');
    expect(lookup('Option: ignore leading zeros')).toBe('yes');
    expect(lookup('Option: ignored change types')).toBe('none');
    expect(lookup('Option: unchanged rows included')).toBe('no');
    expect(lookup('MOVED')).toBe('1');
    expect(lookup('CHANGED')).toBe('10');
  });

  it('lists changed rows only by default, with before/after columns', () => {
    expect(r.changes[0]).toEqual([...CHANGE_COLUMNS]);
    expect(r.changes).toHaveLength(1 + result.rows.filter((c) => c.status !== 'UNCHANGED').length);
    const oil = r.changes.find((row) => row[col('part_number')] === 'OIL-VG220');
    expect(oil?.[col('quantity_a')]).toBe('0.8');
    expect(oil?.[col('quantity_b')]).toBe('0.72');
    expect(oil?.[col('change_types')]).toBe('QTY_CHANGED, UOM_CHANGED');
    expect(oil?.[col('changes')]).toBe('quantity: 0.8 → 0.72; uom: L → KG');
  });

  it('describes moves, removals and config changes', () => {
    const moved = r.changes.find((row) => row[0] === 'MOVED');
    expect(moved?.[col('changes')]).toBe('parent: SA-100 → SA-110');
    expect(moved?.[col('parent_a')]).toBe('SA-100');
    expect(moved?.[col('parent_b')]).toBe('SA-110');
    const removed = r.changes.find((row) => row[col('part_number')] === '0450-1002');
    expect(removed?.[col('source_row_b')]).toBe('');
    expect(removed?.[col('revision_b')]).toBe('');
    const configRow = r.changes.find((row) => row[col('config_change')] === 'CONFIG_ADDED');
    expect(configRow?.[col('configuration')]).toBe('Washdown');
  });

  it('shows missing values as ∅ in the change text', () => {
    const r2 = buildReport(
      diff(
        toSnapshot('A', '', '', validateFile(parseCsvText(sampleOne('')))),
        toSnapshot('B', '', '', validateFile(parseCsvText(sampleOne('2027-01-01')))),
      ),
      meta(),
    );
    expect(r2.changes[1]?.[col('changes')]).toBe('effectivity_end: ∅ → 2027-01-01');
    const cleared = buildReport(
      diff(
        toSnapshot('A', '', '', validateFile(parseCsvText(sampleOne('2027-01-01')))),
        toSnapshot('B', '', '', validateFile(parseCsvText(sampleOne('')))),
      ),
      meta(),
    );
    expect(cleared.changes[1]?.[col('changes')]).toBe('effectivity_end: 2027-01-01 → ∅');
  });

  it('includes unchanged rows and ignore options when asked', () => {
    const all = buildReport(
      result,
      meta({
        includeUnchanged: true,
        options: {
          stripLeadingZeros: false,
          ignoreFields: ['ATTRIBUTE_CHANGED', 'REVISION_CHANGED'],
        },
      }),
    );
    expect(all.changes).toHaveLength(1 + result.rows.length);
    const find = (k: string) => all.summary.find(([x]) => x === k)?.[1];
    expect(find('Option: ignored change types')).toBe('ATTRIBUTE_CHANGED, REVISION_CHANGED');
    expect(find('Option: ignore leading zeros')).toBe('no');
    expect(find('Option: unchanged rows included')).toBe('yes');
  });

  it('collects validation issues, cross-file issues and diff warnings', () => {
    const withMore = buildReport(
      { ...result, warnings: [{ code: 'DUPLICATE_GROUP', message: 'dup' }] },
      meta({
        crossFile: [
          {
            severity: 'warning',
            scope: 'cross-file',
            code: 'POSSIBLY_INCOMPLETE',
            message: 'short',
          },
        ],
      }),
    );
    expect(withMore.warnings[0]).toEqual(['source', 'severity', 'code', 'source_row', 'message']);
    const sources = withMore.warnings.slice(1).map((w) => w[0]);
    expect(new Set(sources)).toEqual(new Set(['A', 'B', 'A+B', 'diff']));
    const dedupe = withMore.warnings.find((w) => w[2] === 'DEDUPE_COLLAPSED');
    expect(dedupe?.[3]).toMatch(/^\d+$/);
    expect(withMore.warnings.at(-1)).toEqual(['diff', 'warning', 'DUPLICATE_GROUP', '', 'dup']);
  });

  it('reports an unchanged assembly revision', () => {
    const same = {
      ...result,
      header: { ...result.header, assemblyRevision: { a: 'A', b: 'A', changed: false } },
    };
    expect(
      buildReport(same, meta()).summary.find(([k]) => k === 'Assembly revision changed')?.[1],
    ).toBe('no');
  });
});

function sampleOne(effectivityEnd: string): string {
  return (
    'assembly_number,assembly_revision,configuration_name,parent_part_number,level,find_number,part_number,description,quantity,uom,effectivity_end\n' +
    `ASM-1,A,Default,ASM-1,1,10,P-1,Widget,1,EA,${effectivityEnd}\n`
  );
}

describe('reportToCsv', () => {
  it('puts the summary in # comment lines followed by the changes table', () => {
    const r = buildReport(result, meta());
    const csv = reportToCsv(r);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('# Baseline BOM compare report');
    expect(lines).toContain('# Assembly: ASM-2000');
    expect(lines.some((l) => l === CHANGE_COLUMNS.join(','))).toBe(true);
    expect(csv).not.toMatch(/^# :/m);
  });

  it('keeps comment lines on one line and round-trips through the app parser', () => {
    const r = buildReport(result, meta({ a: { ...meta().a, fileName: 'evil\r\nname.csv' } }));
    const csv = reportToCsv(r);
    expect(csv).toContain('# Version A file: evil name.csv');
    const parsed = parseCsvText(csv);
    expect(parsed.headers).toEqual([...CHANGE_COLUMNS]);
    expect(parsed.rows).toHaveLength(r.changes.length - 1);
  });
});

describe('reportFileStem', () => {
  it('builds a safe file name', () => {
    expect(reportFileStem('ASM-2000', '2026-09-24T18:05:09.123Z')).toBe(
      'bom-compare_ASM-2000_2026-09-24T1805',
    );
    expect(reportFileStem('A/B C', '2026-09-24T18:05:09Z')).toBe(
      'bom-compare_A_B_C_2026-09-24T1805',
    );
    expect(reportFileStem('', '2026-09-24T18:05:09Z')).toBe('bom-compare_bom_2026-09-24T1805');
  });
});

describe('buildXlsxReport', () => {
  it('writes Summary, Changes and Warnings sheets with the same content', async () => {
    const m = meta();
    const tables = buildReport(result, m);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildXlsxReport(result, m));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Changes', 'Warnings']);

    const values = (name: string) => {
      const ws = wb.getWorksheet(name) as ExcelJS.Worksheet;
      const out: string[][] = [];
      ws.eachRow({ includeEmpty: true }, (row) => {
        const cells = (row.values as unknown[])
          .slice(1)
          .map((v) => (v === undefined || v === null ? '' : String(v)));
        out.push(cells);
      });
      return out;
    };
    const trim = (t: string[][]) =>
      t.map((r) => {
        const c = [...r];
        while (c.length && c.at(-1) === '') c.pop();
        return c;
      });
    expect(trim(values('Changes'))).toEqual(trim(tables.changes));
    expect(trim(values('Warnings'))).toEqual(trim(tables.warnings));
    expect(values('Summary')[0]?.[0]).toBe('Baseline BOM compare report');
    const changes = wb.getWorksheet('Changes') as ExcelJS.Worksheet;
    expect(changes.getColumn(1).numFmt).toBe('@');
    expect(changes.autoFilter).toBeDefined();
  });
});

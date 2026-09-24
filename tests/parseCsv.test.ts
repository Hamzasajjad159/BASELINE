import { describe, expect, it } from 'vitest';
import { buildCsvTemplate, COLUMN_KEYS } from '../src/domain/template';
import { validateFile } from '../src/domain/validate';
import { detectDelimiter, parseCsvText } from '../src/io/parseCsv';

describe('detectDelimiter', () => {
  it('reads the header line, skipping comments and blanks', () => {
    expect(detectDelimiter('#a,b,c\n\npart;qty;uom\n1;2;3')).toBe(';');
    expect(detectDelimiter('part\tqty\n')).toBe('\t');
    expect(detectDelimiter('a,b\n')).toBe(',');
    expect(detectDelimiter('single\n')).toBe(',');
    expect(detectDelimiter('')).toBe(',');
  });
});

describe('parseCsvText', () => {
  it('keeps spreadsheet row numbers across comments, blanks and multi-line cells', () => {
    const t = parseCsvText('﻿part,desc\r\n#example,skip\r\nA,"two\nlines"\r\n\r\nB,x\r\n');
    expect(t.headers).toEqual(['part', 'desc']);
    expect(t.rows).toEqual([
      { part: 'A', desc: 'two\nlines' },
      { part: 'B', desc: 'x' },
    ]);
    expect(t.sourceRows).toEqual([3, 5]);
    expect(t.parseWarnings).toEqual([]);
  });

  it('parses semicolon files from European Excel', () => {
    const t = parseCsvText('part;qty\nA;1,5\n');
    expect(t.rows).toEqual([{ part: 'A', qty: '1,5' }]);
  });

  it('trims headers, pads short rows, and keeps the leftmost repeated header', () => {
    const t = parseCsvText(' part , qty ,part\nA\nB,2,C\n');
    expect(t.headers).toEqual(['part', 'qty', 'part']);
    expect(t.rows).toEqual([
      { part: 'A', qty: '' },
      { part: 'B', qty: '2' },
    ]);
  });

  it('warns about extra non-empty cells but not trailing empty ones', () => {
    const t = parseCsvText('a,b\n1,2,,\n1,2,3\n');
    expect(t.parseWarnings).toEqual([
      { sourceRow: 3, message: 'Row has 3 cells but the header has 2; extra cells were ignored.' },
    ]);
  });

  it('reports malformed quotes with a row number', () => {
    const t = parseCsvText('a,b\n1,"open\n');
    expect(t.parseWarnings[0]).toMatchObject({ sourceRow: 2 });
  });

  it('returns an empty table for empty input', () => {
    expect(parseCsvText('')).toEqual({ headers: [], rows: [], sourceRows: [], parseWarnings: [] });
  });

  it('round-trips the CSV template: the example row is skipped', () => {
    const t = parseCsvText(buildCsvTemplate());
    expect(t.headers).toEqual([...COLUMN_KEYS]);
    expect(t.rows).toEqual([]);
    expect(validateFile(t).issues.map((i) => i.code)).toEqual(['NO_ROWS']);
  });
});

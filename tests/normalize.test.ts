import { describe, expect, it } from 'vitest';
import {
  cleanText,
  normalizeId,
  normalizeRow,
  optionalText,
  parseDate,
  parseDecimal,
  parseInteger,
  stripLeadingZeros,
} from '../src/domain/normalize';
import { matchKey, relationKey, splitKey } from '../src/domain/keys';
import { bom, norm } from './helpers';

describe('text helpers', () => {
  it('cleanText trims and collapses whitespace', () => {
    expect(cleanText('  a \t b\n\nc  ')).toBe('a b c');
  });
  it('normalizeId also uppercases', () => {
    expect(normalizeId(' abc-12  x ')).toBe('ABC-12 X');
  });
  it('optionalText maps blanks to null', () => {
    expect(optionalText('   ')).toBeNull();
    expect(optionalText(' x ')).toBe('x');
  });
  it('stripLeadingZeros keeps a lone zero and non-numeric prefixes', () => {
    expect(stripLeadingZeros('010')).toBe('10');
    expect(stripLeadingZeros('0010A')).toBe('10A');
    expect(stripLeadingZeros('000')).toBe('0');
    expect(stripLeadingZeros('0A')).toBe('0A');
    expect(stripLeadingZeros('A01')).toBe('A01');
  });
});

describe('numbers', () => {
  it('parseDecimal accepts plain decimals and exponents', () => {
    expect(parseDecimal('2')).toBe(2);
    expect(parseDecimal(' 2.50 ')).toBe(2.5);
    expect(parseDecimal('.5')).toBe(0.5);
    expect(parseDecimal('3.')).toBe(3);
    expect(parseDecimal('-1')).toBe(-1);
    expect(parseDecimal('1e3')).toBe(1000);
  });
  it('parseDecimal rejects blanks, separators, hex and junk', () => {
    for (const v of ['', ' ', '1,000', '1,5', '0x10', '2 pcs', 'abc', '.']) {
      expect(parseDecimal(v), v).toBeNull();
    }
  });
  it('parseInteger rejects fractions', () => {
    expect(parseInteger('3')).toBe(3);
    expect(parseInteger('3.0')).toBe(3);
    expect(parseInteger('3.5')).toBeNull();
    expect(parseInteger('x')).toBeNull();
  });
});

describe('parseDate', () => {
  it('treats blank as open-ended', () => {
    expect(parseDate('  ')).toEqual({ value: null });
  });
  it('accepts ISO dates with -, / or . separators and a time suffix', () => {
    expect(parseDate('2026-01-05').value).toBe('2026-01-05');
    expect(parseDate('2026/1/5').value).toBe('2026-01-05');
    expect(parseDate('2026.01.05').value).toBe('2026-01-05');
    expect(parseDate('2026-01-05T00:00:00.000Z').value).toBe('2026-01-05');
  });
  it('rejects impossible calendar dates', () => {
    const r = parseDate('2026-02-30');
    expect(r.value).toBeNull();
    expect(r.error).toContain('not a valid calendar date');
  });
  it('converts Excel serial numbers', () => {
    expect(parseDate('46023').value).toBe('2026-01-01');
    expect(parseDate('46023.75').value).toBe('2026-01-01');
    expect(parseDate('61').value).toBe('1900-03-01');
  });
  it('rejects out-of-range serials and ambiguous formats', () => {
    expect(parseDate('60').error).toContain('use YYYY-MM-DD');
    expect(parseDate('3000000').error).toBeDefined();
    expect(parseDate('03/04/2026').error).toBeDefined();
    expect(parseDate('soon').error).toBeDefined();
  });
});

describe('normalizeRow', () => {
  it('normalizes identifiers, numbers, dates and optional fields', () => {
    const r = normalizeRow(
      bom({
        assembly_number: ' asm-1 ',
        parent_part_number: 'asm-1',
        part_number: ' p-1 ',
        uom: 'ea',
        find_number: '010',
        sequence_number: '0020',
        quantity: '2.0',
        level: '1',
        effectivity_start: '46023',
        make_buy: 'buy',
        description: '  Bracket,   mounting ',
        part_revision: '',
      }),
      7,
    );
    expect(r).toMatchObject({
      sourceRow: 7,
      assembly_number: 'ASM-1',
      parent_part_number: 'ASM-1',
      part_number: 'P-1',
      uom: 'EA',
      find_number: '10',
      sequence_number: '20',
      quantity: 2,
      level: 1,
      effectivity_start: '2026-01-01',
      effectivity_end: null,
      make_buy: 'BUY',
      description: 'Bracket, mounting',
      part_revision: null,
      occurrences: 1,
    });
    expect(r.raw.find_number).toBe('010');
  });

  it('keeps leading zeros when the option is off', () => {
    const r = normalizeRow(bom({ find_number: '010', sequence_number: '005' }), 2, {
      stripLeadingZeros: false,
    });
    expect(r.find_number).toBe('010');
    expect(r.sequence_number).toBe('005');
  });

  it('maps invalid and blank values to null', () => {
    const r = norm({
      quantity: 'x',
      level: '',
      sequence_number: '',
      make_buy: '',
      effectivity_end: 'bad',
    });
    expect(r.quantity).toBeNull();
    expect(r.level).toBeNull();
    expect(norm({ level: '0' }).level).toBeNull();
    expect(r.sequence_number).toBeNull();
    expect(r.make_buy).toBeNull();
    expect(r.effectivity_end).toBeNull();
  });
});

describe('keys', () => {
  it('matchKey excludes find number; relationKey includes it', () => {
    const a = norm({ find_number: '10' });
    const b = norm({ find_number: '20' });
    expect(matchKey(a)).toBe(matchKey(b));
    expect(relationKey(a)).not.toBe(relationKey(b));
    expect(splitKey(relationKey(a))).toEqual(['Default', 'ASM-1', 'P-1', '10']);
  });
});

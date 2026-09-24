import { describe, expect, it } from 'vitest';
import { escapeCsvCell, toCsv } from '../src/domain/csv';

describe('escapeCsvCell', () => {
  it('leaves plain values alone', () => {
    expect(escapeCsvCell('ABC-123')).toBe('ABC-123');
    expect(escapeCsvCell('')).toBe('');
  });

  it('quotes values with commas, quotes, newlines or edge whitespace', () => {
    expect(escapeCsvCell('Bracket, mounting')).toBe('"Bracket, mounting"');
    expect(escapeCsvCell('6" rod')).toBe('"6"" rod"');
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"');
    expect(escapeCsvCell(' padded ')).toBe('" padded "');
  });

  it('guards against formula injection', () => {
    expect(escapeCsvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(escapeCsvCell('+1')).toBe("'+1");
    expect(escapeCsvCell('@cmd')).toBe("'@cmd");
    expect(escapeCsvCell('-cmd')).toBe("'-cmd");
  });

  it('does not guard negative numbers', () => {
    expect(escapeCsvCell('-5')).toBe('-5');
    expect(escapeCsvCell('-.5')).toBe('-.5');
  });
});

describe('toCsv', () => {
  it('joins rows with CRLF and a trailing newline', () => {
    expect(
      toCsv([
        ['a', 'b'],
        ['1', 'x,y'],
      ]),
    ).toBe('a,b\r\n1,"x,y"\r\n');
  });
});

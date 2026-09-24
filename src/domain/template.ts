// Single source of truth for the BOM template: column definitions, header aliases,
// and the generated CSV template / instructions content.
import { toCsv } from './csv';
import type { BomRow, ColumnDef, ColumnKey } from './types';

export const COLUMNS: readonly ColumnDef[] = [
  {
    key: 'assembly_number',
    required: true,
    type: 'string',
    description: 'Top-level assembly this BOM belongs to. Must be the same on every row.',
    aliases: ['assembly', 'top assembly', 'top level assembly', 'assembly no', 'assembly pn'],
    example: 'ASM-1000',
  },
  {
    key: 'assembly_revision',
    required: true,
    type: 'string',
    description: 'Revision of the top-level assembly.',
    aliases: ['assembly rev', 'top assembly revision'],
    example: 'B',
  },
  {
    key: 'configuration_name',
    required: true,
    type: 'string',
    description:
      'Configuration / variant name. Use "Default" if the assembly has one configuration.',
    aliases: ['configuration', 'config', 'variant'],
    example: 'Default',
  },
  {
    key: 'parent_part_number',
    required: true,
    type: 'string',
    description: 'Immediate parent of this row. Equals assembly_number at level 1.',
    aliases: ['parent', 'parent part', 'parent pn', 'parent part no', 'parent item'],
    example: 'ASM-1000',
  },
  {
    key: 'level',
    required: true,
    type: 'int',
    description: 'Indent level in the structure (1 = directly under the assembly).',
    aliases: ['lvl', 'bom level', 'indent level', 'indent'],
    example: '1',
  },
  {
    key: 'find_number',
    required: true,
    type: 'string',
    description: 'Find / item / balloon number of this row on its parent.',
    aliases: ['find no', 'find', 'find num', 'item no', 'item number', 'balloon'],
    example: '10',
  },
  {
    key: 'sequence_number',
    required: false,
    type: 'int',
    description: 'Assembly / operation sequence number.',
    aliases: ['seq', 'sequence', 'seq no', 'operation sequence', 'op seq'],
    example: '20',
  },
  {
    key: 'part_number',
    required: true,
    type: 'string',
    description: 'Part number of this component.',
    aliases: ['part no', 'pn', 'part', 'component', 'component number', 'component no'],
    example: '100-0042',
  },
  {
    key: 'part_revision',
    required: false,
    type: 'string',
    description: 'Revision of the component.',
    aliases: ['rev', 'revision', 'part rev', 'component revision'],
    example: 'C',
  },
  {
    key: 'description',
    required: true,
    type: 'string',
    description: 'Component description.',
    aliases: ['desc', 'part description', 'component description'],
    example: 'Bracket, mounting',
  },
  {
    key: 'quantity',
    required: true,
    type: 'decimal',
    description: 'Quantity per parent. Must be greater than 0.',
    aliases: ['qty', 'qty per', 'quantity per', 'qpa'],
    example: '2',
  },
  {
    key: 'uom',
    required: true,
    type: 'string',
    description: 'Unit of measure (EA, KG, M, ...).',
    aliases: ['unit', 'units', 'unit of measure', 'um'],
    example: 'EA',
  },
  {
    key: 'effectivity_start',
    required: false,
    type: 'date',
    description: 'First effective date (YYYY-MM-DD).',
    aliases: ['effective from', 'eff start', 'effectivity from', 'start date'],
    example: '2026-01-01',
  },
  {
    key: 'effectivity_end',
    required: false,
    type: 'date',
    description: 'Last effective date (YYYY-MM-DD). Leave blank for open-ended.',
    aliases: ['effective to', 'eff end', 'effectivity to', 'end date'],
    example: '',
  },
  {
    key: 'item_type',
    required: false,
    type: 'string',
    description: 'Part / Assembly / Reference.',
    aliases: ['type', 'part type', 'component type'],
    example: 'Part',
  },
  {
    key: 'make_buy',
    required: false,
    type: 'enum',
    description: 'MAKE or BUY.',
    aliases: ['make or buy', 'procurement type', 'source'],
    example: 'BUY',
    enumValues: ['MAKE', 'BUY'],
  },
  {
    key: 'reference_designator',
    required: false,
    type: 'string',
    description: 'Reference designator(s), e.g. R1, R2.',
    aliases: ['ref des', 'reference designators', 'designator', 'designators'],
    example: '',
  },
  {
    key: 'notes',
    required: false,
    type: 'string',
    description: 'Free-text notes. Ignored by the comparison.',
    aliases: ['note', 'comment', 'comments', 'remarks'],
    example: 'Example row - delete before use',
  },
];

export const COLUMN_KEYS: readonly ColumnKey[] = COLUMNS.map((c) => c.key);

export const REQUIRED_COLUMNS: readonly ColumnKey[] = COLUMNS.filter((c) => c.required).map(
  (c) => c.key,
);

export function getColumn(key: ColumnKey): ColumnDef {
  // COLUMNS covers every ColumnKey, so the lookup cannot miss.
  return COLUMNS.find((c) => c.key === key) as ColumnDef;
}

/** Case-, space- and punctuation-insensitive header form: "Part No." -> "partno". */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface HeaderResolution {
  /** Template column -> the file header it was read from. */
  mapping: Partial<Record<ColumnKey, string>>;
  /** Headers that matched no template column. */
  unknown: string[];
  /** Headers that matched a column already mapped by an earlier/more specific header. */
  ignoredDuplicates: { header: string; column: ColumnKey }[];
  missingRequired: ColumnKey[];
}

/**
 * Map file headers to template columns. An exact (canonical) name beats an alias;
 * among equals, the leftmost header wins.
 */
export function resolveHeaders(headers: readonly string[]): HeaderResolution {
  const normalized = headers.map(normalizeHeader);
  const mapping: Partial<Record<ColumnKey, string>> = {};
  const used = new Set<number>();

  const claim = (key: ColumnKey, idx: number) => {
    mapping[key] = headers[idx] as string;
    used.add(idx);
  };

  // Pass 1: exact column names.
  for (const col of COLUMNS) {
    const idx = normalized.indexOf(normalizeHeader(col.key));
    if (idx !== -1) claim(col.key, idx);
  }
  // Pass 2: aliases, for columns still unmapped.
  for (const col of COLUMNS) {
    if (mapping[col.key] !== undefined) continue;
    const aliases = new Set(col.aliases.map(normalizeHeader));
    const idx = normalized.findIndex((h, i) => !used.has(i) && aliases.has(h));
    if (idx !== -1) claim(col.key, idx);
  }

  const unknown: string[] = [];
  const ignoredDuplicates: HeaderResolution['ignoredDuplicates'] = [];
  headers.forEach((header, i) => {
    if (used.has(i)) return;
    const column = matchColumn(normalized[i] as string);
    if (column) ignoredDuplicates.push({ header, column });
    else if (header.trim() !== '') unknown.push(header);
  });

  const missingRequired = REQUIRED_COLUMNS.filter((key) => mapping[key] === undefined);
  return { mapping, unknown, ignoredDuplicates, missingRequired };
}

function matchColumn(normalizedHeader: string): ColumnKey | undefined {
  return COLUMNS.find(
    (c) =>
      normalizeHeader(c.key) === normalizedHeader ||
      c.aliases.some((a) => normalizeHeader(a) === normalizedHeader),
  )?.key;
}

/** Project a raw file row onto the template columns; unmapped columns become ''. */
export function toBomRow(
  raw: Readonly<Record<string, string>>,
  mapping: Partial<Record<ColumnKey, string>>,
): BomRow {
  const row = {} as BomRow;
  for (const key of COLUMN_KEYS) {
    const header = mapping[key];
    row[key] = header === undefined ? '' : (raw[header] ?? '');
  }
  return row;
}

export function exampleRow(): string[] {
  return COLUMNS.map((c) => c.example);
}

/**
 * CSV template: header row plus one example row commented out with '#'.
 * The CSV parser is configured with comments: '#', so the example is never imported.
 */
export function buildCsvTemplate(): string {
  const header = toCsv([COLUMN_KEYS]);
  const example = toCsv([exampleRow()]);
  return `${header}#${example}`;
}

export const INSTRUCTIONS_HEADER = [
  'column',
  'required',
  'type',
  'description',
  'also accepted as',
  'example',
] as const;

/** Rows for the "Instructions" sheet of the XLSX template. */
export function instructionRows(): string[][] {
  return COLUMNS.map((c) => [
    c.key,
    c.required ? 'yes' : 'no',
    c.enumValues ? `${c.type} (${c.enumValues.join(' / ')})` : c.type,
    c.description,
    c.aliases.join(', '),
    c.example,
  ]);
}

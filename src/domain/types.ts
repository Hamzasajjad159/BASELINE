// Core domain types. No React, no I/O.

export type ColumnKey =
  | 'assembly_number'
  | 'assembly_revision'
  | 'configuration_name'
  | 'parent_part_number'
  | 'level'
  | 'find_number'
  | 'sequence_number'
  | 'part_number'
  | 'part_revision'
  | 'description'
  | 'quantity'
  | 'uom'
  | 'effectivity_start'
  | 'effectivity_end'
  | 'item_type'
  | 'make_buy'
  | 'reference_designator'
  | 'notes';

export type ColumnType = 'string' | 'int' | 'decimal' | 'date' | 'enum';

export interface ColumnDef {
  key: ColumnKey;
  required: boolean;
  type: ColumnType;
  description: string;
  /** Alternative header names accepted on upload (matched after normalizeHeader). */
  aliases: readonly string[];
  example: string;
  enumValues?: readonly string[];
}

/** A parsed file before column resolution: rows keyed by the file's own headers. */
export interface RawTable {
  headers: string[];
  rows: Record<string, string>[];
  /** 1-based source row number of each data row (as a spreadsheet shows it), parallel to `rows`. */
  sourceRows: number[];
  /** Non-fatal problems found while reading the file (e.g. malformed quotes). */
  parseWarnings: { sourceRow?: number; message: string }[];
}

/** A row after header resolution: every template column present as a (possibly empty) string. */
export type BomRow = Record<ColumnKey, string>;

export interface NormalizedRow {
  /** 1-based row number in the source file (header row = 1). */
  sourceRow: number;
  /** Values as they appeared in the file, for display. */
  raw: BomRow;
  assembly_number: string;
  assembly_revision: string;
  configuration_name: string;
  parent_part_number: string;
  level: number | null;
  find_number: string;
  sequence_number: string | null;
  part_number: string;
  part_revision: string | null;
  description: string;
  quantity: number | null;
  uom: string;
  effectivity_start: string | null;
  effectivity_end: string | null;
  item_type: string | null;
  make_buy: string | null;
  reference_designator: string | null;
  notes: string | null;
  /** How many identical expanded copies were collapsed into this row by dedupe. */
  occurrences: number;
}

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: IssueSeverity;
  /** file-level issues block the comparison when severity is 'error'. */
  scope: 'file' | 'row' | 'cross-file';
  code: string;
  message: string;
  sourceRow?: number;
  column?: ColumnKey;
}

export interface Snapshot {
  label: 'A' | 'B';
  fileName: string;
  checksum: string;
  assemblyNumber: string;
  assemblyRevision: string;
  rows: NormalizedRow[];
}

export type Severity = 'High' | 'Medium' | 'Low';

export type RowStatus = 'ADDED' | 'REMOVED' | 'MOVED' | 'CHANGED' | 'UNCHANGED';

export type FieldChangeType =
  | 'QTY_CHANGED'
  | 'FIND_NO_CHANGED'
  | 'SEQUENCE_CHANGED'
  | 'EFFECTIVITY_CHANGED'
  | 'REVISION_CHANGED'
  | 'UOM_CHANGED'
  | 'ATTRIBUTE_CHANGED';

export type ConfigChangeType = 'CONFIG_ADDED' | 'CONFIG_REMOVED';

export type ComparableField =
  | 'quantity'
  | 'uom'
  | 'find_number'
  | 'sequence_number'
  | 'effectivity_start'
  | 'effectivity_end'
  | 'part_revision'
  | 'description'
  | 'item_type'
  | 'make_buy'
  | 'reference_designator';

export interface FieldChange {
  field: ComparableField;
  type: FieldChangeType;
  before: string | null;
  after: string | null;
}

export interface RowChange {
  key: string;
  status: RowStatus;
  severity: Severity | null;
  a?: NormalizedRow;
  b?: NormalizedRow;
  fields: FieldChange[];
  fromParent?: string;
  toParent?: string;
  configChange?: ConfigChangeType;
}

export interface ConfigCompare {
  name: string;
  inA: boolean;
  inB: boolean;
  status: 'ADDED' | 'REMOVED' | 'CHANGED' | 'UNCHANGED';
  changedRows: number;
}

export interface DiffWarning {
  code: string;
  message: string;
  key?: string;
}

export type ChangeCountKey = RowStatus | FieldChangeType | ConfigChangeType;

export interface DiffOptions {
  ignoreFields: FieldChangeType[];
}

export interface DiffResult {
  header: {
    assemblyNumber: string;
    assemblyRevision: { a: string; b: string; changed: boolean };
  };
  configs: ConfigCompare[];
  rows: RowChange[];
  counts: Record<ChangeCountKey, number>;
  warnings: DiffWarning[];
}

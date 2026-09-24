# Baseline — BOM Compare MVP

## Purpose

A client-side single-page app that demonstrates Baseline's minimum workflow:

1. The user downloads a BOM template (CSV or Excel).
2. The user fills it and uploads two snapshots (CSV or XLSX): **Version A** (baseline) and **Version B** (candidate).
3. The app validates both files, normalizes them, deduplicates expanded subassemblies, diffs them, and highlights every change.
4. The user exports the diff report.

This is a demo MVP. It has no backend, no auth, and no persistence beyond the browser session. It is read-only by design and never writes to any source system. Files never leave the browser, and the UI says so.

Design principle: the diff engine compares two normalized snapshots, whatever they are. Today they are two versions of the same BOM. Later they will be a CAD export and an ERP export (Baseline's cross-source drift check). Keep the engine UI-agnostic and source-agnostic.

## Stack

- Vite + React + TypeScript (strict mode, `noUncheckedIndexedAccess`). TypeScript is pinned to 6.0.x until typescript-eslint supports TS 7.
- Tailwind CSS v4 via `@tailwindcss/vite`
- ESLint (typescript-eslint strict) + Prettier
- `papaparse` for CSV parsing (with `comments: '#'`)
- `exceljs` for XLSX: parsing uploads, the template download, and the report export. Load it with a dynamic `import()` so it stays out of the initial bundle. (SheetJS is not used: the npm copy, 0.18.5, has known vulnerabilities, and its CDN is not reachable from the build environment.)
- `@tanstack/react-virtual` for the diff table
- Vitest + `@vitest/coverage-v8`. `src/domain/**` has a 100% coverage threshold, enforced by `npm run coverage`.
- GitHub Actions CI (`.github/workflows/ci.yml`) runs lint, format check, coverage and build. It has no deploy step yet.
- No server. Everything runs in the browser, and the app deploys as static files (`base: './'`).

## Folder structure

```
src/
  domain/
    types.ts          # BomRow, NormalizedRow, Snapshot, RowChange, FieldChange, DiffResult, ...
    template.ts       # column definitions + header aliases (single source of truth)
    normalize.ts      # identifier + value normalization
    validate.ts       # per-row, per-file and cross-file validation (incl. structure checks)
    dedupe.ts         # collapse repeated expansions of the same subassembly
    diff.ts           # pure diff engine: (A, B, options) => DiffResult
    report.ts         # DiffResult => report rows (CSV text; sheet data for XLSX)
  io/
    parseCsv.ts       # File/text -> RawTable
    parseXlsx.ts      # File/ArrayBuffer -> RawTable (same shape as CSV)
    readFile.ts       # dispatch on extension, SHA-256 of raw bytes via crypto.subtle
    downloadTemplate.ts
    exportReport.ts
  ui/
    UploadPanel.tsx
    ValidationPanel.tsx
    SummaryCards.tsx
    DiffTable.tsx     # virtualized
    ConfigCompare.tsx
    RowDetailDrawer.tsx
  App.tsx
tests/
  diff.test.ts
  normalize.test.ts
  validate.test.ts
  dedupe.test.ts
  structure.test.ts
  parseCsv.test.ts
  parseXlsx.test.ts
  perf.test.ts        # 5,000-row diff < 1 s
public/samples/
  sample_version_A.csv / .xlsx
  sample_version_B.csv / .xlsx   # hand-crafted to trigger every change type
```

## Template (single source of truth in `template.ts`)

The downloadable CSV and XLSX are generated from this definition. Never hand-maintain the column lists.

| Column               | Required | Type              | Notes                                               |
| -------------------- | -------- | ----------------- | --------------------------------------------------- |
| assembly_number      | yes      | string            | Top-level assembly this BOM belongs to              |
| assembly_revision    | yes      | string            |                                                     |
| configuration_name   | yes      | string            | Use `Default` if single-config                      |
| parent_part_number   | yes      | string            | Immediate parent; equals assembly_number at level 1 |
| level                | yes      | int ≥ 1           | Indent level in the structure                       |
| find_number          | yes      | string            | Find/item number on the parent                      |
| sequence_number      | no       | int               | Assembly/operation sequence                         |
| part_number          | yes      | string            |                                                     |
| part_revision        | no       | string            |                                                     |
| description          | yes      | string            |                                                     |
| quantity             | yes      | decimal > 0       | Quantity per parent                                 |
| uom                  | yes      | string            | EA, KG, M, …                                        |
| effectivity_start    | no       | date (YYYY-MM-DD) |                                                     |
| effectivity_end      | no       | date (YYYY-MM-DD) | Blank = open-ended                                  |
| item_type            | no       | string            | Part / Assembly / Reference                         |
| make_buy             | no       | enum              | MAKE / BUY                                          |
| reference_designator | no       | string            |                                                     |
| notes                | no       | string            | Ignored by the diff                                 |

- **Header aliases:** each column has a list of aliases (e.g. `part_number` ← "Part Number", "PN", "Part No", "Item Number"; `quantity` ← "Qty"). Header matching ignores case, spaces, `_`, `-` and `.`. Unknown headers are ignored and listed as an info note.
- **XLSX template:** every data column is formatted as Text (`numFmt '@'`) so Excel does not strip leading zeros or convert part numbers and dates. It includes a second "Instructions" sheet with column descriptions and one example row.
- **CSV template:** a header row plus one example row prefixed with `#`. The parser uses `comments: '#'`, so the example is skipped.

## Normalization (`normalize.ts`)

Apply the same rules to both snapshots before any comparison:

- Trim whitespace and collapse internal runs of whitespace.
- Uppercase part_number, parent_part_number, assembly_number, and uom.
- Strip leading zeros from find_number and sequence_number. This is configurable; default is on.
- Parse quantity as a decimal and compare with a tolerance of 1e-9.
- Normalize dates to ISO format. Accept YYYY-MM-DD, JS `Date` values from XLSX, and Excel serial numbers. Blank effectivity_end means open-ended.
- Warn when a part_number looks mangled by Excel (scientific notation such as `1.23E+05`).
- Keep the raw row and its source row number on every normalized row for display.

## Validation (`validate.ts`)

Validation blocks the comparison only on file-level errors. Row-level problems are listed and the user can proceed.

- File level (per file): missing required columns (after alias resolution), zero data rows, or more than one assembly_number in a file.
- Cross-file: A and B have different assembly_number values. This is an error and blocks the comparison.
- Row level: missing required value, non-numeric or non-positive quantity, bad level, bad date, effectivity_end earlier than effectivity_start, make_buy not MAKE/BUY.
- Row level (structure warnings): parent_part_number does not appear as a part_number (or as the assembly_number) in the same configuration; a child's level is not its parent's level + 1.
- Row level: duplicate matching key within one file after deduplication. This is shown as a warning because it makes matching ambiguous.
- Show row count and a SHA-256 checksum per file. If B has more than 2% fewer rows than A, show a banner that suggests the extraction may be incomplete.

## Deduplication of expanded BOMs (`dedupe.ts`)

Real exports are often fully expanded: if subassembly SA-100 is used twice, its children appear twice with parent SA-100. The BOM is treated as a set of parent→child relationships per configuration.

- Group rows by `configuration_name + parent_part_number + part_number + find_number`.
- Identical repeats (all compared fields equal) collapse into one relationship that records `occurrences: n`.
- Repeats that differ emit a warning ("SA-100 is expanded inconsistently") and are kept as separate rows.
- The same step runs on both A and B before `diff()`.

## Matching key

Each row is matched between A and B on:

**`configuration_name + parent_part_number + part_number`**

Find number is deliberately **not** part of the key. A find-number change must show up as a _change_, not as a remove plus an add.

Duplicate groups (same key with more than one row left after deduplication) are paired as follows:

1. Pair rows with an exact find_number match.
2. Pair the remaining rows by fewest differing fields, using source order as the tie-break.
3. Emit a warning for the group.

## Diff model (`types.ts` / `diff.ts`)

Every matched or unmatched row produces one `RowChange` with a **row status** and a `fields[]` list of field changes:

```ts
type RowStatus = 'ADDED' | 'REMOVED' | 'MOVED' | 'CHANGED' | 'UNCHANGED';
type FieldChangeType =
  | 'QTY_CHANGED'
  | 'FIND_NO_CHANGED'
  | 'SEQUENCE_CHANGED'
  | 'EFFECTIVITY_CHANGED'
  | 'REVISION_CHANGED'
  | 'UOM_CHANGED'
  | 'ATTRIBUTE_CHANGED';
interface FieldChange {
  field: ComparableField;
  type: FieldChangeType;
  before: string | null;
  after: string | null;
}
interface RowChange {
  key: string;
  status: RowStatus;
  severity: Severity | null;
  a?: NormalizedRow;
  b?: NormalizedRow;
  fields: FieldChange[];
  fromParent?: string;
  toParent?: string; // MOVED only
  configChange?: 'CONFIG_ADDED' | 'CONFIG_REMOVED'; // row belongs to a config present in only one version
}
```

| Type                          | Kind       | Rule                                                                                                                                                                                                                       | Severity          |
| ----------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| ADDED                         | row status | Key in B, not in A                                                                                                                                                                                                         | High              |
| REMOVED                       | row status | Key in A, not in B                                                                                                                                                                                                         | High              |
| MOVED                         | row status | Within one configuration, a part_number is REMOVED under exactly one parent and ADDED under exactly one other parent. It collapses that REMOVED + ADDED pair and keeps its `fields[]`. Any other case stays ADDED/REMOVED. | High              |
| CHANGED                       | row status | Matched and `fields[]` non-empty                                                                                                                                                                                           | max of its fields |
| QTY_CHANGED                   | field      | quantity differs beyond 1e-9                                                                                                                                                                                               | High              |
| UOM_CHANGED                   | field      | uom differs                                                                                                                                                                                                                | High              |
| FIND_NO_CHANGED               | field      | find_number differs                                                                                                                                                                                                        | Medium            |
| SEQUENCE_CHANGED              | field      | sequence_number differs                                                                                                                                                                                                    | Medium            |
| EFFECTIVITY_CHANGED           | field      | start or end differs                                                                                                                                                                                                       | Medium            |
| REVISION_CHANGED              | field      | part_revision differs                                                                                                                                                                                                      | Medium            |
| ATTRIBUTE_CHANGED             | field      | description, item_type, make_buy, or reference_designator differ                                                                                                                                                           | Low               |
| CONFIG_ADDED / CONFIG_REMOVED | config     | A configuration_name exists in only one version                                                                                                                                                                            | High              |

- `level` is not diffed on its own. It follows from the parent, so a parent change is covered by MOVED.
- Rows in an added or removed configuration are tagged with `configChange` and are **left out of the ADDED/REMOVED counts**. The UI groups them under the configuration.
- Header comparison: if assembly_revision differs between A and B, show it in the summary, not as a row change.
- `DiffResult` includes `counts` per row status, field change type and config change. A row with several field changes counts once in CHANGED and once in each of its field types.
- `diff(a, b, options)` options: `ignoreFields: FieldChangeType[]` (drives the UI's field-ignore toggles). Normalization options such as leading-zero stripping apply earlier, in `normalize`.
- `diff()` must be a pure function with no I/O and no React. All tests target it directly.

## UI flow (single page, top to bottom)

1. **Header** with "Download template (CSV)", "Download template (Excel)", and "Load sample data", plus the "processed locally, never uploaded" notice.
2. **Upload panel** with two drop zones labeled Version A and Version B that accept `.csv` and `.xlsx`. Each shows file name, row count, and checksum after upload.
3. **Validation panel**, which can be collapsed. It shows errors, warnings, and info (unknown headers, dedupe notes) per file. The Compare button stays disabled while file-level or cross-file errors exist.
4. **Summary cards** showing counts per row status and field change type, plus unchanged rows and the assembly-revision change. Clicking a card filters the table.
5. **Configuration compare**, a small table of configurations in A vs. B with added/removed/changed badges.
6. **Diff table** (virtualized) with these columns: status badge, configuration, parent, find no., part number, description, and changed fields.
   - Row colors: green = added, red = removed, amber = changed, blue = moved.
   - Changed cells show the value as `before → after`, with the before value struck through.
   - Filters: change type, configuration, parent, and a text search. There is a toggle to show unchanged rows, and toggles to ignore field change types (e.g. ATTRIBUTE_CHANGED).
   - Clicking a row opens a drawer with the full A and B rows side by side (raw values and source row numbers).
7. **Export** the diff report as CSV or XLSX. The XLSX has three sheets:
   - Summary: file names, SHA-256 checksums, row counts, timestamp, options used, assembly revision A→B, counts
   - Changes
   - Warnings

## Non-goals for this MVP

No backend, no login, no database, no ERP/CAD connectors, no trust score, no procurement drafts, no notifications, no editing of BOM data, no deploy pipeline (yet).

## Build order (do one phase at a time; stop for review after each)

1. **Scaffold**: Vite + React + TS + Tailwind v4 + Vitest + coverage, lint and format, CI workflow, empty page renders.
2. **Domain**: types, template definition + aliases, template download (CSV + text-formatted XLSX).
3. **Parse (CSV + XLSX) + normalize + validate + dedupe**, with unit tests.
4. **Diff engine**, with unit tests covering every change type, duplicate-group pairing, MOVED (the single-parent rule and the ambiguous case staying ADDED/REMOVED), config add/remove grouping, and `ignoreFields`.
5. **Sample data**: A and B files (CSV + XLSX) that trigger every change type at least once. 30–60 rows, 2 configurations, 3 levels, and one repeated subassembly.
6. **UI**: upload → validation → summary → config compare → diff table → drawer.
7. **Export** the report as CSV and XLSX.
8. **Polish**: empty states, error messages, and a perf test (5,000 rows diff in under 1 s in Vitest). Also check table scrolling manually.

## Conventions

- Run `npm run lint`, `npm test` (or `npm run coverage`) and `npm run build` after each phase. All must pass before moving on.
- No `any`. Domain code has no React imports and no `io/` imports (enforced by ESLint).
- Commit per phase with a clear message.

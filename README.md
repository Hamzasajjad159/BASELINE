# Baseline — BOM Compare

**Live app: https://hamzasajjad159.github.io/BASELINE/**

Compare two bills of materials and see every change: added, removed, moved and changed rows, with the before and after value of each field. Everything runs in the browser, so files are never uploaded anywhere.

## Using it

1. **Get a template.** Click _Download template (CSV)_ or _Download template (Excel)_. The Excel template is formatted as text, so leading zeros and long part numbers survive.
2. **Upload two versions.** Put the baseline in **Version A** and the candidate in **Version B** (`.csv` or `.xlsx`). Common header names such as "Part No", "Qty" and "Item No" are recognized automatically.
3. **Check validation.** Problems are listed by file and row. Only file-level problems block the comparison, for example missing columns or two different assemblies.
4. **Compare.**
   - The summary cards count each kind of change. Click a card, or a configuration, to filter the table.
   - Click any row to see the full A and B rows side by side.
5. **Export.** Download the report as CSV, or as Excel with Summary, Changes and Warnings sheets.

Or click **Load sample data** to try it with a ready-made example that triggers every change type.

### How rows are matched

- Rows are matched on **configuration + parent + part number**, so a find-number change shows up as a change, not as a remove plus an add.
- Repeated copies of the same subassembly in expanded BOMs are merged before comparing.
- A part that leaves exactly one parent and appears under exactly one other shows as **moved**.

`CLAUDE.md` has the full rules.

## Development

```sh
npm install
npm run dev        # local dev server
npm test           # unit tests
npm run coverage   # tests + 100% coverage threshold on src/domain
npm run lint       # ESLint
npm run build      # type-check and build static files into dist/
npm run samples    # rebuild the XLSX samples from the CSV samples
```

The build is a static site with relative paths, so `dist/` can be served from any host or sub-path. CI runs lint, format check, coverage and build on every push, and every push to `main` is deployed to GitHub Pages by `.github/workflows/deploy.yml`.

Stack: Vite, React, TypeScript (strict), Tailwind CSS, papaparse, ExcelJS (loaded only when needed), TanStack Virtual, Vitest.

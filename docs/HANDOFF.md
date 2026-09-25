# Session handoff — Baseline BOM Compare

Read this at the start of a new session to pick up where the last one stopped. `CLAUDE.md` is the spec (how the app must behave). This file is the history: what was built, why some decisions were made, how we work, and what's next.

_Last updated: 2026-09-25_

## 1. Where things stand

- **The MVP is complete and deployed.** All 8 build phases from `CLAUDE.md`, plus deployment, are merged into `main`.
- **Live app:** https://hamzasajjad159.github.io/BASELINE/, redeployed automatically on every push to `main`.
- **Repo:** `Hamzasajjad159/BASELINE`. It is **public**, which the free GitHub plan requires for Pages. The full history was scanned for secrets before it went public and none were found.
- **Tests:** 145 passing. `src/domain/**` is at 100% statements, branches, functions and lines, and `npm run coverage` enforces that.
- **Open PRs:** none. Scheduled check-ins: none.

| PR  | Content                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- |
| #1  | Phase 1: scaffold (Vite, React, TS strict, Tailwind v4, Vitest + coverage, ESLint/Prettier, CI) and the revised spec in `CLAUDE.md` |
| #2  | Phase 2: types, template columns + header aliases, CSV/XLSX template downloads                                                      |
| #3  | Phase 3: CSV/XLSX parsing, normalization, validation, merging repeated subassemblies (dedupe)                                       |
| #4  | Phase 4: diff engine plus the 5,000-row performance test                                                                            |
| #5  | Phase 5: sample data (ASM-2000 conveyor drive) that triggers every change type                                                      |
| #6  | Phase 6: UI (upload, validation, summary cards, configuration table, virtualized diff table, row drawer)                            |
| #7  | Phase 7: CSV and XLSX report export                                                                                                 |
| #8  | Phase 8: polish (clearer errors, empty states, large-file check) and README                                                         |
| #9  | GitHub Pages deploy workflow                                                                                                        |

## 2. Decisions that differ from the original plan (and why)

The first plan was reviewed with the user at the start of session 1. These changes were agreed and are now in `CLAUDE.md`:

- **Excel files can be uploaded, not just downloaded.** Anyone who fills in the Excel template expects to upload it.
- **Header aliases.** "PN", "Qty", "Item No" and similar are recognized. "Item No" / "Item Number" map to **find_number** (the SolidWorks convention), not to part_number. If an ERP uses "Item Number" to mean part number, change it in `template.ts`.
- **Expanded BOMs are merged (dedupe).** Rows with the same configuration + parent + part + find number that are otherwise identical collapse into one, with `occurrences: n`. The user confirmed their exports are fully expanded.
- **One status per row plus a list of field changes**, instead of a flat list of change types.
- **Moved is strict.** A row is MOVED only when the part is removed under exactly one parent and added under exactly one other. Anything else stays added/removed.
- **Configuration changes are grouped.** Rows of an added or removed configuration are tagged and left out of the added/removed counts.
- **Checks across the two files:** A and B for different assemblies blocks the comparison. B having more than 2% fewer rows than A gives a warning.
- **ExcelJS instead of SheetJS.** The npm copy of SheetJS (0.18.5) has known vulnerabilities, and cdn.sheetjs.com is blocked in the cloud sandbox. ExcelJS is lazy-loaded (~930 kB chunk). `uuid` is overridden to `^11.1.1` to clear an advisory in an ExcelJS dependency.
- **TypeScript is pinned to 6.0.x** because typescript-eslint does not support TS 7 yet.
- **Other details:**
  - The CSV parser skips `#` and blank rows itself and detects the delimiter from the header line, so row numbers match Excel and semicolon CSVs work.
  - Excel serial dates are accepted from 61 (1900-03-01) upward.
  - Invalid values become `null`, so each problem is reported once.
  - A duplicate group needing more than 250,000 pairing comparisons falls back to pairing in source order.
  - CSV exports guard against formula injection (a leading `'`), and Excel exports write every cell as text.
- **Samples:** each file has 2 main configurations (Standard, Heavy Duty), plus Compact (only in A) and Washdown (only in B) to show configuration add/remove.
- **Hosting:** GitHub Pages with Source: GitHub Actions and no custom domain. The user has no domain; leave that field empty.

## 3. How we work (conventions from session 1)

- **One PR per phase or feature.** Claude opens the PR, subscribes to it and schedules roughly hourly check-ins. **The user reviews and merges.** When it's merged, Claude cancels the check-in, resets the branch to the new `main` and starts the next piece.
- **Branch:** `claude/vigilant-ride-jn0zxs`, recreated from `origin/main` after each merge (`git fetch origin main && git checkout -B claude/vigilant-ride-jn0zxs origin/main`). Never stack new work on history that is already merged.
- **Before every push:** `npm run lint`, `npm run format:check`, `npm run coverage` (100% domain threshold) and `npm run build` must all pass.
- **Commit messages** end with the Co-Authored-By / Claude-Session lines. PR bodies end with the Claude Code footer.
- **Keep `CLAUDE.md` current** whenever a design decision changes, and update this file at the end of a session.
- **Stop for review after each phase or feature.** The user is happy with Claude driving, but wants to merge each step themselves.

## 4. Environment notes (cloud sandbox)

- **Blocked hosts:** `cdn.sheetjs.com` and `*.github.io` (the proxy returns 403). **You can't curl the live site.** Verify deployments through the GitHub Actions API instead: the latest `deploy.yml` run with both the `build` and `deploy` jobs green.
- **Browser testing:**
  - Chromium is at `/opt/pw-browsers` and Playwright at `/opt/node22/lib/node_modules/playwright`.
  - Pattern: `npm run build`, run `npx vite preview --port 4173` in the background, drive it with a Node script in the scratchpad, then `pkill -f "vite preview"`.
  - To check the Pages sub-path, copy `dist/` to `<dir>/BASELINE/` and serve it with `python3 -m http.server`.
- **Test gotchas:**
  - Playwright's `has-text` matches substrings without regard to case: "Moved" also matches "Removed". Use `:text-is()`.
  - The Excel template pre-creates rows 2–5000 for the MAKE/BUY dropdown, so tests must write to row 2 directly rather than use `addRow`.
  - `npm run samples` rebuilds the XLSX samples with new zip timestamps, so the bytes change even when the content doesn't. Only rerun it after editing a CSV sample. `tests/samples.test.ts` checks that each XLSX matches its CSV.
- **Measured performance** (two 5,000-row files, headless Chromium): load and validate ~0.5 s, compare and render ~0.2 s, table scroll at 60 fps with ~30–40 rows in the DOM. The Vitest diff itself takes ~80 ms.

## 5. Known limitations and small open items

- **Deploy warnings:**
  - The deploy log warns that Node.js 20 is deprecated in `actions/checkout@v4`, `setup-node@v4` and `configure-pages@v5`. It's harmless for now; bump them to their Node 24 versions in a small PR.
  - The `ubuntu-latest` → Ubuntu 26 notice is informational only.
- **No UI component tests.** Only `domain/` and `io/` are unit-tested; the UI is checked with ad-hoc Playwright scripts. A small Playwright or Testing Library suite in CI would help.
- **Comparisons are exact apart from normalization:**
  - `item_type`, description and similar fields are case-sensitive.
  - A unit change is not converted: 0.8 L → 0.72 KG shows as two changes.
- **The export ignores table filters** (by design). It follows the ignore settings and the "include unchanged" option only.
- **Sample loading compares automatically.** Uploading your own files requires clicking Compare.

## 6. Suggested next steps (not started)

1. **Try real exports** from the user's CAD and ERP systems, then extend the header aliases or add a small column-mapping step in the upload panel.
2. **Cross-source drift check (CAD vs ERP)**, Baseline's real goal. The diff engine doesn't care where the files came from. Likely work:
   - source profiles: per-system header mapping and value conventions
   - labels "CAD" and "ERP" instead of A and B
   - some fields may need tolerance rules
3. **Tree / indented view** of the BOM, next to the flat table.
4. **Housekeeping:** bump the GitHub Action versions (Node 24) and add UI tests to CI.

## 7. How to resume

Open a new session on this repo and say, for example:

> Read `docs/HANDOFF.md` and `CLAUDE.md`, then let's work on _<next step>_. Same workflow as before: one PR, you watch it, I merge.

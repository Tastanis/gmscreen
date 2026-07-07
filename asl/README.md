# ASL Hub (unified ASL 1 / 2 / 3)

One codebase replaces the old duplicated `asl1/` + `asl2/` proficiency system.
The old folders are untouched (bingo, scroller, goals still live there) — this
folder is the new home for accounts, dashboards, grading, and rubrics.

## Deploying to the live site

1. Upload the whole `asl/` folder to the web root (next to `asl1/`, `dnd/`, etc.).
2. On the server, copy `config.local.example.php` → `config.local.php` and fill in
   the database credentials. **Create a NEW password for `asl_admin` in your hosting
   panel first** — the old one was committed to git history and must be retired.
3. Visit `https://yoursite/asl/install.php` and click **Run Install / Update**. This
   creates/upgrades all tables (additive only — it never deletes anything), imports
   the 7 proficiency rubric documents (960 rubric rows), and creates both teacher
   accounts.
4. Log in and change both teacher passwords right away (Settings page):
   - Harms (admin): first name `Brandon`, starter password `HarmsASL2026`
   - Parks: first name `Ms.`, starter password `ParksASL2026`
5. Optional: set the school-year dates and signup code in Settings.

Re-run `install.php` any time rubric wording changes (regenerate
`data/rubric_seed.json` first) — student scores are never touched.

## Who can do what

- **Students** — see only their own dashboard: progress chart with pace lines,
  bucket dots, rubrics, resources, attendance/participation overlays, notes.
  They pick teacher/period/level once at signup; only teachers can change them after.
- **Ms. Parks** — full control of *her* students (grading, weekly logs, editing
  info, password resets, deactivation) + her own password.
- **Mr. Harms (admin)** — everything, for all students, plus: year/pace settings,
  signup code, teacher passwords, Excel export/import, SQL backups, and the
  temporary **Start Fresh** wipe.

## Data safety rules baked into the code

- Schema and seeding are strictly additive; retired content is deactivated, never deleted.
- Every score change is also appended to an immutable history table (drives the chart).
- Clearing a non-empty note requires an explicit confirmation (blank-overwrite guard).
- Export (Settings) produces one Excel workbook holding the entire database; the
  importer reads the same file back with a preview-first, add/update-only restore.
- Import and Start Fresh both take automatic SQL + Excel backups before writing.
- Server-side backups live in `asl/backups/` (web access denied; newest 40 kept).

## Weekly teacher rhythm

1. **Grading** tab — pick level + bucket, click cells (left-click up, right-click down).
2. **Weekly Log** tab — one screen per week: absences, participation points, note.
3. Every week or two: Settings → **Download Excel Export**, keep it somewhere safe.

## Pace lines

Lines start at week 2 and are computed from real data:
`(gradable skills at the student's level × goal score) ÷ (school weeks − 2)`.
Current skill counts: ASL 1 = 60, ASL 2 = 66, ASL 3 = 66 — so "all 3s" (green) is
about 5.1 pts/week for ASL 1 over a 36-week year. Goals are adjustable in Settings.

## Removing the Start Fresh tool after launch

Delete `api/wipe.php` and the "Start Fresh" section in `teacher/settings.php`.

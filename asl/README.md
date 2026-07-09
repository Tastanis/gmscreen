# ASL Hub (unified ASL 1 / 2 / 3)

One codebase replaces the old duplicated `asl1/` + `asl2/` proficiency system.
The old folders remain untouched for legacy tools such as Bingo and Goals. Only
the single-computer Scroller was migrated. The student/teacher dashboards,
grading, rubrics, school calendar, attendance, and participation live under `asl/`.

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
5. In Settings, upload the shared school-calendar JSON and set the participation
   maximum and signup code. Pace outcomes are fixed from the grading rules.

Re-run `install.php` any time rubric wording changes (regenerate
`data/rubric_seed.json` first) — student scores are never touched.

## Who can do what

- **Students** — see only their own dashboard: one switchable chart stage for
  proficiency, attendance, and participation; pace lines; bucket dots; rubrics;
  resources; notes; and play-only access to the Scroller. Only teachers manage
  word banks/settings.
- **Ms. Parks** — full control of *her* students (grading, block-entry grids,
  Scroller banks, editing info, password resets, deactivation) + her own password.
- **Mr. Harms (admin)** — everything, for all students, plus: calendar/participation settings,
  signup code, teacher passwords, Excel export/import, SQL backups, and the
  temporary **Start Fresh** wipe.

## Data safety rules baked into the code

- Schema is additive. The rubric seed is validated for completeness before it
  may deactivate retired content, and Install creates a safety backup first when
  student grading data exists.
- Every score change is also appended to an immutable history table (drives the chart).
- Block attendance/participation saves are transactional, version checked, and
  audit logged. Finalized changes retain who/when audit history without requiring
  the teacher to enter a justification.
- Entry grids keep browser-local drafts, show dirty cells, save as a batch, retry
  safely, and warn before leaving with unsaved work.
- Excel export/import is the preview-first, add/update-only portable class-data
  format. SQL is the complete disaster-recovery backup.
- Import, calendar replacement, Install reseeding, hard student deletion, and
  Start Fresh take automatic SQL + Excel backups before writing.
- Backup reads use a consistent database snapshot and atomic filenames.
- Server-side backups live in `asl/backups/` (web access denied; newest 40 kept).
- `scripts/nightly_backup.php` is the CLI entry point for Task Scheduler/cron.
  Copy backups off the web server using encrypted storage approved by the school.

## Ten-school-day teacher rhythm

1. **Grading** tab — pick level + bucket, click cells (left-click up, right-click down).
2. **Attendance & Participation** tab — students down the left, reporting blocks
   across the top. Blank attendance means zero absences; blank participation means
   the saved block maximum. Enter moves down and Tab moves right.
3. Every week or two: Settings → **Download Excel Export**, keep it somewhere safe.

## Pace lines

The pace lines advance in proportion to the instructional days elapsed in the
uploaded calendar, so breaks and weekends never steepen the expected pace. At the
last school day, green ends at all 3s (average 3.0), red at 25% 2s plus 75% 3s
(average 2.75), and blue at 25% 4s plus 75% 3s (average 3.25).

At a checkpoint the chart uses the latest saved score for each skill. Repeatedly
cycling a score during one block does not add every click; only the final value at
the checkpoint contributes. Past checkpoints remain historical snapshots.

## Calendar JSON

Settings shows a copyable example. The required top-level fields are
`school_year`, IANA `timezone`, and `days`. Each day is a unique object containing
`date` (`YYYY-MM-DD`), boolean `instructional`, and an optional `label`. Upload is
preview-first. A new calendar cannot remap finalized blocks.

## Disposable test data

`tests/disposable_test_db.php` creates a separate database whose name must end in
`_codex_disposable_test`, with fake `@example.invalid` students and a completed
year of history. It has a separate confirmation-protected drop command. The local
machine needs a running MySQL/MariaDB service; see `tests/README.md`.

## Removing the Start Fresh tool after launch

Delete `api/wipe.php` and the "Start Fresh" section in `teacher/settings.php`.

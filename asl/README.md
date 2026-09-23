# ASL Hub at the domain root

The application remains in asl/ on disk. Root .htaccess serves the new site at the domain root and redirects old ASL bookmarks. Goals and Scroller both live in the new application. DND paths are unchanged.

Deploy through cPanel Git deployment. The deployment copies root .htaccess and runs the CLI retirement script, which archives asl1, asl2 and the old index.html outside public_html. It never changes database records.

Public student registration is closed. Teacher-managed roster uploads will be designed separately. No roster upload interface is included in this migration.

For the initial account reset, use the admin Start Fresh tool after verifying SQL and Excel backups. Teacher accounts and curriculum remain; student accounts, scores, attendance and goals are removed. This is separate from deployment. New proficiency documents have not been imported in this change.

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
- Entry grids autosave version-checked batches and retain browser-local drafts.
  Uncertain saves are not replayed automatically; reload checks the current value.
  Completed blocks remain directly editable and changes retain their audit trail.
  Above-maximum participation values save with a nonblocking name/overage warning.
- Excel export/import is the preview-first, add/update-only portable class-data
  format. SQL is the complete disaster-recovery backup.
- Import, calendar replacement, Install reseeding, hard student deletion, and
  Start Fresh take automatic SQL + Excel backups before writing.
- Backup reads use a consistent database snapshot and atomic filenames.
- Backups default to `<hosting-account-home>/asl-private-backups/`, outside both
  the deployed website and checkout. Override with `backup_dir` in the private
  `config.local.php` or the server-only `ASLHUB_BACKUP_DIR` environment variable.
  Existing files in the old `asl/backups/` folder are left untouched.
- Every authenticated teacher request checks for a full SQL snapshot for today
  and the latest started reporting block, before that request edits data.
  `automatic/daily-YYYY-MM-DD.sql` retains 60 daily snapshots;
  `automatic/block-YYYY-MM-DD.sql` retains each block's first-use snapshot without
  automatic deletion. No visit means no new request-triggered snapshot that day.
  The existing nightly CLI script also runs this check if scheduled by the host.
  Failed attempts log `ASL automatic backup failed` and retry on the next request.
- Manual SQL/Excel backups retain the newest 40 files separately from automatic
  snapshots. A file lock prevents overlapping automatic backups; only completed
  atomic files count as successful snapshots.
- To recover after database loss, import a selected SQL snapshot with MySQL or
  phpMyAdmin into an empty recovery database first and check users, skills,
  score history, reporting blocks and block metrics before switching the site's
  private database configuration. SQL restore replaces the included ASL tables.
  These files contain student records and account hashes; keep them private.
  Outside-webroot storage protects against ordinary website deployment, but
  remains on the same server and cannot protect against loss of that server.
- `scripts/nightly_backup.php` is the CLI entry point for Task Scheduler/cron.
  Copy backups off the web server using encrypted storage approved by the school.

## Two-week teacher rhythm

1. **Grading** tab — pick period, level, competency and assessment mode, click cells (left-click up, right-click down).
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
preview-first. A new calendar cannot remap finalized blocks. Reporting blocks use
fixed two-week windows ending on Fridays; holidays reduce instructional days
without moving the next block. Participation is three points per instructional
day. Proficiency expectations advance by instructional days, so a two-day week
requires two-fifths of the progress of a five-day week. Closed weeks add neither
participation points nor expected proficiency progress.

Teachers can open Report card beside Enter participation on a student's dashboard.
The one-page report contains completion, projected grade, changes since the prior
block, attendance comparison, participation totals, a small progress graph and a
blank comments area. Print opens the browser print dialog.

## Disposable test data

`tests/disposable_test_db.php` creates a separate database whose name must end in
`_codex_disposable_test`, with fake `@example.invalid` students and a completed
year of history. It has a separate confirmation-protected drop command. The local
machine needs a running MySQL/MariaDB service; see `tests/README.md`.

## Removing the Start Fresh tool after launch

Delete `api/wipe.php` and the "Start Fresh" section in `teacher/settings.php`.

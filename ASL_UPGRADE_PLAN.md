# ASL Hub Upgrade Plan

Goal: one integrated ASL 1/2/3 teacher–student dashboard, ready for next school year. Students see their proficiency progress, pace lines, rubrics, resources, attendance, and participation. Teachers input everything, manage students, and can back up / restore all data.

---

## Current state (what exists today)

- PHP + MySQL. `asl1/` and `asl2/` are two near-complete copies of the same code, sharing some logic in `common/`.
- Data model already close to what's needed: `asl_skill_buckets` → `asl_standards` → `asl_learning_targets` (per level, 0–4 score) → `user_learning_targets` + append-only `user_learning_target_score_history`. `asl_student_meetings` holds absences / participation / notes per date.
- Student dashboard (`asl1/dashboard.php`) has the Progress Over Time canvas chart, buckets/standards/learning-targets browser, class-period selector at top, and attendance/participation/notes cards at bottom.
- Teacher dashboard (`asl1/teacher_dashboard.php`, ~92KB) has student cards with period filter, score entry, meeting logging.

### Problems found (must fix)

1. **Destructive seeder** — `common/asl_student_dashboard_data.php` DELETEs all student scores, history, and resources if the bucket taxonomy changes. One taxonomy edit = every grade wiped.
2. **DB password in git** — `config.php` contains the MySQL password and it's in the repo history. Signup preset password `MGHS` is hardcoded in `register.php`.
3. **Auth gaps** — some endpoints trust a POSTed `user_id`; a student who edits a request could read/write another student's data.
4. **No backups, no export/import** of any kind.
5. **Triple maintenance** — every fix must be made in `asl1/`, `asl2/`, and soon `asl3/`.

---

## Phase 0 — Safety net (do first, before touching anything else)

Nothing else gets built until data can't be lost.

- **Backup script**: nightly `mysqldump` of the ASL database to a dated file, keep 30 days + one per month. A "Backup now" button on the teacher settings page.
- **Fix the destructive seeder**: seeding may only INSERT missing rows. It never deletes buckets/standards/targets that have student scores attached; retired taxonomy items get `active = 0` instead. Add a startup guard that logs and refuses any automatic DELETE of `user_learning_targets` / score history.
- **Blank-overwrite guard**: any save endpoint rejects a write that would replace non-empty data with empty data unless the request carries an explicit `confirm_blank=1` flag (teacher UI shows a "you're about to clear this" confirmation). This is the direct fix for "a page loads blank and saves blank over real data."
- **Score history stays append-only** — current scores can always be rebuilt from history.

## Phase 1 — Consolidate to one codebase

- New single `asl/` directory replaces `asl1/` + `asl2/` (+ would-be `asl3/`). One set of PHP, CSS, JS. Level (1/2/3) becomes data: a column on the student and on content, never a folder.
- `asl1/` and `asl2/` become tiny redirect stubs so old bookmarks keep working.
- One `config.php` that includes a git-ignored `config.local.php` holding credentials. **Rotate the MySQL password** (the old one is in git history) and move the signup code + teacher passwords into settings, not source.
- Keep the existing tables — this is a code consolidation, not a data rewrite. Migrate any rows that differ between the asl1/asl2 databases (if they point at separate DBs, merge into one).

## Phase 2 — Accounts, signup, security

### Schema
- `users`: add `teacher` (enum `harms` / `parks`), keep `class_period` (1–6) and `level` (1/2/3, extend to allow 3), add `is_active` for soft delete, add `must_change_password` flag.

### Signup (rebuilt, less janky)
One clean form: first name, last name, email, password ×2, then three dropdowns — **Teacher** (Harms / Parks), **Period** (1–6), **ASL level** (1 / 2 / 3) — plus the class signup code. Dropdowns, not free text, so no misspelled "parks". Server validates everything; friendly inline error messages instead of redirect-with-flash.

### Teachers
- Seed a Parks teacher account; Brandon sets her specific password via the existing `set_teacher_password.php` bootstrap pattern (password never in source).
- Both teachers land on the same teacher dashboard, default-filtered to **their own students** (`teacher = me`), with a toggle to view all. Every roster view filterable by teacher, period, and level.

### Authorization (closes the student-jumping hole)
- Student endpoints **derive user_id from the session only** — no student-supplied IDs accepted, ever. Audit every endpoint under `asl/` and `common/` for this.
- Teacher-only endpoints check `is_teacher` server-side (several currently rely on the button being hidden).
- CSRF token on all state-changing POSTs; login rate-limiting (5 tries, then 60s delay); session cookie set `HttpOnly` + `SameSite=Lax`; passwords stay bcrypt.

### Teacher control over student records
From the teacher dashboard, per student: edit name, email, period, level, teacher; reset password; deactivate (soft delete — data kept, login blocked) and reactivate. "Delete and remake" becomes unnecessary but a true delete stays available behind a double confirmation, and it archives the student's data to the export format first.

## Phase 3 — Rubric data import

The 7 uploaded rubric docs become the seed content. Structure in the docs: bucket → standard (e.g. CLS.1) → sub-target (CLS.1.a) → one column per ASL level (CLS.1.1a / CLS.1.2a / CLS.1.3a) → descriptor text for scores 4/3/2/1/0.

- **Schema**: keep `asl_learning_targets` as the gradable unit (one row per sub-target × level, e.g. CLS.1.1a) but stop calling it "learning target" anywhere user-facing. Add `asl_rubric_levels` (`target_id`, `score` 0–4, `descriptor TEXT`) holding the rubric text.
- **One-time importer script** parses the 7 .docx files and seeds buckets, standards, sub-targets, and all rubric rows for all three levels. Re-runnable: updates descriptor text in place, never deletes scored targets.
- **Reconcile bucket codes**: DB uses CLF/SPG etc., docs use CLS etc. Pick the doc codes as canonical, migrate existing `bucket_id`s with an UPDATE mapping (not delete + reseed).
- **Remove the 21C bucket**: export its data into a one-time archive file, then deactivate it so it disappears from dashboards and from all pace/progress math.
- Verify counts after import: with ~7 buckets × 3–6 standards × 1–4 sub-targets, confirm the actual per-level target count, because the pace lines depend on it (next phase).

## Phase 4 — Student dashboard

### Terminology & layout cleanup
- Remove the class-period selector from the top (set at signup, teacher-editable only).
- The words "learning target(s)" disappear everywhere. Hierarchy shown as **Buckets → Standards → Proficiency Rubric**.
- Main page right panel (where "Learning Targets" was): intentionally blank for now, built as an empty panel component so something useful can drop in later.
- Clicking a standard: right panel titled **Proficiency Rubric** shows the full 4→0 rubric for that standard at the student's level, with the row they've been graded at highlighted. Resources listed below it. The "teacher added learning target" placeholder is gone; resources show only what actually exists (single subtle "no resources yet" line if empty).

### Color coding (used everywhere, one shared CSS/JS definition)
| Score | Color |
|---|---|
| 0 / ungraded | gray/blank |
| 1 | red |
| 2 | yellow |
| 3 | green |
| 4 | blue |

- Each **standard** row/card is tinted with the student's current color for it.
- Each **bucket** card gets a dot strip on its right side — one dot per standard at that student's level — so the landing page shows at a glance how every bucket is going.
- A standard's color comes from its sub-target scores. *Default: the average of graded sub-targets, rounded down (shows the weakest honest picture). Confirm this rule before build.*

### Progress Over Time chart — pace lines
Three reference lines drawn from **week 2** (week 1 = no proficiency work) to the last week of the year, on top of the existing student progress line:

- **Green** — "all 3s" pace (≈4.5 points/week): finish the year with 3 on every target.
- **Blue** — "reaching for 4s" pace (≈5.5 points/week).
- **Red** — failing pace (≈3 points/week → all 2s).

Rather than hardcoding 4.5/5.5/3, the system computes exact slopes from real data: `(target count for the student's level × goal score) ÷ (instructional weeks − 1)`. The teacher settings page (Phase 6) stores year start date, year end date, and the three goal levels; defaults produce Brandon's 4.5/5.5/3 numbers. Student's own line at-or-above green reads as "on track" with a small label.

### Attendance / participation / notes (bottom cards → chart overlays)
- Clicking the **Attendance** card toggles an absences-per-week line onto the chart; clicking **Participation** toggles a weekly participation-points line. Both use a **second Y-axis on the far right** so their scale doesn't distort the proficiency scale. Clicking again removes the line.
- Clicking **Notes** opens a pop-out of notes grouped by month.
- Participation switches from a percentage to **weekly points** (Smart Classroom Management style): add `participation_points` to `asl_student_meetings` (keep the old pct column for history), entered per student per week.

## Phase 5 — Teacher dashboard & data entry

Design principle: every input is reachable in ≤2 clicks from the roster and works as a grid, because Brandon will be doing this weekly for ~150 students.

- **Grading grid**: pick level + bucket + standard → grid of students (filtered by teacher/period) × sub-targets. Click a cell to cycle 0→1→2→3→4 (colors match the student view), autosaves each click, writes score history. Keyboard entry (type 0–4, arrow keys) for speed.
- **Weekly log grid**: pick a week → grid of students × (absences, participation points, note). One screen enters the whole class's week. Notes expand inline.
- **Resource manager**: per standard × level, add/edit/reorder/delete link-or-text resources. No pre-baked placeholders.
- **Student manager**: per Phase 2 — edit fields, reset password, deactivate.
- **Student detail view**: teacher sees exactly what the student sees (chart, dots, rubric colors) plus edit controls — the fastest way to answer "why does my graph look like this?" at a desk.

## Phase 6 — Settings, export/import, backups

### Teacher settings page (Harms only, or both — decide)
Year start/end dates, pace goal levels, signup code, Parks password reset, backup-now button, restore-from-file.

### Excel export (full snapshot)
One .xlsx download containing every sheet needed to rebuild the class: Students, Scores (current), Score History, Meetings (attendance/participation/notes), Buckets/Standards/Targets, Rubric Text, Resources, Settings. This doubles as the human-readable backup Brandon can keep anywhere.

### Excel import (restore)
- Upload the same workbook format. Import runs a **dry-run first**: shows exactly what would be created / updated / skipped, and flags anything that would blank out existing data. Nothing writes until the teacher confirms the preview.
- Matches students by email; never deletes rows that aren't in the file (import adds/updates only). A separate explicit "full restore" mode exists for true disaster recovery and requires typing a confirmation phrase.

---

## Build order & rough effort

| # | Phase | Size |
|---|---|---|
| 1 | Phase 0 — safety net | S |
| 2 | Phase 1 — consolidation to `asl/` | M–L |
| 3 | Phase 2 — accounts/signup/security | M |
| 4 | Phase 3 — rubric import | M |
| 5 | Phase 4 — student dashboard | L |
| 6 | Phase 5 — teacher tools | L |
| 7 | Phase 6 — settings + export/import | M |
| 8 | Verification pass (below) | S |

Phases 4 and 5 can interleave (build the grading grid as soon as rubric data exists so real scores feed the student views).

## Verification checklist (before school starts)

- Create 3 fake students (one per level, split across both teachers/periods); grade them, log 3 weeks of attendance/participation; confirm charts, dots, rubric colors, pace lines all render correctly.
- As a fake student, attempt to fetch another student's data by tampering with requests — must fail on every endpoint.
- Run export → wipe a test copy → import → confirm byte-identical data.
- Simulate the blank-save bug: submit an empty save and confirm the guard blocks it.
- Taxonomy edit test: rename a standard and confirm zero score rows are lost.
- Hard-refresh cache check per the version-system workflow in CLAUDE.md.

## Open questions (small, won't block starting)

1. Standard color from sub-targets: average-rounded-down (proposed), lowest, or highest?
2. Should Parks get the settings page too, or Harms only?
3. Signup code: keep one shared code, or one per teacher (auto-sorts, slightly less to type)?
4. Old `skills.php` / goals / bingo / scroller pages: untouched by this plan — confirm they stay as-is.

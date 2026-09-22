# ASL report and opening-block work — 1.19.144

Implementation and local verification complete. Production deployment and live calendar correction remain pending hosting access. See git history for the implementation commit.
The user approved the report layout, teacher-only Report card/Print buttons, and removal of obsolete participation settings and ten-day prose.
Participation is always three times each block's actual instructional days: two days = 6, nine days = 27, ten days = 30.

Resolved: fixed two-week periods ending on Fridays. Holidays reduce instructional days and points without shifting dates. September 8–18 is the first block (nine days); the calendar totals 175 instructional days across twenty blocks. The last is May 31–June 11 with eight school days and instruction ending June 10. Fully closed fortnights remain in the schedule with zero days/points. The correction script preserves existing block IDs, appends new blocks as needed, and refuses ambiguous saved later-block entries.

The user stated students can earn at most eight new skills per block. This was treated as report sizing context; no new grading enforcement was added. Report changes are never truncated. Matching Expression/Reception changes share a single compact row. Comments are a blank ruled area.

Attendance percentile compares all other active non-teacher students across classes. Strictly lower cumulative absence rates count; ties and self do not. Only aggregates leave the server. Existing class-average graph remains class-scoped. No peers gives an unavailable comparison.

Report completion uses the dashboard's 3N denominator. Pacing uses actual elapsed school days and existing graph thresholds (A=100, B=83, C=73, D=63; lower is projected F). A two-day week requires two-fifths of a five-day week's progress; closed weeks do not increase expected progress. Improvements compare the latest started block with the preceding block endpoint. A previously ungraded skill has a null prior score; clears do not count as improvements. Participation totals and the four-block trend weight actual points/maxima, skipping closed blocks. Explicit earned points are not rescaled. Existing blank-as-full-block-maximum behavior remains.

Entry, calendar writes and Excel import derive participation maxima from days. Old settings writes cannot restore a variable maximum. Entry saves now require calendar_revision under lock; browser drafts are keyed by revision, retaining but not automatically applying old-date drafts.

.cpanel.yml runs the backup-first correction script on the published site after copying code:
php asl/scripts/correct_opening_calendar.php --apply
Without --apply it previews. SQL and XLSX backups precede transactional writes, with a named lock and one-time marker. Do not clip or redistribute saved values if validation stops the correction.

Tests passing: disposable SQLite report/calendar tests (including a two-day, six-point block, zero-day closure, fixed Fridays and day-weighted participation), existing competency integration and pure ASL tests, nine Node chart/static tests (including short-week proficiency expectations), PHP lint, and diff checks. Node test runner needs require_escalated on this Windows host because sandbox child spawning returns EPERM.

Browser fixture: asl/tests/reports-browser-fixture.php creates a disposable SQLite copy. Current temp path is in ignored asl/tests/output/report-fixture-path.txt. Disposable PHP server used 127.0.0.1:8874; recreate the fixture/server for subsequent testing. In-app browser and Chrome were used for tests. Actual browser checks: attendance card, toolbar report link, 27/30 grid maxima, successful 29/30 save, 31/30 rejection, saved value after reload, report total 53/57 (93%), and another teacher denied access. Small report fits without scaling; a 52-row stress report is under 10.2-inch content height at about 97% scale. Chrome screenshots visually verified the ordinary and 52-row stress report, including graph and comments. The browser integration did not expose a print preview after clicking Print, so actual PDF/physical-print pagination remains unverified.

Live access: local config points to a local MySQL service that is unavailable (2002). Asked user to open/sign into cPanel Git Version Control in Codex so deployment can finish. No live credentials or student data were used.

Unrelated pre-existing untracked DND retainer/monster files must remain untouched. Working branch main. Memory preference is to commit and push completed work on main; no PR needed. README/COMPETENCIES.md and AGENTS.md reflect the approved fixed fortnight calendar. Version JSON was bumped to 1.19.144 per repository instructions, without adding ASL version UI.

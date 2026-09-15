# Competency curriculum (2026)

## Activate after deployment

Sign in as the Harms administrator and use **Import competencies** on the roster.
The fixed, nonprivate bundle includes all three ASL courses and the approved planning
calendar. No file upload, roster data, credential, or account reset is involved.
The button disappears after success; server authorization, CSRF, an import lock,
and a stored version marker prevent unauthorized or duplicate setup.

The action makes a durable SQL backup in the existing access-denied `asl/backups`
directory, then applies calendar and curriculum in one transaction. An error leaves
the previous curriculum/calendar intact. Incompatible finalized blocks or instructional
dates fail closed. Legacy targets become inactive; their scores and history remain.
No old score is reassigned to a new competency.

## Source and identity

`data/competencies-2026.json` records the exact source DOCX names and SHA-256 hashes,
competency prose, underlined text spans, element labels/examples, scale rows, and
communication-mode appendix. Original DOCXs are unchanged and are not deployed.

Rebuild using Python with python-docx:

```text
python asl/scripts/compile_competencies.py <directory containing the three proficiency DOCXs>
```

`scripts/competency-identities.json` binds titles and element labels to permanent
semantic keys. When wording changes, explicitly update the lookup label while keeping
its key. Source numbers are display order only. Unknown labels fail compilation.
Target codes derive from course + permanent competency/element/mode keys, so rewording
or renumbering cannot transfer or erase scores. `aslhub_write_competencies` can apply a
reviewed future content revision inside a backed-up transaction; there is no content
editor or automatic import on deployment. Do not clear the one-time setup marker to
publish a wording revision, since that would also attempt the bundled calendar.

Element labels keep their original text; substituted phrases use grammatical initial
case while preserving ASL/WH acronyms. Only marked underlined spans are substituted.
Elementless competencies remain one unit. Expression and Reception share source prose
and have independent score identities. Conversation Management, Deaf History, and Deaf
Culture have single scores. The source communication-mode caveats remain in the bundle:
recognizing an interaction signal does not demonstrate managing a live exchange;
competency 13's interaction-specific evidence retains that limitation.

| Course | Competencies | Explicit elements | Score targets | 100% points | Defined maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| ASL 1 | 15 | 49 | 89 | 267 | 356 |
| ASL 2 | 16 | 49 | 91 | 273 | 364 |
| ASL 3 | 16 | 49 | 91 | 273 | 352 |

ASL 3 competencies 3 and 4 have no level 4 descriptor, button, or accepted score 4.
Scores are raw: a 4 offsets a 2, and displayed progress may exceed 100%.

## Planning calendar and graph

September 14, 2026–June 10, 2027 inclusive, weekdays excluding October 12;
November 11, 26–27; December 21–January 1; January 18; February 12 and 15;
April 5–9; May 31. This yields 171 instructional days: seventeen ten-day blocks
plus a one-day final block. The user selected the endpoint; the published-break
baseline is not a confirmed final district calendar.

At instructional day `d`, paths are `p * 3 * target_count * d / 171`, for A=100%,
B=83%, C=73%, D=63%. Pale red shading is below 60% of that fixed time-adjusted
path, with no F line or label. These are visual reference paths, not gradebook rules.
No adaptive catch-up path, plus/minus grades, vacation-only blocks, or vacation dips.

The progress chart displays earned points divided by the A-path expectation at each
observation date, as a percentage. A/B/C/D therefore appear as horizontal references.
The current block uses elapsed instructional days in both date-range views; future
observations are absent, and zero-day denominators produce no point. The vertical
axis gives 10% of its height to 0–50%, 80% to 50–100%, and 10% to values above 100%.
The upper bound expands to include high observations. Axis breaks and a visible
uneven-scale label disclose the compression. Raw scores, totals, and reference
expectations are unchanged; attendance and participation keep their existing charts.

## Validation

- `php asl/tests/competencies.php` (PDO SQLite + mbstring): real import services with
  SQLite SQL-dialect adapter, rollback, duplicate setup, old-data preservation,
  stable identities, counts, absent 4, and finalized-calendar protection.
- `node --test --test-isolation=none asl/tests/dashboard-*.test.mjs`: graph math,
  holiday dates, denominators and dashboard structure.
- `php asl/tests/competency-browser-fixture.php` creates a random private temporary
  directory. Serve that directory on localhost with PHP and run
  `node asl/tests/competency-browser.test.cjs <playwright module path> <localhost URL> <screenshot directory>`.
  It exercises the real dashboard, score API, import button, SQL backup, role/CSRF
  restrictions, save/reload, course mismatch, undefined levels, mobile layout and graphs.

The browser fixture identity/reset endpoint exists only in the temporary copy.
Tests never load production config or touch the live database. SQLite validates
transactional behavior; MySQL-specific named-lock concurrency is not simulated.

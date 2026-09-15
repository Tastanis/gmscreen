# Phase 1 account deployment

Scope: account cleanup, Skyward roster import, login and password claiming. No proficiency migration. The roster files remain private and are not part of Git or a public deployment archive.

## Prepared behavior

- The two approved authentication screens use isolated `css/auth.css`.
- Login requires first name, full last name and password. A server-validated unclaimed account gets a 15-minute restricted password-creation session, not a signed-in session.
- Saving matching passwords hashes the personal password, atomically disables claiming, clears the session and returns signed out. The initial credential cannot be selected as a personal password and is never rendered.
- Student IDs remain strings. Names preserve case and compound first/surnames; the middle initial is removed. Filenames supply independent course and period values.
- The private parser verified 143 unique students. Expected real-student filter totals: ASL3 8, period5 30, both 1. The separate test account is not part of those counts.
- Brandon Harms must be uniquely identified as an active teacher before reset. His password and associated data remain. `test test` is retained or recreated as unclaimed and follows the same initial-credential, Create password and signed-out return flow as students. Its old password does not authenticate. It has no Skyward student ID and is excluded from the 143-row import comparison. Other reviewed accounts and their dependent records are removed. The old web wipe is disabled and install no longer recreates the second teacher.

## Production procedure

1. Obtain hosting/database access. The checked-out local configuration currently cannot connect (MySQL connection error 2002). No production identity has been verified and no live accounts have been changed.
2. Deploy the reviewed code and root rewrite including `create-password.php`. Keep the host in maintenance mode and drain existing requests before reset. Apply additive schema version 8 through normal app bootstrap; ensure the existing Goals schema is present. Do not run the curriculum seeder.
3. Put the seven original exports in a private directory outside the web checkout. Create a private backup directory outside the checkout. Configure the agreed initial credential privately as `claim_password` in ignored `asl/config.local.php` or the server environment `ASLHUB_CLAIM_PASSWORD`. Never commit its value or put it in a deployment archive, public document or client asset. PHP needs PDO MySQL, DOM and mbstring.
4. Run the read-only plan: `php asl/scripts/accounts.php --rosters=/private/rosters`. Review the displayed Brandon identity, retained test ID, full deletion inventory and group counts against the live database. If identity is missing/ambiguous, stop and inspect the records; never guess a keeper ID.
5. Run `php asl/scripts/accounts.php --rosters=/private/rosters --backup-dir=/private/backups --apply=REVIEW_SHA256` using the returned digest. The script refuses stale account snapshots, existing completion markers, missing backup tables and public input/output directories. It holds row locks, writes/flushed-verifies the full SQL backup, applies scoped deletion/import in a transaction, verifies every imported row and final counts, and records completion. Any failure rolls back. A local maintenance lock also blocks new app requests during the transaction.
6. Secure the SQL backup and its reported SHA-256 outside public_html. Before reopening the site, verify Brandon login, test login, roster counts, mixed-period filters, actual claiming/signed-out flow, and Apache private-path denial. Do not expose the initial credential in screenshots or public documentation. Remove host maintenance only after verification.

## Recovery

Keep the original SQL backup. It includes schema/data for every ASL table, including accounts, passwords, goals and score history. First restore it into a separate disposable MySQL database and compare table counts and retained identities. For an actual rollback, pause/drain requests, take a backup of the failed/current state, and have the hosting operator restore the reviewed SQL into the intended ASL database only. The SQL replaces the captured ASL tables; it must not be run against an unrelated database. The backup predates the completion marker. Do not rerun the reset against a populated school-year database.

## Verification and remaining limits

`tests/account-phase1.php` exercises the real auth, reset and filter functions with disposable SQLite storage, including an exact backup restore, rollback, retained records and the optional private roster import. `tests/auth-browser-fixture.php` creates temporary copies of the real auth pages using SQLite; only MySQL date expressions are adapted for the test rate limiter. `tests/auth-browser.test.cjs` runs those pages in headless Edge and captures desktop/mobile screenshots. There is no mocked authentication. Fixtures contain invented students and must never be deployed.

PHP syntax and disposable integration/browser checks passed. MySQL locking, SQL-dump restoration on MySQL, Apache rewrites and live hosting behavior still require the production procedure above. Pushing this commit does not deploy or reset the site.

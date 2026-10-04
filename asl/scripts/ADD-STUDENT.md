# Add one student

Use `add_student.php`, never the Phase 1 reset (`accounts.php`) or workbook restore, for a new student during the school year. The command creates exactly one active, unclaimed student assigned to the uniquely verified Brandon Harms teacher. It never updates or deletes existing accounts, grades, progress, attendance, notes, goals, passwords or settings. No frontend or schema changes are required.

1. Verify the intended ASL Hub deployment and database before proceeding. Code publication and adding a live student are separate operations.
2. Place one JSON object in a private file outside the web checkout and document root. Required fields: `first_name` and full `last_name` (preserve compound names), integer `class_period` (1–6), integer `level` (1–3). Email is optional; omit it or use null/blank when unavailable. A provided email must be valid. Skyward student numbers are not accepted or stored. Full name is always checked for duplicate accounts, including inactive students; provided email is an additional check. Do not commit student information. Example using invented data:

   ```json
   {"first_name":"New Compound","last_name":"Del Rio","email":"new@example.invalid","class_period":5,"level":3}
   ```

3. Run the read-only preview: `php asl/scripts/add_student.php --student=/private/student.json`. Review the exact student, teacher, database host/name/server and `creates: 1`, `updates: 0`, `deletes: 0`. Keep the output private. If an account already matches the full name or a provided email (including inactive accounts), stop and inspect it separately. This command never reactivates or merges an account.
4. After approving those details, run the same command with `--apply=REVIEW_SHA256` using the preview digest. The existing private claiming credential must already be configured. Input, teacher and destination are checked again inside the transaction. MySQL requires InnoDB and briefly locks the users range to serialize duplicate checks, including concurrent insert paths in legacy schemas without unique identity indexes. No maintenance/reset mode is enabled. Database failures roll back the insert; an uncertain response should be followed by a roster check and new preview, never a reset.
5. Confirm that the new student appears under the selected ASL level/period after reload and can follow the existing first-login password-claiming flow. A repeat command refuses the existing identity. Keep the site's normal private backups; no destructive recovery or whole-database restore is needed for enrollment.

Local verification: `php -d extension=pdo_sqlite -d extension=mbstring asl/tests/student-enrollment.php` (set PHP's extension directory if needed). Tests use a temporary, synthetic SQLite database and verify preview, validation, duplicates, transaction failure, persistence, exact preservation of existing rows and password claiming, including absent/null/blank optional identifiers. Full-name collisions still stop for review when email is unavailable. MySQL/InnoDB concurrency and live login still require verification on the intended host; SQLite tests do not establish those outcomes.

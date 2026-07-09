# ASL disposable test environment

These tools are deliberately isolated from the grading database.

- `disposable_test_db.php create` creates a database whose name ends in
  `_codex_disposable_test`, seeds three obviously fake students, a completed
  school calendar, proficiency history, attendance, and participation.
- `disposable_test_db.php drop DROP-CODEX-DISPOSABLE-TEST` removes only that
  explicitly named test database and the ignored `config.test.local.php` file.
- The script refuses any database name that does not end in the safety suffix.

The generated credentials file and anything under `tests/output/` are ignored
by Git. Never change the test configuration to point at the grading database.

The local machine must have MySQL/MariaDB running and the PHP `pdo_mysql`
extension enabled. The current workstation does not have a running database
service, so the fixture can be generated here but the disposable database
cannot be instantiated until that service is available.

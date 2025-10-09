# Combat Tracker API Test Notes

- [ ] `GET /vtt/combat-tracker/api/combat.php` returns current combat state for active scene.
- [ ] `POST /vtt/combat-tracker/api/combat.php` validates payload shape before writing to storage.
- [ ] `GET /vtt/combat-tracker/api/snapshots.php` provides read-only observers with throttled updates.
- [ ] Persistence uses temporary files and atomic renames to avoid corruption.

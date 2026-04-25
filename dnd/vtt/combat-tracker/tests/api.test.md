# Combat Tracker API Shell Checks

- [ ] `GET /vtt/combat-tracker/api/combat.php` returns HTTP 410 and names `boardState.sceneState[sceneId].combat` as canonical.
- [ ] `GET /vtt/combat-tracker/api/snapshots.php` returns HTTP 410 and names the board-state sync path as canonical.
- [ ] No code reads from or writes to `dnd/vtt/combat-tracker/storage/`.
- [ ] Live combat refresh still uses the existing VTT board-state endpoint.

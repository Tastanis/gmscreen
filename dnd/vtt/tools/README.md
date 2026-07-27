# VTT maintenance tools

## Orphaned combat-state repair

`repair-orphaned-combat-state.mjs` diagnoses legacy board-state records that
still claim to have active combat after their scene was deleted, have no
placements, or lost canonical status to another active registered encounter.

The command is dry-run by default and requires explicit input files:

```powershell
node dnd/vtt/tools/repair-orphaned-combat-state.mjs `
  --board-state path/to/board-state.json `
  --scenes path/to/scenes.json
```

The report identifies the canonical scene and each combat record that would be
deactivated. It does not remove placements, fog, drawings, templates, claims,
or other scene data.

To repair an offline/local copy after reviewing the report, add `--apply`. The
tool first creates a timestamped `board-state.json.pre-combat-repair-*.bak`,
then atomically replaces the board-state file. It changes only the listed
combat records (inactive, no active combatant/lock, idle phase, advanced combat
sequence/timestamp) and increments the board `_version` once.

Do not run `--apply` against production implicitly as part of deployment.
Take the site offline or otherwise prevent concurrent writes, review the dry
run, preserve the backup, and perform the production repair as a separate
authorized maintenance action.

# Phase 8 — Multiplayer Sync Hardening and Combat Authority

**Status:** Implemented and verified on 2026-07-26.

This phase is the completion record for `VTT_SYNC_AUDIT.md`. It keeps the
existing board-state store, file lock, delta operation transport, Pusher
broadcasts, and HTTP poller. The only authority-layer replacement is combat:
the five encounter transitions now go to the server as intents instead of
trusting a client-authored combat snapshot.

## Resulting architecture

The canonical state remains `dnd/vtt/data/board-state.json`. Every accepted
write is decided while `withVttBoardStateLock()` holds the board-state lock.

The synchronization rules are now:

1. A save response says whether anything was actually applied and returns the
   resulting canonical state.
2. Pusher broadcasts are built from the state the server stored, never from
   the submitted payload.
3. A rejected write leaves the client's dirty state intact and triggers an
   authoritative GET. A forced GET bypasses grace, hash, ETag, and authored
   snapshot suppression, but it still waits for an actual in-flight save.
4. Pusher failure switches the poller to fallback mode. Reconnect performs an
   authoritative catch-up GET.
5. Conditional GET uses a content-aware ETag:
   `W/"v<version>-<state-content-hash>"`. Same-version file restoration or
   external edits therefore cannot strand a divergent client permanently.
6. The shared Pusher channel is always a player-safe projection. A GM receiving
   that projection follows it with an authenticated private GET.
   If filtering removes every operation from a private-only write, the server
   still sends a content-free resync marker so other GM clients catch up
   immediately without exposing the hidden operation to players.

## Combat intent contract

The following operation types use the existing `POST api/state.php` operation
transport:

- `combat.start`
- `turn.start`
- `turn.complete`
- `round.advance`
- `combat.end`
- `turn.cancel` (retained to cover the existing cancel-turn UI)

Each intent carries a unique `intentId`. The server:

- validates role, scene, encounter, combatant existence, ownership/claim, team,
  active-turn state, and duplicate intent IDs;
- accepts or rejects the transition inside the board-state lock;
- stamps `sequence` and `updatedAt` from server state/time;
- stores the last 32 intent IDs for idempotency;
- returns an `operationResults` entry with `accepted`, `applied`, `reason`,
  `intentId`, and authoritative `combat`;
- broadcasts an applied transition as canonical `combat.set`.

Simultaneous turn starts are first-writer-wins. The losing client receives
`turn-already-active` plus the winning canonical combat state and visibly
recovers instead of committing an optimistic fiction.

Legacy combat snapshots remain temporarily supported for compatibility.
Players cannot use them to change encounter, round, active combatant, completed
combatants, teams, groups, malice, or lock authority. They may only publish an
auxiliary effect update when every authority field exactly matches canonical
state. The old `sequence`, `updatedAt`, and `turnLock` fields remain readable so
older behavior is not removed prematurely, but the main combat transitions no
longer depend on client sequence arithmetic or clock comparisons. Automatic
wall-clock expiration of a remote lock is disabled.

## Player-view security

Player GET, bootstrap, full Pusher update, and operation Pusher update paths use
the same server-side projection:

- hidden placements and coordinates are omitted;
- visible monster stat blocks are sanitized;
- hidden placement removals are not announced on the shared channel;
- combat identifiers, groups, completed lists, locks, and effects are filtered
  against the visible placement set;
- an active hidden combatant is represented by the fixed
  `__hidden_enemy__` sentinel, not its real placement ID;
- `playerMapDisabled` removes map routing without bypassing placement/combat
  filtering.

No role-specific Pusher channel was required for correctness. The shared
channel remains safe for players, while other GM clients recover the complete
private state through authenticated GET.

## Board, map-level, and lifecycle repairs

- Player deletion now sends a server-validated `placement.remove` only for the
  player's own visible claimed token. Removing a placement also removes its
  claims.
- Operation overflow is bounded and recoverable; a forced full snapshot clears
  the escape condition instead of permanently disabling deltas.
- Canonical grid size/origin wins incoming merges.
- Templates and drawings retain `levelId` and server timestamps.
- Placement levels are validated/normalized, and the map renderer resets on a
  scene change.
- Claimed-token routing is used for stairs; scene-global active level is no
  longer the token fallback.
- Map-level navigation operations are serialized with snapshot saves.
- Scene dirty tracking is field-specific, so a level operation cannot erase a
  pending fog, stairs, template, drawing, or combat save.
- Pusher full-state handling applies player routing and claims consistently with
  polling.
- Hydration retains `_version` and persists GM/player routing overrides.
- A hidden tab uses an ordinary acknowledged fetch. Keepalive is reserved for
  real unload, and `pageshow` resets lifecycle state and forces bfcache recovery.
- Save and refresh failures are visible in the UI and clear only after recovery.
- Asset cache keys use the stable site build number; Pusher is loaded only when
  server configuration enables it.

## Audit disposition

| Audit findings | Disposition |
|---|---|
| 1–3 | Fixed: authoritative forced recovery, content-aware ETag, Pusher fallback and reconnect catch-up. |
| 4–11 | Fixed: validated player removal, hidden-state preservation/filtering, bounded op recovery, canonical grid, server timestamp handling, concurrent drag deferral, level validation. |
| 12–18, 20 | Fixed in template/drawing normalization, full Pusher merge, field dirty tracking, serialized level ops, claimed stairs routing, and renderer reset. |
| 19 | Documented latent: no reachable in-tree producer creates an id-less map level. Existing normalization rejects/repairs invalid references; adding another generated-ID scheme would introduce nondeterminism without a caller to fix. |
| 21–27 | Fixed or superseded: only applied canonical state broadcasts; the server stamps and decides intent transitions. Legacy freshness fields remain compatibility data. |
| 28–29 | Intentional presentation behavior: viewer-specific filtering can change cosmetic tracker ordering/focus, but it no longer chooses or persists shared combat authority. |
| 30–32 | Fixed or superseded: local lock clocks no longer arbitrate transitions, server timestamps win, empty renders retain active turn, and null team-cache entries no longer defeat fallback. |
| 33 | Explicitly deferred low-impact feature limitation: the GM-only combat timing report remains local telemetry and has no renderer. It is not synchronized game authority and is outside multiplayer correctness. |
| 34–43 | Fixed: bfcache, beacon/hidden-tab behavior, routing fields, hydration version, GET authentication, failure UI, persisted level overrides, hidden dirty cleanup, stable asset build, and pre-poll version. |
| 44–51 | Superseded by validated combat intents, explicit results, active-scene combat routing, canonical GM recovery, and player-safe `combat.set` broadcasts. |

## Verification

Run all VTT and ability-automation JavaScript tests from the repository root:

```powershell
$files = @(
  Get-ChildItem dnd/vtt/assets/js -Recurse -Filter *.test.mjs |
    ForEach-Object { $_.FullName }
  Get-ChildItem dnd/character_sheet/ability-automation -Recurse -Filter *.test.mjs |
    ForEach-Object { $_.FullName }
)
foreach ($file in $files) {
  node --test $file
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

PHPUnit coverage is in:

- `tests/StatePostIntegrationTest.php`
- `tests/HiddenPlacementFilterTest.php`
- `tests/MonsterStatSanitizationTest.php`
- `tests/TimestampMergeTest.php`

If PHPUnit is unavailable, lint all touched PHP files and run the direct
state-helper checks for simultaneous starts, intent idempotency, start/round/end,
player ownership rejection, legacy authority rejection, and hidden projection.

For local browser testing, serve the **repository root** because the application
uses absolute `/dnd/...` URLs:

```powershell
php -S 127.0.0.1:8000 -t .
```

Then open `http://127.0.0.1:8000/dnd/vtt/`. Serving with `-t dnd` makes the
absolute `/dnd/vtt/api/...` requests resolve to a nonexistent `dnd/dnd/...`
path and produces misleading 404 sync failures.

## AI-reference impact

This phase does not add or change ability automation fields, effect kinds,
trigger events, hook payloads, monster imports, ability categories, malice
mechanics, or monster runtime mechanics. The Draw Steel AI reference therefore
requires no schema or hook documentation update.

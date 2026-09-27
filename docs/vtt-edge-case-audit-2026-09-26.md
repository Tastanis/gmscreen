# Recent VTT edge-case audit — September 26, 2026

Historical findings; see [the subsequent fixes and four QA passes](vtt-reliability-pass-2026-09-26.md) for current status. Several gaps below have since been repaired.

Scope: current repository and local terrain prototype, including sandbox build 463.
Read-only gameplay audit; no native maps, existing tokens, or gameplay source changed.
Re-ran the full suite: 809 tests across 107 files passed. New disposable PHP probes
reproduced the deletion and forced-creature authority gaps below. Passing existing
tests does not imply coverage of every new combination. No new live browser run
was performed during this audit; previous build-463 browser evidence remains in
`docs/dungeon-alchemist-map-import.md`.

## Working behavior and boundaries

| Scenario | Current implementation / evidence |
| --- | --- |
| GM opens/closes a door or window | Shared environment revision, event delivery, recovery snapshot; server movement reads current portal state. GM-only controls. Existing tests pass. |
| A door closes while a player drags | Accepted move uses the current server wall document. A blocked move rejects; a group rejects atomically. Existing store tests pass. |
| A drag bends through an open passage | Ordered waypoints are checked, rather than only endpoints. Existing geometry/store tests pass. |
| Large creature slides beside a wall | Swept footprint includes token dimensions; mere touching is permitted. Tests pass. |
| Shift up stairs | Retains stair traversal; suppresses built-in normal-move opportunity attacks. Tests pass. |
| Teleport up/down stairs | Direct start/end route can change floor at the linked landing. Partial progress persists. Kind remains teleport; skipped waypoints do not count. Tests pass. |
| Teleport through a wall | Permitted intentionally. No destination occupancy validation; see decision below. |
| Fly over a wall | Canonical height is checked against the wall's vertical range. Tests pass. |
| Fly over a hill, then descend over low terrain | Automatically rises to terrain, retains increased height. Fresh probe: height 1 becomes 5; teleport across the same hill retains 1. |
| Switch Fly to Ground | Clears canonical flight height and resolves floor support. Existing tests pass; polygon support remains incomplete. |
| Player selects an owned token, deselects, reloads | Selected owned token supplies vision; last valid selection is stored per user/scene/browser. Revoking ownership invalidates it. Tests pass. |
| GM selects nothing / one token | Unselected overview on current floor; single selection uses that token. Multiple selection also produces overview. |
| Ally outside sight | Ally/owned marker bypasses client sight filtering. Explicit GM-hidden tokens and server-hidden floors remain protected. Ownership does not grant a character-sheet link or exclusive movement permission. |
| Two GM tabs edit terrain/walls | Per-document expected revision rejects stale whole-document edits; edits are not merged. Doors share the walls document revision. |
| Reload / late join | Shared environment and token state come from canonical recovery; last viewpoint and explored memory remain browser-local. |
| Copy a scene | Environment copied; roof levels and mirrored stair/ramp identities remapped. Media stays referenced, not packaged as downloaded files. Existing package tests pass. |
| Restore layout checkpoint | Restores saved terrain/walls/portal states; preserves current exploration reset epoch and current token resources. Old checkpoints lacking environment preserve current environment. |
| Reset explored areas | Shared reset ID invalidates old client memories, including reconnecting clients. Actual explored masks are not shared. |
| Normal GM move through wall | Still allowed intentionally; forced moves check walls for the GM too. |

## Confirmed gaps and risks

1. **Floor deletion leaves roof/ramp references.** Fresh in-memory store test deletes
   `upper`; canonical environment still contains `roof.levelId=upper` and
   `ramp.toLevel=upper`. Floor cleanup only handles the older domains. Can leave
   stale geometry; scene-copy reference validation can subsequently reject it.
   Source: `SyncV2Store.php` levels.set/level.delete branch; `ScenePackage.php`
   environment reference remapping. Changing floor elevations also does not update
   absolute wall/roof/ramp heights; coordinated geometry editing needs definition.
2. **Forced creature collisions are not authoritative.** Fresh direct store test
   accepts a forced move from x=0 to x=5 through another creature at x=2. The UI
   clips using a snapshot, but the server validates walls rather than creatures.
   A moved/deleted obstacle between calculation and acceptance is a race.
   Source: `ui/forced-drag.js`, `ui/board-interactions.js:commitCanonicalTokenMoves`,
   `lib/WallMovement.php`. Hidden creatures absent from a player's projection also
   cannot participate in that client's collision calculation.
3. **Movement, zone effects, and collision damage are separate operations.** A move
   may save before a later damage write fails; damage to the mover may save before
   damage to the struck creature fails. Existing code warns to review, not retry.
   This is guarded incomplete automation, not an atomic collision resolution.
4. **Floor support still has two definitions.** Wall collision height includes
   imported polygon plates/ramps; server falling uses rectangular mapLevels holes.
   Curved balcony edges, overlapping floors, and landing near holes need unified
   support before broad reliability claims.
5. **Exploration changes with token/terrain/map identity.** The fog key includes
   token ID, map URL and a terrain hash. Switching tokens selects a different mask;
   changing terrain or map URL can appear to erase exploration. Original memories
   may remain stored under old keys. A new browser does not receive explored areas.
   Source: local `vision-prototype.js` exploration.select and `explored-fog.mjs`.
6. **Prototype renderer is gated by known map URLs.** Shared storage survives a
   map-image change, but height-vision activation still uses an imported/test-map
   allowlist. Replacing an image or making an unregistered map requires an import
   integration check; preserved data alone does not guarantee the renderer runs.
   Source: local `vision-prototype.js` enabled expression.
7. **Forced collision height/floor edge cases.** Creature candidates must have the
   same levelId, and vertical overlap is tested at first horizontal contact only.
   Two fliers on different nominal floors but at the same physical altitude are
   skipped; entering vertical overlap later while moving down a slope may be missed.
   Source inspection, not newly browser-reproduced.
8. **Teleport floor inference uses the whole direct chord.** A long teleport that
   crosses a complete stair route can change floors even if the endpoint is far
   beyond its landing. This matches the recent shift-style implementation, but
   arbitrary multi-floor destination selection is not implemented.
9. **Movement budgets remain advisory.** Movement position/type/path is recorded;
   this should not be described as server-enforced remaining speed. The Alt drag
   preserves the existing movement-cost handling but is not a new budget system.

## Rules questions sent to the user

- Exploration: party-wide shared memory, or individual player memory?
- Flight: automatically rise over higher ground and keep the height, or stop until
  the user raises altitude? Current code automatically rises.
- Teleport: ignore intervening obstacles but reject solid/occupied destinations,
  or allow any destination for GM adjudication? Current code skips all wall checks.

Recommended repair order: floor/environment lifecycle cleanup; canonical forced
creature collision and durable damage outcomes; unified floor support; exploration
policy and map-independent renderer activation. Preserve accepted movement and
never replay uncertain damage during these changes.

New probe: `.playwright-mcp/terrain-prototype/final-test/audit-edge-cases.php`.
Suite output: `.playwright-mcp/terrain-prototype/final-test/audit-suite.log`.

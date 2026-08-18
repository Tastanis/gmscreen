# VTT Canonical Sync and Map-Level Architecture

Last updated: 2026-08-18

This is the current handoff document for future VTT work. It replaces the
historical Levels v2 plan and its token-claim design.

## Current authority model

- Sync V2 is the canonical multiplayer path.
- Pusher transports canonical event notifications. SQLite-backed
  `SyncV2Store.php` decides and persists state under one transaction.
- Clients submit intent commands and apply only accepted canonical events.
- Focused placement events reconcile the token layer only. They do not reload
  the page, map, fog, drawings, templates, stairs, or unrelated state.
- Operation IDs and entity revisions provide idempotency and same-entity race
  detection. Combat transitions are decided atomically on the server.

## Token permissions and character sheets

- There is no token ownership or token-claim domain.
- Players may drag any visible allied token.
- Players may use ability effects against visible allied or enemy targets.
- Ordinary enemy token dragging remains blocked.
- Players may start, complete, cancel, or explicitly override allied turns.
- Only the GM may start, complete, or cancel enemy turns.
- Only the GM may delete placements.
- A token remains associated with its character sheet through explicit profile
  metadata when present, with normalized token-name aliases as the fallback.
  Removing claims must never remove or replace this profile/name association.

Obsolete state from older deployments (`claims`, `claimedTokens`, `claim.set`,
and `claim.clear`) is ignored and dropped on the next canonical write.

## Turn prompts and automation

Accepted combat transitions contain an interaction owner:

- `interactionOwnerId` identifies the user who started the selected turn.
- `turnEndInteractionOwnerId` identifies the user who completed, cancelled, or
  overrode the prior turn boundary.

Prompt-bearing turn automation is split into `turn-start` and `turn-end`
boundaries. The matching interaction owner claims that boundary through the
canonical automation-deduplication command, so multiple tabs cannot run it
twice. The boundary winner receives the appropriate prompts while rules,
resources, conditions, and saves resolve from the selected token's linked
character sheet.

Encounter-wide transitions (`combat.start`, `round.advance`, `combat.end`)
remain GM-run and globally deduplicated.

## Map levels

- Level 0 is the virtual base map; stored map levels represent Level 1+.
- `userLevelState` supports `manual`, `activate`, and token-driven sources.
- The GM's Activate action updates each known user's view level.
- Whenever a placement's `levelId` changes, the canonical placement batch
  resolves its uniquely linked PC profile and updates that player's view level
  atomically in the same transaction and event. This covers GM token controls,
  falls, stairs, and future placement-level command paths.
- Stair transitions continue to update the view level of the user who moved
  the token; a uniquely linked PC also pulls its corresponding profile.
- On player entry, the client reconciles a stale saved view to the level of the
  player's unique linked PC token. Recovery snapshots already contain the
  atomic server result for level moves missed while disconnected.
- Character-token login matching remains name/profile based and does not imply
  ownership or movement permissions.
- Unlinked tokens, explicit links to unknown profiles, and duplicate PC-token
  matches never select or pull a player arbitrarily. Hidden map levels remain
  excluded from player projections.

## Required verification

For changes to this system:

1. Run all VTT and ability-automation JavaScript tests one file at a time.
2. Run `dnd/vtt/api/v2/tests/sync-v2-store.test.php` with PDO SQLite enabled.
3. Lint every PHP file under `dnd/vtt`.
4. Run `git diff --check`.
5. Update `dnd/data/version.json`.

The browser smoke test is intentionally not part of this checklist because it
is unreliable in this workspace and the user asked that it be skipped.

# VTT Sync V2 — Canonical Implementation Plan

**Status:** Phase 2 complete; Phase 3 is the next implementation stage
**Canonical handoff:** This file is the source of truth for the synchronization
replacement. Read it before changing VTT persistence, Pusher delivery, board
state, combat turns, or rendering subscriptions.

## Decision

Keep the VTT's game features, assets, token library, automation, character
sheets, and visual design. Replace the multiplayer synchronization spine in
bounded vertical slices.

The target system uses:

- PHP for authenticated command handling and authority;
- SQLite for canonical state, monotonic revisions, idempotency, recent events,
  and recovery snapshots;
- the existing Pusher Channels app as the initial realtime transport;
- HTTP event replay and snapshot recovery when Pusher messages are missed;
- a transport adapter so Pusher can later be replaced without changing game
  commands, reducers, persistence, or rendering.

Pusher is delivery, not authority. The server decides and persists the result
before anything is broadcast.

## Authorized data boundary

The user explicitly approved discarding current runtime map and board state
during this migration:

- `dnd/vtt/storage/board-state.json`
- `dnd/vtt/storage/scenes.json`
- uploaded map files and transient map-level/fog/drawing/template/combat state

Do **not** interpret that approval as permission to delete unrelated campaign,
character-sheet, monster, automation, chat, or Strixhaven data.

Preserve when practical:

- token library metadata (`dnd/vtt/storage/tokens.json`);
- token images (`dnd/vtt/storage/tokens/`);
- other reusable uploaded token art;
- character sheets, monsters, and automation definitions.

No runtime data should be deleted merely to begin Phase 0. Resolve and verify
exact paths before any later reset.

## Non-negotiable architecture

### Confirmed state

Only accepted canonical server events modify confirmed shared state.

### Ephemeral client state

Drag previews, selection, targeting, hover, camera position, rulers, open
menus, and pending indicators remain local. A drag may visually move a token,
but it does not rewrite confirmed state on every pointer movement.

### Command envelope

Clients submit intent, not a board snapshot:

```json
{
  "operationId": "uuid",
  "type": "token.move",
  "sceneId": "scene-1",
  "baseRevision": 1842,
  "entityRevision": 36,
  "payload": {
    "placementId": "token-12",
    "column": 8,
    "row": 5
  }
}
```

### Canonical event envelope

The server validates, persists, assigns revisions, and emits the actual result:

```json
{
  "revision": 1843,
  "operationId": "uuid",
  "type": "token.moved",
  "actorId": "player-2",
  "sceneId": "scene-1",
  "entityId": "token-12",
  "entityRevision": 37,
  "payload": {
    "column": 8,
    "row": 5
  },
  "serverTime": 1785350000000
}
```

Never broadcast a submitted command as though it were accepted state.

### Single event reducer

HTTP acknowledgement, Pusher delivery, event replay, and tests must all feed
the same client event reducer. Transport handlers do not mutate DOM directly.

### Snapshot policy

Full snapshots are allowed only for:

- initial bootstrap;
- scene activation when a whole scene must be mounted;
- unrecoverable revision gaps;
- explicit recovery or migration;
- backups/checkpoints.

Routine token, combat, template, drawing, fog, level, or condition changes must
not save, fetch, merge, or render the complete board.

## Incremental rendering contract

Applying an event produces a change set, for example:

```js
{
  revision: 1843,
  placements: {
    added: [],
    updated: ["token-12"],
    removed: []
  },
  combat: false,
  fog: false,
  templates: false,
  drawings: false,
  sceneRouting: false
}
```

The render coordinator routes only those changes:

| Event | Permitted rendering |
|---|---|
| `token.moved` | That token transform and directly dependent movement UI |
| `token.staminaChanged` | That token display, open summary, relevant tracker row |
| `token.conditionsChanged` | That token badges, open summary, tracker row |
| `token.added` | One new token node |
| `token.removed` | One token node plus its selection/summary/tracker entry |
| `turn.started` | Combat tracker, turn borders, movement permissions |
| `turn.completed` | Combat tracker and affected condition displays |
| `template.updated` | One template node |
| `drawing.added` | Drawing layer only |
| `fog.patched` | Affected fog cells/layer only |
| `level.changed` | Affected visibility and level controls |
| `scene.activated` | Full scene/map mount is intentionally allowed |
| Recovery snapshot | Full board reconciliation is intentionally allowed |

For one ordinary token move the diagnostic budget is:

```text
page reloads       = 0
map loads          = 0
full board applies = 0
fog renders        = 0
stairs renders     = 0
template renders   = 0
drawing renders    = 0
token patches      = 1
```

## Persistence target

The initial SQLite design may keep canonical state as JSON while still making
the state change and event append atomic:

```text
vtt_world_state
  world_id
  revision
  state_json
  updated_at

vtt_events
  revision PRIMARY KEY
  operation_id UNIQUE
  actor_id
  scene_id
  entity_type
  entity_id
  event_type
  payload_json
  created_at

vtt_operations
  world_id
  operation_id
  event_json
  created_at

vtt_snapshots
  revision
  state_json
  created_at
```

Normalized entity tables may be introduced later if actual query or write
patterns justify them. Do not normalize the schema speculatively.

## Recovery contract

A reconnecting client requests:

```text
GET /dnd/vtt/api/v2/sync.php?after=<last-confirmed-revision>
```

The server returns ordered canonical events or a snapshot when the event gap
predates retention. A client that has revision 100 and receives revision 102
must buffer 102 and recover 101; it must not silently advance to 102.

## Audience security

Hidden state must be filtered on the server before delivery. Sync V2 should use
authenticated private/audience-specific Pusher channels or equivalent
per-user delivery. Rendering hidden data conditionally is not access control.

Before production Sync V2 traffic, rotate the Pusher secret currently exposed
in Git history and load the replacement from an untracked server-only file or
environment variable.

## Migration rule

A shared domain is owned exclusively by V1 or V2. Never dual-write the same
entity. Shadow reads and comparison logging are allowed; parallel writers are
not.

Feature flags are domain-specific:

```text
sync_v2.token_movement
sync_v2.placements
sync_v2.combat
sync_v2.templates
sync_v2.drawings
sync_v2.fog
sync_v2.levels
sync_v2.scenes
```

## Phases and deletion gates

There are nine phases total, numbered 0 through 8.

### Phase 0 — Baseline, diagnostics, and fault harness

- [x] Record the canonical implementation plan.
- [x] Record the authorized runtime-data boundary.
- [x] Add counters for legacy saves, Pusher deliveries, revision gaps,
      recovery, full-board applies, token reconciliations, map loads, and page
      reload navigation.
- [x] Add a deterministic multi-client network harness with latency, duplicate,
      reorder, drop, disconnect, and reconnect controls.
- [x] Keep the existing suite green.

**Gate:** The harness and diagnostics work without changing production sync
semantics.

### Phase 1 — V2 foundation in shadow mode

Create:

```text
dnd/vtt/api/v2/commands.php
dnd/vtt/api/v2/sync.php
dnd/vtt/api/v2/snapshot.php
dnd/vtt/assets/js/sync-v2/command-client.js
dnd/vtt/assets/js/sync-v2/event-stream.js
dnd/vtt/assets/js/sync-v2/event-reducer.js
dnd/vtt/assets/js/sync-v2/recovery-client.js
dnd/vtt/assets/js/sync-v2/pending-commands.js
dnd/vtt/assets/js/sync-v2/entity-store.js
dnd/vtt/assets/js/sync-v2/change-router.js
```

Add SQLite schema/bootstrap, operation idempotency, monotonic revisions, event
replay, recovery snapshots, and Pusher transport adapter. Keep V2 read-only or
shadowed at this gate.

- [x] Add a separate SQLite authority that never reads or writes V1 board JSON.
- [x] Add an unpruned operation ledger so idempotency outlives event retention.
- [x] Add GM-only `shadow.observe` command handling with atomic state/event
      persistence and strict base-revision conflicts.
- [x] Add ordered HTTP replay and current-snapshot recovery fallback.
- [x] Add a disabled-by-default Pusher delivery adapter.
- [x] Add the entity store, single event reducer, command client, pending
      commands, recovery client, event stream, and change router.
- [x] Keep every live-domain ownership flag disabled.
- [x] Verify acknowledgement/broadcast deduplication, revision monotonicity,
      gap recovery, retention fallback, and three-client convergence under
      reorder, duplicate, loss, and disconnect.

**Gate:** Duplicate acknowledgements/broadcasts apply once; revisions never
decrease; missing revisions recover deterministically.

#### Phase 1 operating boundary

- The browser receives `syncV2.mode = "shadow"` and eight domain flags set to
  `false` from `dnd/vtt/config/sync-v2.php`.
- The new client modules are intentionally not imported by the production VTT
  bootstrap yet.
- The only accepted command type is `shadow.observe`; live types such as
  `token.move` are rejected.
- Phase 1 endpoints are GM-only because audience-specific private-channel
  authentication is not implemented yet.
- Sync V2 Pusher publishing requires the explicit server environment flag
  `VTT_SYNC_V2_PUSHER_ENABLED=1`; do not set it before credential rotation and
  private-channel authentication are complete.
- The server must have PHP's `pdo_sqlite` extension enabled. The local Windows
  PHP install includes the extension DLL but test commands load it explicitly
  because the CLI has no default `php.ini`.
- The ignored runtime database is `dnd/vtt/storage/sync-v2.sqlite`.

### Phase 2 — Incremental store and render coordinator

Introduce focused token, combat, fog, template, drawing, and scene renderers.
Canonical reducer output becomes a change set.

- [x] Replace routine full-state reducer cloning with structural domain updates.
- [x] Add a render coordinator that consumes only canonical change sets.
- [x] Add focused token, combat, fog, template, drawing, level, and scene
      renderer adapters.
- [x] Add render metrics that distinguish one-token patches, domain patches,
      scene/map mounts, and explicit full-board recovery reconciliation.
- [x] Expand the shadow reducer event catalog without enabling live-domain
      commands or production imports.
- [x] Prove with a deterministic DOM fixture that `token.moved` changes one
      token node, preserves every unrelated node/map surface, performs zero map
      loads, and invokes no unrelated renderer.
- [x] Prove unaffected state branches retain reference identity after a token
      move.

**Gate:** A synthetic `token.moved` event touches only one token and its direct
dependencies.

#### Phase 2 operating boundary

- The render coordinator lives at
  `dnd/vtt/assets/js/sync-v2/render-coordinator.js`.
- Focused adapters live under `dnd/vtt/assets/js/sync-v2/renderers/`.
- `entity-store.js` exposes an internal confirmed snapshot for reducer/render
  coordination and retains cloned public snapshots for mutation safety.
- Full-board reconciliation is reachable only through an explicit snapshot
  change set.
- Scene activation is the only Phase 2 route that may report a map load.
- The production VTT bootstrap still does not import Sync V2, and all eight
  ownership flags remain `false`. Phase 3 is the first live vertical slice.

### Phase 3 — Token movement vertical slice

Move drag/drop and keyboard movement to `token.move`. Use ephemeral visual
preview, server validation, entity revision conflict handling, and canonical
commit.

**Gate:** Three clients converge under latency, reorder, duplicate, loss,
disconnect, and simultaneous same-token moves without reload or map reload.

### Phase 4 — Remaining placement mutations

Migrate add, remove, stamina, conditions, visibility, levels, size, ownership,
stack order, monster references, and automation-driven placement changes.
Support atomic batch commands for legitimate multi-token effects.

**Deletion gate:** Remove legacy placement dirty tracking, snapshot saves,
timestamp arbitration, and placement full-broadcast merges only after every
placement writer uses V2.

### Phase 5 — Server-authoritative combat

The server exclusively decides combat start/end, encounter, round, phase,
active combatant, completed combatants, permissions, and conflicting turns.
Automation runs from accepted canonical transitions.

**Deletion gate:** Remove client combat sequences, timestamp comparisons,
synced advisory locks, local intent reassertion, legacy combat snapshots, and
remote/local winner logic only after all combat transitions use V2.

### Phase 6 — Remaining board domains

Migrate templates, drawings, pings, fog, levels/stairs, scenes, grid, and
viewer-specific routing independently. Do not introduce a generic
`board.updateAnything` command.

### Phase 7 — Recovery and reconnect hardening

Complete event replay, snapshot fallback, gap buffering, private audience
recovery, retention, and operational visibility.

### Phase 8 — Remove V1 synchronization

Remove routine snapshots, legacy Pusher full merges, grace-period guards,
authored-snapshot suppression, obsolete op buffers, and the broad store
subscriber only after every domain passes its deletion gate and real-session
soak testing.

## Required verification

Use at least GM, Player A, and Player B clients. Inject latency, jitter,
duplication, reordering, dropped broadcasts, disconnects, reconnects, and
duplicate operation IDs.

Invariants:

- clients at the same revision have identical permitted projections;
- revisions never decrease;
- an operation ID applies at most once;
- rejected commands never alter confirmed state;
- accepted combat transitions trigger automation once;
- hidden information never reaches player payloads;
- ordinary changes never request or render a full board;
- disconnects heal without user reload.

## Stop conditions

Stop and investigate instead of layering on another guard when:

- a V1 and V2 path both write the same domain;
- a transport callback contains game rules or DOM mutations;
- a normal command needs a full snapshot to succeed;
- browser timestamps are proposed as shared authority;
- a revision advances without applying the corresponding canonical event;
- a test passes only by disabling reorder, duplicate, or reconnect behavior.

## Current-code orientation

The legacy paths being replaced are primarily:

- `dnd/vtt/assets/js/ui/board-interactions.js`
- `dnd/vtt/assets/js/state/store.js`
- `dnd/vtt/assets/js/state/persistence.js`
- `dnd/vtt/assets/js/services/board-state-service.js`
- `dnd/vtt/assets/js/services/board-state-poller.js`
- `dnd/vtt/assets/js/services/pusher-service.js`
- `dnd/vtt/assets/js/services/board-state-op-applier.js`
- `dnd/vtt/api/state.php`

Do not delete them wholesale. Route one domain to V2, verify its gate, then
remove only that domain's obsolete V1 branches.

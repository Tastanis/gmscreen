# VTT Sync V2 — Canonical Implementation Plan

**Status:** Phase 8 complete; Sync V2 is the only shared-board synchronization system
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

- [x] Make Sync V2 the exclusive owner of existing-token coordinates.
- [x] Route drag release and keyboard movement through `token.move`.
- [x] Preserve local GPU-composited previews without writing shared state.
- [x] Validate authenticated movement permissions on the server.
- [x] Use per-token entity revisions for simultaneous same-token conflicts.
- [x] Allow unrelated tokens to move without a whole-world revision lock.
- [x] Apply acknowledgement and HTTP replay through the same event reducer.
- [x] Patch one token transform after a canonical event without a board/map
      reload.
- [x] Overlay V2 coordinates after legacy non-movement snapshot merges.
- [x] Reject or strip legacy V1 coordinate writes while the domain flag is on.
- [x] Preserve private information by redacting hidden-token replay events
      without creating revision gaps.
- [x] Verify three-client convergence, missed-event recovery, duplicate
      handling, and simultaneous same-token retry.

**Gate:** Three clients converge under latency, reorder, duplicate, loss,
disconnect, and simultaneous same-token moves without reload or map reload.

#### Phase 3 operating boundary

- `sync_v2.token_movement` is live and is the only owner of `column`/`row` for
  existing placements.
- Drag previews and pending keyboard positions are ephemeral. Confirmed
  compatibility-store coordinates change only after a canonical event.
- Player-visible movement uses the existing Pusher board channel for fast
  delivery, with authenticated HTTP acknowledgement and ordered replay as the
  authority and recovery path. Hidden movement never enters that shared
  channel; private audience channels remain a Phase 7 hardening item.
- V1 still owns placement creation/removal and every non-coordinate placement
  field until Phase 4. V1 snapshot and op handling preserves existing legacy
  coordinates so old or cached clients cannot become a second movement owner.
- Recovery/conflict snapshots are projected per authenticated viewer. Hidden
  token events become revision-preserving `sync.redacted` no-ops for players.
- A normal accepted move performs one focused token transform patch. It does
  not call the legacy board persistence path, reload the page/map, or apply the
  full board.

### Phase 4 — Remaining placement mutations

Migrate add, remove, stamina, conditions, visibility, levels, size, ownership,
stack order, monster references, and automation-driven placement changes.
Support atomic batch commands for legitimate multi-token effects.

- [x] Import full legacy placement data and claims once without overwriting
      Phase 3 canonical coordinates or entity revisions.
- [x] Make `placement.batch` the exclusive authority for add, remove, patch,
      ownership, and legitimate multi-token mutations.
- [x] Validate the complete batch against one SQLite write-locked working copy
      and commit one state revision/event or roll back every action.
- [x] Move claim permission checks inside the same canonical transaction as
      ownership changes and placement mutations.
- [x] Route the existing placement writer choke point through V2, including
      stamina, conditions, visibility, level, size, stack order, monster data,
      automation markers, and direct token settings.
- [x] Make multi-token drag and keyboard movement atomic rather than a
      sequential series of single-token commits.
- [x] Overlay canonical placements and claims during PHP bootstrap so stale
      compatibility JSON cannot flash old placement state on reload.
- [x] Reject cached V1 placement/claim ops and strip placement collections
      from legacy full-snapshot writes while the V2 domain flag is enabled.
- [x] Disable live legacy placement dirty tracking and omit placements from
      non-placement full-snapshot payloads.
- [x] Apply frequent overlay-only updates (stamina, conditions, action usage)
      to affected token nodes and tracker/summary dependencies without a page,
      map, or full-board render.
- [x] Verify atomic multi-token success, whole-batch rollback, idempotency,
      ownership permissions, reducer change sets, and the full JS suite.

**Deletion gate:** Remove legacy placement dirty tracking, snapshot saves,
timestamp arbitration, and placement full-broadcast merges only after every
placement writer uses V2.

#### Phase 4 operating boundary

- `sync_v2.placements` is live. SQLite is the authority for the complete
  placement objects and `claimedTokens`; `board-state.json` is only an
  in-memory compatibility projection for domains that still use V1.
- Existing feature code may still construct legacy-shaped placement ops, but
  the persistence choke point translates them into one canonical
  `placement.batch` command. They never reach `state.php`.
- Entity revisions are the conflict boundary. A behind world revision may
  mutate unrelated tokens, while a stale revision for any token rejects the
  entire batch without partial state changes.
- Single-token movement retains the Phase 3 transform-only path. Multi-token
  movement uses one atomic placement batch. Frequent overlay-only placement
  fields patch affected token nodes; structural changes reconcile the token
  layer only. Neither path reloads the page or map or applies the full board.
- The shared Pusher channel is used only when a placement event is
  byte-for-byte safe for all viewers. Events containing hidden or GM-only
  placement data use authenticated HTTP replay (normally within 500 ms) until
  Phase 7 supplies private audience channels.
- V1 continues to own templates, drawings, pings, fog, map-level definitions,
  scenes, grid, and viewer routing. Placement `levelId` itself is V2-owned;
  the wider map-level domain migrates in Phase 6.

### Phase 5 — Server-authoritative combat

The server exclusively decides combat start/end, encounter, round, phase,
active combatant, completed combatants, permissions, and conflicting turns.
Automation runs from accepted canonical transitions.

- [x] Import each legacy scene combat record once without granting it ongoing
      write authority.
- [x] Add explicit `combat.start`, `turn.start`, `turn.complete`,
      `turn.cancel`, `combat.uncomplete`, `round.advance`, `combat.end`, and
      restricted `combat.patch` commands.
- [x] Decide every transition under SQLite `BEGIN IMMEDIATE`, then persist
      canonical combat and append one `combat.transitioned` event atomically.
- [x] Resolve simultaneous turn starts against current canonical state so one
      wins and later contenders receive a conflict snapshot.
- [x] Enforce GM-only encounter/round control and canonical player ownership
      checks for ally turns.
- [x] Route acknowledgement, Pusher delivery, replay, and conflict recovery
      through the same exact-replacement combat reducer.
- [x] Strip combat from ordinary board snapshots and reject cached V1 combat,
      turn, and round writes at `state.php`.
- [x] Remove the live client sequence/timestamp winner, GM intent reassertion,
      and legacy `combat.set` writer path.
- [x] Trigger combat automation only after an accepted canonical transition;
      one idempotent server-side automation claim elects exactly one GM client
      across tabs and devices.
- [x] Project hidden combat identities out of player snapshots, recovery,
      acknowledgements, and shared-channel events.
- [x] Verify atomic races, permission rejection, idempotency, focused reducer
      changes, no snapshot reconciliation for normal combat, and the full JS
      suite.

**Deletion gate:** Remove client combat sequences, timestamp comparisons,
synced advisory locks, local intent reassertion, legacy combat snapshots, and
remote/local winner logic only after all combat transitions use V2.

#### Phase 5 operating boundary

- `sync_v2.combat` is live. SQLite is the sole shared authority for encounter,
  round, pick side, active/completed combatants, and the canonical turn lock.
- Browser turn locks and optimistic tracker changes are advisory/ephemeral.
  They cannot win a race or overwrite the accepted server result.
- Authenticated players may submit an explicitly confirmed `turn.start`
  override for any allied combatant, including replacing the active turn or
  restarting a combatant in `completedCombatants`. The canonical transition
  removes a restarted combatant from that list. Enemy turn starts remain
  GM-only, and the server enforces both boundaries.
- Ordinary board, movement, visibility-change, and unload saves contain no
  combat record. Cached V1 combat operations are stripped server-side.
- `combat.patch` is deliberately narrow: auxiliary malice, groups, effect
  display history, and intent history may change without replacing turn
  authority. Player patches are limited to effect-display fields.
- Internal GM-only `combat.automation.claim` operations elect one automation
  executor by deriving an idempotency key from the accepted transition.
- A normal combat transition patches only the scene combat compatibility
  record and its directly dependent combat UI. It does not reload the page,
  map, fog, drawings, templates, stairs, or full board.
- Player-visible combat events may use the existing shared Pusher channel.
  Events whose combat or transition payload would reveal a hidden placement
  use authenticated HTTP replay until Phase 7 adds private audience channels.
- Token stamina floats display immediately on the initiating client and retain
  one stable effect ID through the combat patch and replay paths. The final
  renderer keeps a bounded tab-local ID history, so an HTTP/Pusher/snapshot
  echo of that same effect cannot display twice; distinct IDs still allow
  legitimate repeated equal-damage hits.

### Phase 6 — Remaining board domains

Migrate templates, drawings, pings, fog, levels/stairs, scenes, grid, and
viewer-specific routing independently. Do not introduce a generic
`board.updateAnything` command.

- [x] Import templates, drawings, pings, scene configuration, and viewer
      routing once into the canonical SQLite world.
- [x] Add explicit commands for template upsert/remove, drawing upsert/remove,
      ping add, fog replace, map-level replace, per-user level routing,
      activate-level, grid replace, scene activation, and viewer routing.
- [x] Use entity revisions for templates/drawings and scene/routing revisions
      for configuration races; reject stale same-entity writes.
- [x] Preserve player permissions for template/drawing/ping creation and
      player-owned viewer levels while keeping destructive/configuration
      commands GM-only.
- [x] Route acknowledgement, Pusher delivery, replay, and conflict recovery
      through the single canonical reducer.
- [x] Overlay canonical Phase 6 state into bootstrap and compatibility state
      so stale V1 JSON cannot flash or restore old board domains.
- [x] Strip migrated collections, scene fields, routing fields, and cached V1
      ops from `state.php` and ordinary snapshot saves.
- [x] Render templates, drawings, pings, fog, grid, and level/stair changes
      through focused callbacks; reserve a full scene/map mount for an actual
      scene or viewer-route change.
- [x] Correct the placement V2 interception block so placement commands execute
      at the persistence choke point instead of falling through the heartbeat
      helper.
- [x] Verify idempotency, permissions, entity conflicts, focused reducer
      change sets, PHP syntax, and the complete JavaScript suite.

**Deletion gate:** Phase 6 domains no longer have a live V1 writer. Keep the
remaining V1 transport/recovery shell until Phase 7 reconnect hardening and
Phase 8 removal are complete.

#### Phase 6 operating boundary

- SQLite now owns templates, drawings, pings, fog, map levels/stairs, runtime
  grid state, active-scene routing, and GM-configured player map routing.
- Scene catalog CRUD and uploaded map asset management remain in the existing
  `scenes.php`/upload APIs; Sync V2 owns the shared runtime state that selects
  and renders those assets.
- There is deliberately no whole-board mutation command. Shared configuration
  commands patch only their named field under one SQLite write lock.
- Same-template and same-drawing stale revisions are rejected rather than
  silently replayed over the winner. Shared scene configuration retries only
  after replacing its revision cursor from the authoritative conflict
  snapshot, and each command changes only its named field.
- Pings are append-only canonical events with bounded retention. They do not
  rewrite placements, the map, or the full board.
- Normal template, drawing, ping, fog, grid, and level events invoke only their
  matching compatibility update and renderer. `scene.activated` and a viewer
  route that changes the displayed map are the intentional full-scene mount
  exceptions.
- Sync V2 no longer publishes live canonical events on the shared public board
  channel. Authenticated role-specific channels now carry projected
  low-latency delivery; HTTP replay remains authoritative.

### Phase 7 — Recovery and reconnect hardening

Complete event replay, snapshot fallback, gap buffering, private audience
recovery, retention, and operational visibility.

- [x] Authenticate Pusher subscriptions and split canonical delivery into
      private GM and player audience channels.
- [x] Project every acknowledgement, live event, replay event, and recovery
      snapshot through the same server audience filter.
- [x] Remove hidden placements and hidden-level maps, fog, stairs, viewer
      state, and placements from player payloads while preserving revision
      continuity with redacted no-op events.
- [x] Recover immediately after first Pusher connection and every reconnect
      instead of waiting for the next periodic poll.
- [x] Require replay cursor metadata and a strictly contiguous event sequence;
      reject truncated replay responses without advancing confirmed state.
- [x] Bound the out-of-order buffer, detect conflicting events claiming one
      revision, and fall back to authoritative recovery on invalid input.
- [x] Retry ambiguous network, timeout, rate-limit, server, and malformed
      success responses with the exact same operation ID and command body.
- [x] Add recovery request timeouts and preserve caller cancellation.
- [x] Bound retained recovery snapshots independently from retained events
      while keeping the operation ledger long-lived for idempotency.
- [x] Add GM-only operational status for current/minimum revisions, retained
      events, snapshots, operation-ledger size, and configured retention.
- [x] Add recovery, reconnect, retry, overflow, and revision-conflict
      diagnostics and deterministic regression coverage.

**Gate:** Reconnect starts ordered HTTP healing immediately; gaps cannot advance
past missing revisions; duplicate or ambiguous submissions preserve one
operation identity; player transports never receive the GM projection; ordinary
recovery does not reload the page or map.

#### Phase 7 operating boundary

- Pusher remains transport only. Live commands commit to SQLite before
  `SyncV2PusherTransport::publishAudiences()` sends the accepted event.
- GM clients subscribe to `private-vtt-sync-v2-gm`; players subscribe to
  `private-vtt-sync-v2-players`. `/dnd/vtt/api/v2/pusher-auth.php` authorizes
  only the channel matching the authenticated role.
- HTTP acknowledgement, private Pusher delivery, ordered replay, and snapshot
  recovery use the same reducer. Pusher loss cannot lose canonical state.
- The 500 ms recovery poll remains a fallback, but a Pusher connection or
  reconnection also requests replay immediately from the last confirmed
  revision.
- Event retention defaults to 1,000, snapshots are created every 100 revisions,
  and only the newest 20 snapshots are retained. The operation ledger is not
  pruned with either recovery store.
- `/dnd/vtt/api/v2/status.php` is a read-only GM endpoint for operational
  revision and retention visibility.
- `VTT_PUSHER_SECRET` now overrides the legacy checked-in credential. The
  Pusher dashboard credential still must be rotated and the new secret placed
  in that server environment variable before treating the private channels as
  production-secure; code cannot perform that external dashboard rotation.
- Phase 8 removal must wait for a real three-client soak session exercising
  disconnect/reconnect and every deletion gate. Phase 7's automated fault
  harness is necessary but is not a substitute for that live soak.

### Phase 8 — Remove V1 synchronization

Remove routine snapshots, legacy Pusher full merges, grace-period guards,
authored-snapshot suppression, obsolete op buffers, and the broad store
subscriber only after every domain passes its deletion gate and real-session
soak testing.

- [x] Remove the V1 board-state route from browser configuration and stop
      bootstrap hydration from fetching or merging board snapshots.
- [x] Retire `api/state.php` with HTTP 410 so cached clients cannot perform
      whole-board reads, writes, version bumps, or public broadcasts.
- [x] Remove the V1 board-state service, op buffer, HTTP poller, public Pusher
      subscriber, local op applier, timestamp/version guard, and authoritative
      V1 snapshot merger from the production module graph.
- [x] Remove the public board Pusher channel from server and browser
      configuration; only authenticated Sync V2 audience channels remain.
- [x] Stop live bootstrap and API requests from re-running legacy JSON-to-V2
      migration or reading `board-state.json` as shared authority.
- [x] Keep the historical `_persistBoardState` feature-module interface only as
      a thin V2 command adapter; unsupported legacy operations fail closed
      instead of falling back to a snapshot.
- [x] Remove the broad `boardApi.subscribe(applyStateToBoard)` renderer.
      Canonical events now use focused V2 render callbacks, with full board
      reconciliation reserved for initial bootstrap, recovery snapshots, and
      actual scene-routing changes.
- [x] Remove obsolete V1 tests and add a source-boundary regression test that
      prevents retired modules, routes, broad subscriptions, and startup calls
      from returning.
- [x] Verify the remaining VTT and ability-automation suite, Sync V2
      replay/reconnect/race tests, PHP syntax, and SQLite authority tests.

**Gate:** The running browser has one shared-state writer and one recovery
protocol. Ordinary mutations cannot reach a board snapshot endpoint, public
board broadcast, V1 poller, version/grace winner, or broad render subscriber.

#### Final operating boundary

- SQLite, authenticated V2 commands, monotonically revised canonical events,
  private Pusher delivery, and ordered HTTP recovery are the complete
  multiplayer synchronization spine.
- Feature modules may still call `_persistBoardState` by its historical name,
  but it accepts only recognized placement or board-domain operations and
  derives explicit V2 commands from dirty domain markers. It never serializes
  or transmits the board.
- `api/state.php` intentionally returns 410 for every request. Do not restore
  it as a compatibility fallback; cached clients must refresh.
- Initial load and an authoritative recovery snapshot may reconcile the full
  board. An actual scene-routing change may mount a full scene. Token,
  placement, combat, fog, grid, level, template, drawing, and ping events use
  their focused render paths.
- Scene catalog and uploaded asset CRUD remain in their dedicated APIs.
  Runtime scene selection and every shared board domain remain V2-owned.
- Before production sign-off, rotate the external Pusher credential into
  `VTT_PUSHER_SECRET` and run the documented GM plus two-player soak session.
  These are deployment validation tasks, not reasons to restore V1 code.

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

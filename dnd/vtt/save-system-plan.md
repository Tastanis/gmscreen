# Virtual Tabletop Save System Plan

This document outlines a scalable persistence and synchronization strategy for the virtual tabletop (VTT). The goals are:

* Retain all scenes, tokens, and layout data across refreshes or reconnects.
* Allow the GM to author content offline and push updates when ready.
* Propagate GM changes to connected players quickly without overloading the server or network.
* Support future modules (initiative trackers, effects, fog of war, etc.) without rewriting the save system.

## Core Concepts

### Canonical Data Store

* Store authoritative VTT data in a database (e.g., MySQL or PostgreSQL). Start with these tables:
  * `scenes`: id, name, description, map image path, grid scale, accent color, folder relationships, ordering, metadata JSON.
  * `scene_layers`: id, scene_id, layer_type (map, drawings, notes, fog), payload JSON/BLOB, z-index.
  * `tokens`: id, scene_id (nullable for library tokens), name, folder/category, stats JSON, size (width/height), stamina, school, created_by, created_at.
  * `token_art`: id, token_id, image_path, crop metadata (scale, translateX, translateY, stageSize, baseScale).
  * `session_state`: id, scene_id, gm_user, active_flags JSON (lighting on/off, grid opacity, initiative order, etc.).
* Use JSON columns for extensible attributes so new modules can add data without schema changes.
* Store uploaded images on disk or object storage with hashed filenames; reference via paths in the DB.

### Versioning & Change Tracking

* Add `updated_at` timestamps and `version` integers to scenes and tokens. Increment versions on each update.
* Maintain a `change_log` table (id, entity_type, entity_id, version, payload diff, created_at) for auditing and replay.
* For client caching, expose entity versions via the API. Clients can skip updates if their version matches the server.

### API Design

* Build RESTful endpoints under `/api/vtt/` for CRUD operations on scenes, tokens, and folders. Require GM authentication for mutations.
* Use `GET /api/vtt/state` to deliver the full dataset needed on initial load (scenes, tokens, settings, active scene id).
* Provide delta endpoints (e.g., `GET /api/vtt/changes?since=<timestamp or version>`) that return only modified entities. This keeps polling lightweight.
* Accept batched updates via `POST /api/vtt/batch` with an array of operations to minimize round trips.
* Validate payloads server-side and sanitize filenames to avoid security issues.

### Synchronization Strategy

* Short-term: keep the existing polling loop but make it version-aware. Poll every 3–5 seconds with `If-None-Match`-style headers (e.g., latest change version). If nothing changed, return `304` or an empty payload.
* Medium-term: introduce WebSocket or Server-Sent Events (SSE) channel:
  * GM client pushes changes after successful API save.
  * Server broadcasts change summaries (entity type, id, version) to subscribed players.
  * Players fetch missing data via REST endpoints using the provided ids/versions.
* Implement exponential backoff and reconnection logic for real-time channels.

### Local Caching & Offline Support

* Keep lightweight copies of tokens and scenes in `localStorage` for quick reloads. Store `{version, payload}` entries keyed by entity id.
* On load, hydrate UI from cache, then reconcile with server using versions.
* If the GM is offline when editing, queue unsynced operations (with UUIDs) and replay them when the connection returns.

### Scene & Token Lifecycle

1. **Creation**
   * GM creates or imports token/scene locally.
   * Client posts to `/api/vtt/tokens` or `/api/vtt/scenes` with metadata and base64 image/crop params.
   * Server stores image, persists record, returns entity with id + version.
   * Client updates UI cache and notifies players via channel.

2. **Update**
   * GM edits metadata or positioning.
   * Client sends minimal patch (e.g., JSON Merge Patch) referencing current version to prevent conflicts.
   * Server applies, increments version, emits change event.

3. **Deletion/Archival**
   * Support soft deletes via `archived_at` fields so content can be restored.
   * Provide cleanup jobs to remove unused art assets after retention period.

### Concurrency & Conflict Handling

* Use optimistic locking with the `version` column. If a client updates an entity using a stale version, return `409 Conflict` so the UI can prompt the GM to refresh.
* For collaborative GMing, allow `last_modified_by` tracking and highlight conflicting edits.

### Performance Considerations

* Compress and resize token art server-side to standard sizes (e.g., 512px square) before storing.
* Lazy-load heavy scene assets (maps, fog layers) only when the scene becomes active.
* Cache active scene data in memory or Redis to speed up repeated reads.
* Rate-limit mutation endpoints to protect from runaway scripts.

### Security & Permissions

* Enforce role-based access (GM vs. player) through session middleware.
* Validate uploaded files (MIME sniffing + extension) and store outside web root if possible.
* Sign asset URLs or use tokenized paths if you need to prevent direct hotlinking.

### Data Integrity, Backups & Disaster Recovery

* Store every image upload with a generated checksum and persist the hash alongside the record. Validate the checksum after disk writes to ensure file integrity.
* Run nightly database backups and retain at least 7 days of full snapshots plus hourly binlog/incremental backups for point-in-time recovery.
* Mirror uploaded art assets to redundant storage (local RAID + cloud bucket). Maintain a manifest so orphaned files can be pruned safely.
* Add background jobs that verify foreign keys (e.g., tokens still point to existing scenes) and flag inconsistencies for admin review.
* Provide an export utility (`php artisan vtt:export --scene=<id>`) that bundles scene JSON, assets, and metadata so tables can be migrated between servers or shared with another GM.

### Multi-Device & Session Workflow

* Persist connected clients in a `session_clients` table (id, user_id, session_id, last_seen, capabilities JSON). Use this list to target change broadcasts.
* Introduce a `session_locks` table where the GM can reserve a scene for editing. Locks expire automatically after inactivity to prevent stale lockouts.
* When the GM makes a change, enqueue a `change_event` row with `{session_id, entity_type, entity_id, version, payload_hash}`. WebSocket workers read from this table (or Redis stream) and publish to clients.
* Players acknowledge receipt by POSTing `/api/vtt/ack` with the event ids they applied. Store acknowledgements to debug sync issues and to replay missed events for reconnecting clients.
* Maintain a rolling timeline of scene activations and map swaps so late-joining players can catch up instantly without forcing the GM to reapply settings.

### Client Data Flow & Offline Authoring

1. **Boot Sequence**
   * Load cached `{version, payload}` objects from IndexedDB/localStorage.
   * Render UI immediately using cached state while concurrently requesting `/api/vtt/state`.
   * Diff the server payload against cache. Apply only entities whose `version` increased.
2. **Authoring Queue**
   * Capture each GM action as an operation `{uuid, entity_type, operation, payload, base_version}` and push it into an in-memory queue.
   * Persist the queue to IndexedDB so the work survives a tab refresh or a temporary network loss.
   * A sync worker flushes the queue sequentially. On success, remove the operation; on `409 Conflict`, pause and fetch the authoritative entity for manual merge.
3. **Conflict UX**
   * Display diff previews highlighting local vs. server versions.
   * Offer “Keep Mine”, “Use Server”, or “Merge Fields” actions, depending on the entity type.
   * Record analyst metrics (time to resolve, conflict frequency) to tune future collaboration features.

### API & Service Hardening

* Require CSRF tokens on all mutating endpoints and enforce HTTPS-only cookies.
* Throttle uploads per user/IP and scan for malware using ClamAV or a lightweight antivirus hook before persisting art assets.
* Instrument endpoints with logging (request id, user, entity id, version) and export to centralized monitoring (e.g., ELK stack or CloudWatch).
* Expose health-check endpoints (`/api/vtt/health`) that verify DB connectivity, writable storage, and queue backlog. Integrate with uptime monitoring.

### Observability & Metrics

* Track latency of save operations, queue length for unsynced actions, and number of connected clients per session.
* Emit custom events for “scene activated”, “token created”, “asset upload failed” to a metrics collector (Prometheus/StatsD).
* Set alerts on sustained increases in conflict responses or change-log lag, indicating throughput constraints or version mismatches.

### Rollout & Migration Strategy

1. **Phase 0 – Dual Write**
   * Keep the current localStorage workflow but mirror GM saves to the new API/database. Compare snapshots daily to ensure parity.
2. **Phase 1 – Read from API**
   * Switch GM/players to load state exclusively from the API while continuing to write to both stores. Add feature flag to roll back quickly.
3. **Phase 2 – Full Cutover**
   * Disable legacy storage writes, remove fallback code, and run cleanup scripts to purge stale localStorage entries.
4. **Phase 3 – Real-Time Channel**
   * Gradually enable WebSocket broadcasting per table or per session, monitoring bandwidth and reconnect behavior.
5. **Phase 4 – Advanced Modules**
   * Layer in initiative trackers, fog-of-war masks, and condition overlays using the same change-log + versioning infrastructure.

### Testing & QA Strategy

* Implement integration tests that spin up a disposable database, run migrations, and perform token/scene CRUD flows, verifying version increments and change-log entries.
* Simulate multi-client sessions in Cypress/Playwright: one GM, multiple players, forced network drops, and reconnection flows.
* Add load tests (k6/Locust) that emulate hundreds of concurrent read polls and bursts of GM edits to validate scaling assumptions.
* Before deploying schema changes, run migration dry-runs against sanitized production data to estimate downtime and roll-back plans.

## Implementation Roadmap

1. **Foundation**
   * Define database schema & migrations.
   * Abstract file storage (local disk now, S3-compatible later).
   * Create PHP repository/service classes for scenes and tokens (load/save/delete).

2. **API Layer**
   * Build REST controllers using existing authentication.
   * Integrate token creation form to call new endpoints instead of localStorage.

3. **Client Sync**
   * Replace localStorage token storage with API-backed store.
   * Implement polling with version headers.
   * Add reconnection/backoff logic.

4. **Real-Time Enhancements**
   * Introduce WebSocket/SSE gateway.
   * Broadcast GM updates to players.

5. **Future Modules**
   * Extend schema for initiative, conditions, fog of war.
   * Use `metadata` JSON columns to append module-specific data without schema churn.

This structure provides immediate persistence improvements and creates a clear path toward collaborative, real-time gameplay features.

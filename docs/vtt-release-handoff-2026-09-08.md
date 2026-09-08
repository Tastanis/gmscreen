# VTT release checkpoint and continuation handoff — September 8, 2026

## Current decision

Stop feature development at this checkpoint at the user's request. Version
1.19.114, build 358. This is a tested code checkpoint suitable for a controlled
upload to the existing site; it is not a claim that every roadmap item or live
production integration is complete. The user authorized committing and pushing.
No production gameplay data was changed during testing.

The complete requested roadmap remains in `vtt-improvement-plan.md`; the original
requirements are in `vtt-product-audit-2026-09-07.md`. Continue from this checkpoint
when the user resumes. Do not keep implementing features merely to consume an
active goal continuation after this requested stopping point.

## Changes delivered so far

1. **Current diagnostic copies:** read-only logical Sync V2 export; current-source
   restore into isolated SQLite; updated local launch/pull tools; repeatable test
   fixtures with downloaded campaign assets and separate GM/player sessions.
2. **Canonical stairs and falls:** server-resolved positions, support and floors;
   linked player views change in the same transaction. Hidden/deleted floors,
   partial support, forced movement and interrupted stairs have targeted coverage.
3. **Floor editing/deletion:** repair saved views; relocate occupants; remove floor
   drawings, templates, fog and zones; disconnect stair links atomically.
4. **Movement modes:** Ground/Fly/Hover, landing and standard condition-based flight
   interruption. Flight eligibility, physical height and some rule cases remain.
5. **Undo:** up to 20 actor/revision/geometry-bound position/floor/stair receipts;
   button and Ctrl+Z; new group moves restore all original members or none, even
   after reload. Older unmarked receipts retain single-token undo.
6. **Forced motion and swaps:** atomic two-token cross-floor swaps; preserved
   walk/forced/teleport/undo intent; callbacks wait for confirmed movement effects.
7. **Fractional geometry:** preserve fractional cutouts and token footprints;
   exact overlap through stacked floor openings; consistent render/interaction use.
8. **Combat geometry:** shared floor participation for flanking, aura membership,
   Stand Firm and opportunity-attack adjacency; high-ground confirmation boundary.
9. **Drawing tools:** explicit V2 creation/erase/clear/gesture undo, author/floor
   scope, visibility and canonical recovery. Coordinated Draw/Measure/tool modes.
10. **Templates:** temporary ownership/author permissions; GM authority for persistent
    structures; focused shape edits; consistent circle/rectangle/wall preview.
11. **Floor viewing and roster:** explicit viewing labels; GM Show players; player
    Follow/Browse and My token's floor; configurable roster and primary PC token;
    hidden-token-safe association and saved profile precedence after renaming.
12. **Navigation and readability:** zoom, Fit Map, Center Selected, shortcuts,
    active-tool labels, Escape handling, opaque panels, larger targets, visible
    focus and laptop layouts; diagnostic-only memory information.
13. **Faster preparation UI:** token/scenes libraries before creation forms; search,
    token favorites and 20 recent placements; collapsed inactive combat roster.
14. **Character combat card:** stamina, recoveries, resources, surges and conditions
    prioritized; detailed reference content collapsed; temporary-stamina overflow
    displayed and preserved when healing.
15. **Save/connection feedback:** per-operation pending/accepted/rejected status,
    exact errors, retained rejection notices, connection recovery and manual
    reconciliation; conflict retries preserve concurrent same-field edits.
16. **Checkpoint recovery:** named immutable scene archive, capture/download/list;
    preview-bound position and layout restoration with one canonical transaction;
    current character resources and newer tokens preserved.
17. **Scene packages:** export/import/duplication, reference validation, fresh IDs,
    safe retry and catalog recovery, shared catalog locking, open without reload.
    Packages reference assets; they are not complete campaign backups.
18. **Specific-player preview:** read-only independent scene/floor/map/grid/fog,
    fractional tokens, status/marks/conditions, combat groups, drawings, templates,
    walls, auras and persistent zones, with zoom/Fit and no impersonation/writes.
19. **Persistent zones:** captured floor/occupancy, pass-through/forced/teleport
    entry detection, durable claims and canonical round deduplication, serialized
    overlapping effects, guards against ended/changed zones, explicit condition
    and stamina acknowledgements, GM unresolved-entry review and saved failure reports.
20. **Zone lifecycle:** await registration; batch owner expiration; ordered start/end
    stages; stop after failed ticks; confirmed narrow upkeep payments and explicit
    insufficient-resource handling. Broader durable tick lifecycle remains open.
21. **Character writes:** narrow resource/stamina/recovery/surge operations, stale
    resource checks, locked spending, saved-profile lookup and bounded confirmation;
    atomic JSON replacement and backups prevent in-place truncated saves.
22. **Durable character results:** operation IDs and atomically stored receipts for
    surge writes, resources and recovery spending, including insufficient/stale
    outcomes; matching replays do not repeat changes or overwrite later balances.
23. **Action review:** per-account/per-operation browser journal before sending;
    unresolved attempts survive reload; read-only actor/GM receipt lookup; recorded
    results versus explicitly uncertain missing receipts; local Mark reviewed.
24. **Repeatable verification:** checked-in complete JS/PHP-authority runner used by
    npm test and CI; explicit SQLite setup; retired V1 PHPUnit tests excluded with
    a 410 endpoint regression; scene deletion integration now tests V2 authority.

## Deployment procedure and limits

- Back up the hosted SQLite world using a consistent SQLite backup or logical
  export, plus character data, scene/token catalogs, uploaded images, automation
  and other campaign files. A checkpoint/scene package is not that full backup.
- Upload application files as an overlay. Do not replace the server's data folders,
  sync-v2.sqlite (or WAL/SHM), scenes/tokens JSON, uploads, character sheets,
  hero_tokens.json, credentials, environment files or campaign records.
- The supplied update ZIP is a code delta from commit 868a7bd, the remote baseline
  before this work. It is for updating that existing application, not installing
  an empty site. New files must be uploaded as well as modified files. Keep any
  existing server-edited player-roster.json; the supplied file is the default roster.
- Deploy PHP and JS together, with all VTT tabs closed; then hard-refresh/reopen.
  Mixed old/new assets are not a supported test state. Confirm version 1.19.114.
- PHP 8.1+ with pdo_sqlite is required; production PHP/version/extensions were not
  queried here. The server account needs write/rename permissions for character
  data and VTT storage; atomic JSON files are created in the destination directory.
- The pre-existing Pusher secret requires external rotation/configuration through
  VTT_PUSHER_SECRET. Current production credentials and external real-time delivery
  were not verified. Tests used local HTTP recovery with Pusher disabled.
- Perform the documented live GM plus two-player connection/reconnect smoke/soak
  before relying on this for a session. This remains an external sign-off step;
  production gameplay mutation was deliberately excluded from this work.
- No database reset or manual migration command is part of this upload. Preserve
  existing databases; server initialization manages its additive tables/schema.
- Receipts are retained without pruning. Browser reminders are local, not a shared
  cross-device action queue. Clearing browser storage removes local reminders.
- A payment receipt does not prove later healing/zone/ability steps completed.
  Current UI makes this explicit; broader multi-step recovery remains unfinished.

## Verification at the checkpoint

- npm test: 759 passed across 100 files, including PHP/SQLite authority scenarios.
- PHPUnit in a disposable application: 62 tests, 182 assertions passed.
- Syntax checks: all 50 PHP files changed since baseline passed.
- Diagnostic Python tooling: 3 tests passed.
- Latest Action review browser journey and centered dialog visual check passed.
- Final release browser: GM/Cal/Sharon stairs, fall, linked views, reload and undo passed; Action review saved/missing-result/account-isolation journey passed.
- GitHub CI is checked after pushing. Its authoritative result is available in the pushed commit's Checks tab and the repository Tests workflow: https://github.com/Tastanis/gmscreen/actions/workflows/test.yml.
- Eight old V1 tests are excluded because they require deleted state_helpers.php
  or behavior of the retired state.php writer. Their files remain as history;
  canonical movement/permissions/visibility/recovery are covered by the V2 suite.

## Resume order and unfinished scope

1. Audit remaining character-write callers and complete coordinated multi-step
   action recovery: payment/healing, board/sheet reconciliation, zone tick/upkeep
   outcomes, uncertain continuations and cross-device GM review.
2. Finish shared physical elevation/height/range/adjacency/opening rules and flight
   eligibility; test all alternate movement/ability entry points.
3. Finish camera follow/centering policy beyond the existing floor Follow/Browse.
4. Add encounter presets and remaining asset collections; handouts/show-image and
   campaign-linked map pins.
5. Implement movement/sight/line-of-effect barriers, doors and interaction
   permissions; difficult/damaging terrain on shared geometry.
6. Perform a full backup/restore drill and production credential/three-client sign-off.

Dynamic lighting, voice/video, marketplaces and generic compendiums remain deferred.
Do not restore V1 whole-board writers. Consult docs/vtt-sync-v2/README.md and the
Draw Steel AI reference before changing shared persistence or automation hooks.
Use fresh disposable fixtures for gameplay QA. Four unrelated untracked monster
artifacts were deliberately not included in this release.

Useful commands:

```
npm test
python -m unittest discover -s dnd/vtt/tools -p "test*.py"
python dnd/vtt/tools/create-drawing-fixture.py --diagnostic-root "C:/Users/tasta/Desktop/gm screen test repository" --floors
powershell.exe -NoProfile -ExecutionPolicy Bypass -File dnd/vtt/tools/start-diagnostic.ps1 -DiagnosticRoot "C:/Users/tasta/Desktop/gmscreen/.playwright-mcp/floor-regression" -Port 8129
node dnd/vtt/tools/test-floor-browser.cjs
node dnd/vtt/tools/test-character-operation-review-browser.cjs
```

Fixtures are stateful; regenerate them between independent movement scenarios.
The test server must be stopped before replacing its fixture. Do not run the old
PHP integration tests against a checkout containing campaign data; use a disposable
copy with tests and phpunit.xml.dist copied into it.

## Implementation commit index

The following commit titles provide the complete incremental history before the
release-checkpoint cleanup (104 commits):

- `a728acc` Sync project roll decisions across chats
- `9f46cda` Restore current VTT diagnostics and reliable floor-scoped drawings
- `93c10b2` Enforce template ownership and persist only changed shapes
- `0539f14` Resolve stairs and hole falls atomically with token movement
- `2f164c6` Restore token floors and stair progress with verified movement undo
- `594be80` Put saved VTT content first and connect token search
- `49966c4` Add visible map zoom fit and selection navigation
- `6886687` Respect floor participation in combat suggestions and adjacency
- `ed172e4` Collapse inactive combat tracker into an optional roster
- `7d8542e` Show precise per-operation save outcomes and retain rejected notices
- `910ae2b` Distinguish connection recovery from rejected board changes
- `5bcf5f9` Show active map tools and focus template placement for Escape
- `c7d6a4b` Prevent drawing and measuring from competing for pointer gestures
- `dfaf68b` Validate current movement authority inside transaction
- `9421aaf` Coordinate board tools and close editing modes on Escape
- `026d484` Preserve movement intent through floor transitions and undo
- `cd09371` Prioritize combat controls in a compact character card
- `c2ce9eb` Report and reconcile character resource save failures
- `5fb98dd` Add token favorites and recently placed library collections
- `98cb44b` Apply character confirmations to the current refreshed sheet
- `6a66cba` Preserve explicit floor views and add return to token floor
- `b285470` Validate floor view destinations inside canonical transactions
- `2bfc238` Add immutable GM scene checkpoint archive and API
- `3341d72` Add scene checkpoint capture download and archive controls
- `db62219` Preview scoped checkpoint position restores against current state
- `bab3971` Restore reviewed checkpoint positions atomically
- `4567efe` Wait for stable token targets in checkpoint browser regression
- `081d9bd` Reconcile saved viewer floors atomically on floor edits
- `e222876` Delete occupied floors with atomic supported token relocation
- `6bcbaf4` Clean deleted floor content and stair links atomically
- `d2216d9` Reconcile live floor visibility and protect player bootstrap
- `27114b6` Add canonical ground fly and hover movement modes
- `bd9a79c` Resolve standard speed-zero conditions in flight support
- `d9a6abb` Show temporary stamina and preserve overflow when healing
- `2c12526` Configure VTT player roster consistently on server and client
- `bd1e83e` Select an explicit primary PC among duplicate tokens
- `84cae10` Keep scene edits usable after player roster removal
- `cc3f5ca` Preserve primary association without exposing hidden tokens
- `f7998a0` Add a GM roster editor with stale-save protection
- `7bf9aae` Let players follow their token floor or browse independently
- `013d007` Export scene setup with catalog metadata and asset references
- `aa22f71` Serialize scene catalog creation and edits with deletion
- `9b2479f` Preview scene packages and reject broken references
- `91888df` Prepare scene copies with explicit ID remapping
- `44725a1` Preserve mirrored stair editing in prepared scene copies
- `10136d3` Add atomic scene import authority and catalog recovery
- `bf3dd34` Enable validated scene-file import with safe retries
- `921287d` Add scene duplication and copy naming controls
- `e3c1724` Open imported scenes after sync without reloading
- `84e9449` Improve panel opacity and laptop floor controls
- `a864229` Add atomic checkpoint layout restore planning and authority
- `91648eb` Preserve canonical grids across recovery and scene activation
- `6cfc084` Expose reviewed checkpoint layout recovery to the GM
- `68ec362` Add read-only specific-player preview projection endpoint
- `31373fd` Add read-only player scene and floor diagnostics
- `b43ef04` Extract passive fog painting for independent player previews
- `76480e3` Add independent player map floor and fog preview dialog
- `f4feb12` Share player token presentation and preserve fractional render positions
- `a0f8e70` Add player preview drawings and local zoom controls
- `7f396f2` Share template floor visibility and cutout masking
- `9a1ecee` Share circle and rectangle template painting
- `aba413a` Share template hydration and preview circles and rectangles
- `d348a3b` Share wall rendering with the passive player preview
- `1c299da` Share stamina rendering and preview player token readiness
- `098fdde` Share condition and mark presentation with player preview
- `c6f37f2` Share aura rendering and legacy token hydration with preview
- `86648d6` Clip player aura footprints through floor cutouts
- `7afaf7e` Bind persistent zone occupancy to its captured floor
- `d8579ac` Render floor-aware persistent zones in player preview
- `60f51ef` Complete captured player preview with projected combat group colors
- `3869c30` End deleted-floor zones atomically and restore retained zone rendering
- `fe6ccbe` Trigger persistent zone entry when movement passes through its footprint
- `932d623` Capture trusted walking receipts for zone entry claims
- `213faf8` Reserve persistent zone entries with durable server claims
- `b3b3f21` Track zone entry outcomes and expose unresolved claims
- `426ed57` Add GM zone entry recovery and safe client claim coordinator
- `36dc44c` Confirm condition saves and claim walking zone entries before effects
- `3ac245c` Use canonical zone rounds and serialize overlapping creature effects
- `83990c5` Stop queued effects when their persistent zone ends or changes
- `18fc927` Apply cross-floor swaps in one confirmed placement batch
- `d720e99` Claim forced and teleport zone entries with confirmed stamina sync
- `dec469d` Wait for zone outcomes before resolving movement automation
- `53c92ee` Preserve fractional floor cutouts across rendering and visibility
- `bcd2911` Preserve fractional token footprints through floor visibility
- `5cb9671` Bound stamina-save confirmation and review uncertain writes
- `b2cb407` Preserve and display zone recovery failure reports
- `dac358b` Await persistent-zone registration before reporting success
- `5c54c28` Remove matching owner zones together at expiration
- `870f9c9` Verify one accepted zone expiration across conflict retry
- `cbd4914` Preserve concurrent placement edits during conflict recovery
- `83e6207` Order canonical zone expiration and turn effects
- `55c5299` Stop canonical zone stages after failed tick effects
- `e488cff` Confirm zone upkeep through locked narrow resource spending
- `fb1cabd` Save heroic resources narrowly with stale-balance checks
- `ace3f4d` Bound narrow heroic-resource write confirmation
- `84d8cef` Spend recoveries atomically without whole-sheet writes
- `dc519dd` Honor saved character links after token renames
- `a6ab167` Confirm surge gains through bounded character writes
- `a860d7a` Link movement undo history to accepted operations
- `0c809d1` Restore group movement atomically from server receipts
- `eb841a7` Connect group movement undo to browser controls
- `0bf576e` Save character changes atomically with surge receipts
- `850b899` Persist resource and recovery spend outcomes
- `3b57116` Add read-only review for interrupted character writes

Final release hardening: a response arriving after the character-write timeout
can no longer clear the interrupted-action reminder. A dedicated late-body
regression verifies the reminder remains unconfirmed for manual review.

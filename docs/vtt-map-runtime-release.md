# Map runtime release preparation

The runtime source is `dnd/vtt/assets/js/ui/` plus `dnd/vtt/lib/` and the Sync V2
API. The ignored terrain prototype is historical/test input, not deployable source.
Read [map preparation](dungeon-alchemist-map-import.md) before map work and
[Sync V2 authority](vtt-sync-v2/README.md) before persistence changes.

## Local testing and packaging

`python dnd/vtt/tools/build-map-runtime-package.py --output <archive.zip>` creates
a code-only archive and verifies every file against its SHA-256 manifest.
`python dnd/vtt/tools/install-local-map-runtime.py --package <archive.zip> --app <path>`
updates only marked local test apps under `.playwright-mcp`. It preserves database,
server configuration and uploaded media. It is not the production deployment tool.
Never run map setup/build scripts to refresh an existing sandbox.

Production receives reviewed repository changes through the normal site deployment.
This VTT archive assumes the rest of the DND site already exists. It excludes
credentials, character sheets, databases, uploaded media and native map files.
Do not publish the ignored sandbox folder or test-login endpoints.

## Existing-map preflight

Maps must have canonical `sceneConfig.environment` terrain/walls before release.
Browser-only legacy terrain and IndexedDB roof images require an explicit migration;
the packaged renderer deliberately does not silently import one browser's data.
Upload roof images through the authenticated shared media path before saving them.
Keep native `.dam`, matched floor exports and conversion metadata separately.
Changing an image URL does not replace canonical design. Copy/export/checkpoint
operations use the canonical environment. Changing floor elevation does not rebase
absolute imported wall, roof or ramp heights; regenerate/adjust them together.

## September 27 implementation and validation

Portal toggles are small revision-checked commands. Terrain edits use rectangular
sample patches. Whole-field saves emit only that field. Oversized Pusher messages
become revision notices; clients do not advance their cursor until authenticated
HTTP recovery applies original player-projected events or a snapshot. Event history
retains full changed-field data for replay; initial map installs may still be large
in SQLite. Real hosted Pusher delivery remains unverified locally.

Own save acknowledgments preserve editor undo. Edits during a save are coalesced;
foreign revisions still reject rather than overwriting another draft. Invalid wall
documents retain the last good model and disable editing without killing the loop.
Closed secret doors project as ordinary walls, open ones as ordinary doors. Player
ownership/PC links, rather than the ally team label, determine always-visible markers.

Forced collision stops use the 75% whole-step rule and grid coordinates. Terrain
slams use a whole-square yellow-grade window plus one-square quarter-run faces.
Short uphill faces also qualify with one square of rise over half a square of run,
preserving the 2:1 steepness threshold rather than lowering it for the whole map.
The shared PHP/client contact checks retain the separate downhill fall policy.
Version 1.19.166 passed 837 regressions and isolated player browser checks against
both measured Bathhouse faces: rejected bypass, matching stop and four-damage
collision receipts, reload, and unchanged original token. This verifies the
browser collision planner and command path; it does not retest physical Ctrl-drag.
Gentle rises lift a pushed flier only as far as the ground it crosses. Server and
client checks must remain paired. Ordinary walking and advisory budgets are unchanged.

Non-teleport floor/terrain falls and interrupted flight create a durable review.
Only the actor receives an editable damage/Prone prompt; interrupted or partial
application requires manual GM review and never automatically replays. Landing
relocation searches nearby supported free spaces; a packed area requires GM review.
Agility/Might are read from existing sheets/monster data, with manual damage adjustment
available. Agility reduction is clamped to zero: negative Agility never increases
fall damage (three squares with Agility -1 is six damage). Forced-downward falls
still receive no Agility reduction. A future sheet feature for fall reduction remains unimplemented. Vertical
forced movement remains manual, so forced-downward damage has no new movement UI.

Fall review uses the actual map token as its anchor, not a tracker entry with the
same placement ID. Each affected creature is listed, with plain "Will be prone"
text only for qualifying recipients. A reduced ground fall below two effective
squares does not make the faller prone. Landing on another creature does make the
faller prone; each creature underneath is prone only if the faller's size exceeds
that creature's Might. Equal size/Might does not qualify. Editing damage does not
rewrite these separately computed condition rules.

Teleport now confirms the destination height after release, displays surface elevations
+ 1, and checks the ability range using maximum horizontal/vertical displacement.
Grounded airborne arrivals produce a fall review; flying arrivals retain altitude.
Cancel performs no movement. Hold Space when releasing a token drag to teleport;
this gesture has no ability range attached. Alt remains the map ping shortcut.

The teleport chooser is anchored beside the destination, with a 500 ms input guard.
Surface buttons confirm directly; red buttons warn about insufficient range but
remain clickable. Surface/Custom Go clicks explicitly send allowOutOfRange when
needed, which players may use; no extra confirmation is required. Server geometry
and landing validation still apply. This is movement intent, not ability-authoring JSON.
Custom whole-number standing height uses Go, while Cancel performs no movement.
Unlimited, noncombat, nonflying travel to a single same-height surface skips the
chooser. Displayed heights are rounded; exact geometry remains intact. This UI
change does not complete the separate audit of rounding across all gameplay rules.

Ability teleport/forced movement selection uses the visible overlay's flat grid
coordinates, bypassing the terrain correction used by ordinary map picking. This
keeps cell-edge hover and confirmed placement consistent; it does not warp the
selection grid onto terrain. Canonical destination height is resolved separately.
The guide layer is above height-vision fog and does not modify fog or reveal map
content. `test-teleport-overlay-browser.cjs` covers terrain-shifted picking at both
cell edges, opaque fog stacking, and confirmed landing in the previewed cell.

Validation on September 27: `npm test` passed 827 tests across 112 files.
The disposable GM/two-player browser checks passed portal updates, secret-door
projection, queued terrain strokes, undo after acknowledged saves, reconnect,
scene copy, checkpoint restoration and build-versioned module loading. The real
ability teleport handler passed range warnings, cancellation without movement,
chosen airborne arrival, actor-only fall review, reload recovery, Agility-adjusted
damage and Prone application without duplicate damage. Three stairs passed ascent
and descent with walking, shifting and legacy teleport movement. Interrupted
collision records remained pending after reload and appeared in GM recovery.
Personal explored fog remained private and survived reload. Browser runs reported
no page errors. The flying undo regression restores the recorded altitude without
tracing the terrain between endpoints again.

The code-only archive is prepared and verified in the disposable local app. This
does not establish production Pusher delivery or update the user's existing map
sandbox. Neither production publication nor Git commit/push occurred during this
validation. Before publication, check legacy-map migration requirements above and
run the hosted GM/two-player delivery test. Changing scenes while an editor save
and additional strokes are pending still needs a dedicated regression; finish
editing and let saves settle before switching scenes in the meantime.
# Terrain-shaped destination guides

Ability movement destination outlines now follow projected terrain/floor support,
with picking against the same shapes. Compressed cells open a nearby, stationary
3x3 magnifier at 40% of ordinary cell thickness. Enlarged tiles select original
canonical coordinates and retain server range/collision/landing authority. The
magnifier contains outlines only and remains above fog. No cliff classification,
falling mechanics, ordinary drag rules, or saved map data changed in this update.
The cutoff is a visual default, not a movement rule. Browser regression covers
raised-terrain edges, fog, magnifier anchoring, exact accepted landing and cleanup.

### GM inspection height â€” 1.19.163

The GM header arrows now change a scene-local inspection height by one square,
including below zero and above the highest floor. They do not select discrete
floors, move tokens, or submit viewer commands. The label always says Height.
A height click overrides selected-token sight locally; selecting another token
restores token sight. The preference survives reload. Explicit Show players still
uses the canonical floor command, resolving intermediate heights to the floor at
or below the inspection height (the lowest floor when below all floors).

Vision repaint signatures include viewer floor, physical ground height and
inspection height. Terrain projection and roof/stair painting consume that same
height. This does not rebase imported geometry: the Bathhouse basement/ground/
upper/roof remain at 0/2/4/6. Its basement artwork is visible at Height 0.
Player terrain scaling now uses the owned token supplying personal vision,
including on negative terrain, rather than an unrelated linked-floor reference.

Validation: the final suite passed 833 tests across 114 files, including new
height-state tests for floor gaps, selected-token overrides and player isolation. The read-only
Bathhouse browser regression passed -3 through 8, intermediate-height repaints,
basement/ground artwork, reload, unchanged canonical state and zero board command
requests. Native map, tokens, player views and sandbox data were preserved.
Live publication requires a separate confirmed hosting deployment.

The separate negative-player-height browser fixture verified an owned token at
physical support -6.164 squares: its personal sight and token rendering remained
active, and terrain presentation followed its -6 display band instead of the old
linked-floor reference. This test uses a separate SQLite backup/runtime; it does
not move or remove user tokens in the Bathhouse sandbox.

### Paving support reacquisition â€” 1.19.164

Grounded movement can reacquire a known, non-hidden floor plate where terrain is
within 0.1 vertical squares below that plate. This narrow contact tolerance handles
nearly flush imported paving; it does not permit climbing a whole square or
attaching to an overhead floor. Positive footprint area, authored holes and floor
cutouts use the shared polygon support rules. Stair progress and airborne tokens
retain their existing authority. Contact checks the accepted endpoint and retains the acquired floor on subsequent
movement. It does not invent an elevated intermediate route through walls or over
a gap. Separate explicit teleport landing choices retain their authority.

Both token.move and position-only placement batches resolve contact on the server.
Client ground height and server collision height recognize the same contact, so an
existing token resting just below paving renders on it immediately without a data
rewrite; its next accepted movement persists the floor assignment. Roof visibility
and personal fog were not relaxed. The Bathhouse datum remains 0/2/4/6.

The copied Bathhouse fixture passed three player off/on trips, actual pointer drags,
paving pixels beneath the token, personal sight, reload and original-token
preservation. Separate negative-terrain player vision passed at -6.164 squares.
Pure server/client checks cover raised overhead floors, holes/cutouts, hidden floors,
hover and the absence of unvalidated intermediate support;
existing stair checks remain in the complete regression suite. The local code-only
installer skips byte-identical files so open unchanged PHP polling endpoints do
not prevent refresh. Existing database, images and configuration are preserved.

Final 1.19.164 verification: 834 tests across 114 files passed. The original
Bathhouse sandbox was updated by the code-only installer; its complete canonical
state remained unchanged at revision 3866. A fresh GM browser verified the existing
blue token at (11,31), with support height 2 and opaque paving pixels underfoot,
without changing any token or viewer state. Live static-file inspection still
showed the pre-fix renderer; SSH authentication was rejected. Publication awaits
hosting access and must be verified separately from the Git push.

### Authored roof support bounds â€” 1.19.165

A roof-only level uses its authored roof polygons for support instead of treating
an empty floor-polygon list as a legacy full-map plane. Existing floor polygons
remain authoritative on levels that contain a floor; truly unmodeled legacy
levels keep their prior cutout fallback. Server and client resolve imported
polygon rings and node-authored roofs consistently, including polygon holes.
Movement, flight interruption/landing, checkpoint support, collision heights and
teleport destination choices share that boundary. No floor is revealed or token
moved merely by loading the updated code.

The disposable Bathhouse regression failed on the old source because (23,35)
offered Roof 7 outside the roof polygon. It passed after the fix: no exterior
Roof option, inside-roof support retained, walking off the roof falls, ending
flight outside it lands on real support, and a custom-height teleport cannot
manufacture an exterior roof. Reload retained the accepted landing, and the
original blue token was unchanged. The complete suite passed 835 tests across
114 files, including paired roof/legacy/node-geometry support checks.

Publication scope: commit/push and a code-only Bathhouse sandbox update. The user
explicitly requested no cPanel installation; no production deployment is claimed.

## Held movement camera panning â€” 1.19.167

Right-button dragging pans the camera while retaining a held token or an ability
movement picker. Mouse button chords are handled before token movement because
the additional press/release arrives as pointermove. Releasing right ends only
the pan and retains left-button capture; releasing left first commits once and
allows the pan to continue. Movement picking runs after the camera transform.

The isolated browser regression covers actual combined buttons at zoom on raised
terrain: walk, shift, forced movement, teleport, flying/hovering, push/pull/slide
and teleport pickers, both release orders, group movement, retained waypoints,
pre-activation panning, pointer cancellation, Escape and a real player session.
Accepted moves submit once and finish at the intended cell. Original scene tokens
remain unchanged. The complete suite passes 837 tests across 115 files.

## Unblocked fall reviews â€” 1.19.168

The reported Bathhouse forced move (19,30) to (22,33) already recorded a fall
from support height 2 to terrain -5.8719419: 7 whole falling squares under the
existing policy. An earlier pending receipt for a deleted test token blocked
the client review queue. Review selection now skips unavailable fallers or
struck creatures, leaving their receipts intact for manual GM recovery.

The disposable browser regression reproduces the missing dialog on the prior
code, then verifies a real Ctrl-drag creates one fall receipt and opens its
review after the fix. Reload preserves the pending review; Apply deducts 14
stamina at Agility 0 and adds Prone once. A subsequent reload never reapplies
the outcome. The orphan receipt and original scene tokens remain unchanged.
All 838 regressions pass across 115 files. Fall geometry and downhill movement
rules are unchanged; this fixes presentation of already-recorded outcomes.

## Playtest fixes - 1.19.169

Confirmed moves now apply flight altitude, movement mode and supporting surface
to the live board before visibility refresh. Point-outline imported roofs/floors
no longer crash the wall roof editor or prevent subsequent door updates.
Height edits retry unrelated revision conflicts through the existing field-safe
retry; competing height edits retain the accepted value and display an inline
error. Escape closes the Templates menu and returns focus to its button.

All 839 tests pass across 115 files. The disposable loopback regression
`node dnd/vtt/tools/test-playtest-fixes-browser.cjs` requires a cloned diagnostic
app marked with `test_fixture: "playtest-fixes"` and the Bathhouse source scene.
It imports a separate synthetic hill/building scene, then verifies GM/Cal/Sharon
flight visibility before/after reload, flying teleport, point-outline doors,
node-roof editing, both height conflict cases and Templates Escape. No page errors;
original scene placements remain unchanged. A scene switch completed in 1.2 seconds.
This does not establish live Pusher latency or combat stair-drag coverage.

The shared tracker retains its existing GM Hide policy. Upper-floor template
filtering and roof-edge look-down behavior are unchanged. Publication is Git
commit/push only; no cPanel installation or production deployment is claimed.

## Raised-room support - 1.19.170

Walking, shifting and forced movement acquire a floor at its travelled entrance
when the floor is within 0.1 vertical squares of the preceding support height,
including a slight step down. Once acquired, the physical plate height and ID
persist over lower terrain, rather than following an excavated basement below.
This supersedes the endpoint-only contact restriction documented for 1.19.164.
Teleports retain their explicit landing choice and stairs retain their authority.

Client and server wall checks use the acquired support height, including paths
with waypoints, so entering a room cannot pass underneath its interior walls.
Exact surface IDs respect polygon holes and level cutouts. Ending flight or
interrupting ordinary flight selects the highest supported visible surface below
its altitude, including fractional plate heights. It does not acquire ceilings
above the flier or reveal hidden floors.

The canonical raised-room regression covers walk/shift/forced/batch commands,
reopened storage, no false basement falls, interior walls and flight interruption.
The three-client browser fixture tests all six reported terrain variants with
real player drags, canonical movement, landing, floor visibility and reload.
Run `node dnd/vtt/tools/test-raised-room-browser.cjs` against a disposable clone
marked `test_fixture: "playtest-fixes"`, on loopback port 18795 by default.
No campaign data or production hosting is changed by this release.

Validation: all 841 tests pass across 115 files. The six-variant three-browser
regression passes on version 1.19.170 with no page errors; room enemies remain
visible and basement enemies stay hidden after vision initializes and reloads.

## Basement stair support and floor precedence - 1.19.172

The reported Bathhouse landing has terrain at -0.125 and a basement floor at 0.
Both round to standing height 1, but they are different physical surfaces. The
base-level plate was missing from contact lookup because it had no separate
mapLevels entry; stair exits also saved only the level, without concrete support.

Base-level plates now participate in support resolution. Stairs attach a matching
floor plate at the destination level, including level-0, and movement retains its
support ID. Floors win over terrain at exactly equal physical height. The shared
0.125-square ground-clearance rule also treats terrain immediately beneath a floor
as buried contact, replacing that unusable teleport destination with the floor.
This is separate from the 0.1-square walking edge-step tolerance. Terrain heights
are unchanged. Holes/cutouts, outside terrain and larger underfloor gaps remain.

Teleport choices use authored physical surface heights instead of also inventing
a generic level plane where authored geometry exists. Equal-height ties prefer
concrete surface IDs. Older requests into the near-flush buried terrain normalize
to the accessible floor; real below-floor destinations remain distinct.

The actual Bathhouse regression is test-basement-support-browser.cjs, using a
marked disposable SQLite copy and temporary player token. It traverses the real
stair, walks several basement cells, checks support and sight after reload, and
checks one accessible basement landing with no false fall. See the import guide
for repeatable endpoint and clearance preflight checks for future maps.

Validation: 842 tests across 116 files pass. Actual Bathhouse three-client
regression passes, including real mouse stair descent, several basement steps,
reload, visible floor artwork and sight, one accessible basement choice and no
false fall. Existing user placements remain unchanged in the disposable copy.

## Bounded arrow movement backlog - 1.19.173

Keyboard input retains FIFO order and the existing 12-input cap, with a new
3000 ms maximum age before dispatch. Waiting for a prior move's acknowledgment
counts toward that age. A slow response therefore cannot leave a long sequence
of old arrows moving the token after the user has stopped pressing keys.

The queue remains locked until the issued move and its existing follow-up settle.
Selection or scene changes discard unsent inputs, including switching away and
back. Rejection, timeout or failed follow-up clears them too. Nothing cancels an
issued command, creates an extra replay, changes movement receipts, or adds UI.
An in-flight request can finish after the three-second window; its network time
and existing idempotent transport retries are not part of the unsent input budget.

Focused queue tests cover 50-input bursts, long acknowledgment waits, normal short
bursts, direction changes, held repeat, selection/scene changes, rejection and
timeout. test-keyboard-queue-browser.cjs exercises real board keyboard events with
slow replies, atomic group moves and an accepted move whose response is lost.
The fixture is loopback-only, marked playtest-fixes, and imports a private scene.

Validation: all 849 tests across 117 files pass. Browser regression passes all
eight scenarios with no page errors. The 50-arrow burst at 1.2 seconds per reply
starts only three moves; no fresh queued move starts beyond the input deadline.
The original scene placements remain unchanged.


### Fall prompt timing (1.19.174)

Fall review wakes on accepted movement/placement changes and recovery, coalescing
notifications into one ledger read at a time. Prompts open alongside the animation
instead of waiting for it; periodic recovery remains. A real Ctrl-drag in a
disposable Bathhouse copy opened the prompt 269 ms after acceptance, recorded one
fall and one animation, and applied damage/Prone once. Pending-review reload,
completed-review no-replay, orphan bypass and unchanged original tokens passed.
Focused tests cover overlapping wakeups, next-review scheduling, duplicate clicks,
uncertain damage, actor/scene filtering and disposal during trait loading. This
local timing does not establish production network latency.


### Combat and solid wall templates (1.19.175)

Combat recovery restores the owning player's existing End Turn prompt without
replaying turn-start effects. Early End Round uses the existing confirmation.
Fresh average Victories is collected before combat.start; the server atomically
adds heroes + 1 at start and heroes + round number at each round advance.
Monster Malice cancellation refunds only the amount actually debited. Monster
power-roll tier_effect text survives both normalizers and appears in tray hover,
chat text and the stat block; previously stripped snapshots need replacement.

Each wall-template square is a solid one-square cube. Optional square elevation
is a nonnegative stacking offset above terrain, supported ramp or native floor.
Legacy squares default to zero. Stone, dirt, metal, ice and fire all block movement
and sight at their actual height. Their generated textures share projected faces
between the ordinary board and passive previews. Repeated clicks stack; projected
faces retain their canonical column/row, including the next-cube ghost. Click a
cube and Delete removes only that cube. Whole-template dragging retains elevations.

Cube barriers and support lids are derived from canonical templates at runtime,
never saved as duplicate native walls. Upsert/import/checkpoint boundaries validate
cube coordinates, elevations and duplicates. Player ownership and floor projection
remain unchanged. Teleport/explicit altitude cannot end inside cube volume; flying
above it remains valid. Same-height tops and touching lower tops support movement.
Existing fall receipts prevent replay. Removing an occupied support cube does not
start an extra physics transaction; support resolves on subsequent movement.

Validation: complete suite passes (865 tests across 119 files). Disposable GM,
Cal and Sharon browsers verify own-turn refresh, turn convergence, Malice
permissions/add/spend, fresh Victories, box/G groups, natural/early round advances,
five-cube stacking through shifted top faces, individual deletion/reload and all
five textures. Actual monster hover/chat/stat-block formatting is browser-checked.
Canonical campaign tokens are unchanged. These local checks do not establish live
Pusher latency or exhaustive coverage of every authored ability.


### 1.19.176 — terrain rendering and cliff regression

Terrain token presentation batches layout reads and writes attributes/styles only
when their values change. Wall-cube invalidation serializes templates and floor
cutouts only when the immutable store snapshot inputs change. Sight rays reject
conservatively disjoint wall bounds before the unchanged exact intersection,
height, limited-wall and directional checks. No geometry or visibility rules change.

The disposable exact-import cliff browser fixture checks Sharon at column 24,
row 27 on terrain height 1.7484, five visible downhill terrain pixels, roof/fog
compositing and closed-basement privacy. Original scene placements are preserved.
Idle token attribute mutations fell from 903 to zero over five seconds; this is
a local measurement, not a live FPS result. Exact geometry produced identical
sight results in 117,045 before/after comparisons. Live black-ground reports are
not yet reproduced on this runtime; build/cache equivalence remains unverified.

Run `node dnd/vtt/tools/test-cliff-vision-browser.cjs` only against a disposable
loopback app with manifest `test_fixture: vision-performance`, copied map assets
and test-login support. `VTT_TEST_ORIGIN` selects its origin; `VTT_TEST_PACKAGE`
selects the read-only scene export (default local Downloads scene-bathouse.json).
Never point the test at production or a campaign sandbox.


This release also includes the reviewed single-file `.vttmap` importer and builder
from the Bathhouse map task. It validates bundled image checksums, uploads images
through the existing authenticated GM endpoint, remaps image references only and
uses the existing scene-import transaction/recovery. Six importer/UI tests, two
builder tests and a real four-image loopback HTTP import passed. Transport retry
retains the scene operation ID; an uncertain image-upload response can leave an
unused duplicate image asset. No campaign map or live deployment is performed.

Combined validation: 879 automated tests across 122 files pass. The exact-cliff
browser also verifies height/projection updates after accepted movement and reload.


Fog toggling now marks only `fogOfWar` dirty. Previously it marked all scene
configuration dirty and additionally sent floor and grid replacements, increasing
revision contention and risking unrelated overwrites. The real store regression
checks field scope. A disposable GM/Cal/Sharon browser test checks that on/off
toggles send exactly `fog.set`, converge, and preserve floors, grid and tokens.
Scene revision guards and conflict recovery remain unchanged. This addresses a
verified cause of unnecessary writes; the reported live toast may also arise
from legitimate concurrent edits and is not proof of the cliff-rendering cause.


### 1.19.177 — deliberate wall-cube deletion

Single click selects a wall cube. Double click opens the existing themed deletion
confirmation for that cube; Delete/Backspace also confirms cube or whole-wall
removal. Cancellation changes no geometry. Repeated delete requests share one
pending dialog. A recovered/replaced shape cannot be deleted by an old dialog.
Pointer capture retargets the double click to the wall container, so deletion uses
the cube picked on pointerdown; clicking empty wall space clears that cube pick.
Stacking/dragging gestures and author/GM permissions remain unchanged.

The disposable wall-cube browser regression verifies single-click safety, keyboard
confirmation cancellation, canceled/confirmed double click, one-cube removal and
GM/Cal/Sharon reload convergence, alongside shifted-face stacking and all materials.

Validation: 879 tests across 122 files pass; the expanded three-client wall-cube browser regression passes without page errors or campaign token changes.


### 1.19.178 — My token camera and movement latency

My token returns to the associated token's floor and centers the local camera on
its actual board bounds, including terrain parallax and scaling. Zoom, the Browse
preference, token position and other clients' cameras are preserved. Same-floor
centering issues no shared command; unavailable/hidden primary associations do not
fall back to another token. Existing accessibility text describes the behavior.

FloorSupport compiles bounded request-local cutout indexes and polygon topology.
Only overlapping cutout holes participate in exact support calculation; all original
cut x partitions are retained, including distant cuts and tiny epsilon intervals.
Content keys invalidate edited geometry. Large rings, crossing counts, wide cuts
and index budget overflow use exact conservative fallbacks. Floor heights, collision
rules, walking/shift/flight, authority and fall/zone receipts are unchanged.

Exact Bathhouse wall validation benchmarks improved blocked 13-square drags from
3.0–3.8 seconds to approximately 54–87ms and one legal 12-square drag from 853ms to
approximately 5–8ms. These are local PHP validation timings, not production HTTP
latency. 750 original/optimized actual-map footprint support comparisons agree.

The movement runtime renders each unchanged pending geometry once instead of
twice before POST. Conflict reconciliation still repaints retries; rejected group
moves clear stale previews and restore confirmed positions. Pending bodies never
change canonical vision/fog observers or execute accepted-movement effects.

Disposable camera regression: `test-my-token-camera-browser.cjs`, restricted to a
loopback vision-performance app. It checks cross-floor and same-floor centering,
terrain projection, unchanged zoom/Browse preference and original token state.

Validation: 883 tests across 122 files pass. The disposable camera browser check
passes. The exact-map HTTP regression rejects a blocked drag with 422 without
changing placements, revisions or collision receipts, and accepts a legal drag
exactly once. Its measured wall rejection was 305 ms including HTTP overhead;
these loopback results do not establish production network or Pusher latency.

Player loading and manual-fog retirement (same release): first HTML keeps the
map transform hidden for players until rendering preparation and the applicable
automatic height-vision mask are ready. Reloads and same-image floor changes
re-cover the map; stale scene/floor callbacks and zero-sized views cannot release
it. GM startup is unchanged. No loading control or label is added.

The user retired manual Fog of War. Saved per-floor enabled/revealedCells data
remains compatible with scene packages and checkpoints but no longer masks active
or passive surfaces or filters tokens. Manual Enabled/Select/Clear/Add controls
are removed; the existing automatic Reset explored areas control is retained.
Automatic wall, floor, terrain-height, roof occlusion and explored vision remain.

Final automated validation: 892 tests across 125 files pass. Bootstrap
normalization retains already server-projected canonical environment data, so a
height map cannot be mistaken for a flat map before V2 recovery. All player maps
wait for the initialized renderer to paint or explicitly confirm no height mask
is applicable. Geometry activation re-covers the view before that decision.

Disposable browser validation passes for delayed height-map startup, same-URL
reload and ordinary flat-map initialization with no exposure frames, page errors
or original placement changes. The manual retirement check verifies transparent
active/passive legacy layers with saved enabled-empty records, retained automatic
height painting, absent manual controls and available Reset explored areas.
No fog commands or canonical configuration/placement changes occur in that check.

### 1.19.179 - Automatic fog toggle and visible portal symbols

The existing GM fog panel has one Automatic fog checkbox. The scene-wide
fogOfWar.automaticEnabled boolean defaults true independently of retired manual
byLevel flags. Confirmed fog.set commands synchronize it to players and reload;
only the GM can write it. Off clears automatic vision masking without changing
movement collision, selected floors or hidden-token server projection. It does
not record whole-map exploration, so on restores prior personal vision. Players
without a vision token can still see the map when the GM explicitly disables fog.
Manual painting tools remain retired, and the startup readiness gate remains.

Players see the existing door/window glyphs only through the portal near-face
sight check. Their buttons are read-only, secret portals stay hidden, and GM
portal controls remain unchanged. The vertical near-face check uses eye height
for portals slightly above adjacent terrain, retaining the upper/floor boundary.

Consequence-free ground falls now complete their durable receipt as dismissed
without opening the review. One-square falls and three-square falls with Agility
two are covered; no damage/condition writes occur. Creature landings, placement
review and nonzero damage remain reviewed. An uncertain dismissal stays blocked
for inspection without repeated completion or effect application.

The disposable GM/player browser regression passes off/on synchronization, saved
off/on reloads, no-viewer map display, rejected player writes, visible read-only
door symbols and occluded window hiding, with no original token changes or page
errors. Portal refresh matches the new vision mask before startup is uncovered.

Validation: 903 tests across 128 files pass, including durable zero-damage fall
dismissal/reload and uncertainty cases. The combined disposable GM/player fog
and portal browser regression passes with original placements unchanged.

### 1.19.180 - GM height inspection

The existing Height arrows now slice GM wall outlines at the inspected physical
height. Bases are inclusive and tops exclusive; terrain-following edges show only
their intersecting portions. Wall picking and corner handles use the same slice
and projected height plane. Floor/roof imagery remains visible with Walls open.
Changing height clears local selection and cancels an unfinished drag before saving.

Existing geometry, full collision/sight models and player vision are unchanged.
Newly drawn edges use a fixed base at the inspected height only when their default
terrain-based height would make them entirely absent from the current slice.

The disposable browser regression checks actual image pixels and wall IDs at
heights 0, 2, 4 and 6, including the existing arrows with Walls open, hidden-edge
picking and a height change followed by pointer release before the next frame.
It confirms no unintended environment writes, unchanged original placements and
unchanged player masking. This is local verification, not live deployment.

Validation: 909 tests across 129 files pass; the GM height inspection browser
regression passes with no page errors or unintended canonical changes.

### 1.19.181 - Exposed wall cube side face

The height projection exposes the west and south faces. The template renderer
previously painted the east face, which was covered by the top and left the
visible side open. It now paints the textured, shaded west face instead. Cube
stacking, selection, collision, support and sight geometry are unchanged.
The static loopback browser fixture checks all five materials, two-cube stacks
and exposed side/top click surfaces without sessions or canonical writes.

Validation: all 910 automated tests pass (full suite plus focused rerun of the
new coordinate assertion with floating-point tolerance); browser checks pass.

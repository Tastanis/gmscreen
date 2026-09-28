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

### GM inspection height — 1.19.163

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

### Paving support reacquisition — 1.19.164

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

### Authored roof support bounds — 1.19.165

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

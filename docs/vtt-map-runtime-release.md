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

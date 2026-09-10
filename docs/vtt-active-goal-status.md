# Current VTT improvement goal

Updated September 9, 2026, against the 1.19.140 working implementation.
The goal is **not complete**. This page is the current navigation aid; the full
historical roadmap and release handoff remain in force where the user has not
superseded them. Old checked boxes are not evidence that removed UI should return.

## Requirements and evidence

| Requirement | Current evidence | What remains |
|---|---|---|
| Compact floor editor with editable heights | Floor editor implemented; `test-floor-editor-browser.cjs` edits height and verifies reload. | Keep the approved compact layout; no new main toolbar. |
| Maximum-axis distance and numeric height badges | `floor-geometry.js`, `floor-elevation.js`; range and multiplayer height browser tests pass. | End-to-end coverage of every consuming ability/aura path; do not infer this from the formula test alone. |
| Height/opening-aware adjacency | Shared geometry used by suggestions, Stand Firm and opportunity movement; real stair opportunity test passes. | Larger/fractional creature and ability-specific cases beyond checked paths. |
| Height-aware auras | Shared renderer and floor participation exist; renderer fixture checks radius cutoff and cleanup. Aura registration now awaits accepted persistence; its delayed/rejected-save browser test passes. | Actual actionUsed aura damage now passes five-square exclusion, three-square reach through an opening, solid-floor blocking and reload with a same-floor control (`test-aura-height-effects-browser.cjs`). Other triggers/large-token cases remain. |
| Automatic overridable edges/banes | Ability runner suggests High ground and Enemy adjacent; override and live refresh tests pass. | Compact grouped multi-target modifiers in the existing ability roll window, approved subject to the constraints below. Generic Dice Roller Power roll mode was rejected and is out of scope. Mixed melee/ranged handling remains. |
| Movement consistency | Real stairs, falls, Fly/Hover, group undo, swap and forced/teleport journeys pass; canonical transactions remain authoritative. | Complete entry-point/edge-case audit; no claim that arbitrary movement abilities or every condition are covered. |
| Sheet/token agreement and multi-step actions | Stamina receipts, bounded status lookup, resource protections and zone damage recovery implemented. Real lost-response damage finishes once and agrees with the sheet. | Genuinely rejected sheet writes can still leave a mismatch; interrupted later ability steps and concurrent edits need explicit handling. Never blindly replay damage. |
| Persistent effect/turn timing | `runZoneBoundary` coordinates expiration/ticks; existing round, boundary, conflict, upkeep and failure fixtures are available. | Revalidate required turn journeys against final implementation; a completed entry receipt is not proof that all effects/turn paths are complete. |
| GM/two-player visibility and recovery | Floor height, hidden-floor, grid and swap tests verify specific live/reload/offline paths. | Broader combat journey with two players and final visual checks; store receipt alone is not on-screen visibility. |
| Editable inventory progression tables | Approved display, independent Level selectors, Show full table, draft paste/cell editor and row/column addition implemented. Synthetic browser test passes with four/five columns; existing save-order test passes. | Real persisted/reload journey, JSON item import and flexible per-effect charges. |
| Inventory save reliability | Atomic file replacement, precise refresh revision, dirty-draft retention and per-field save ordering implemented. | Updated-client field edits now reject stale revisions (two-browser test passes). Delete/move guards now pass two-editor checks; field saves now finish before move/delete/take (Move browser check passes); copy/whole-item/image guards are implemented; requests now have bounded deadlines and retain uncertain drafts; durable outcome recovery and old unguarded clients remain; no separate backup system. |
| Deployment/handoff | Completed slices committed/pushed; diagnostics isolated from live campaign. | Final requirement audit and deployable checkpoint once scope is finished. External Pusher rotation/production soak require external action. |

The old audit also lists encounter presets, other asset collections, handouts/map
pins and terrain barriers. Those remain in the full roadmap; this page neither
implements nor silently cancels them. Scope changes require the user's direction.

## Inventory approval and added scope — September 9

The user approved the compact table mockup: selected row, independent effect Level
selector, Show full table, and paste/cell editing. Tables must support more than
three columns and allow manually advancing each effect over time.
The user also requested inventory item JSON upload/import and more flexible effect
configuration: optional costs, charges that can accumulate, and tables. These are
authorized requirements, not implemented features. Keep charge tracking and tables
composable; do not infer automatic charge triggers or automatic character leveling.
## Roll UI decision — September 9

The user rejected a separate Power roll mode in the generic Dice Roller. Do not
add attacker/target/type pickers there or treat that rejected feature as unfinished.

Multi-target modifiers are approved only as a small integration into the existing
ability roll window, preserving its familiar UI. Four to six targets must not
require sequential dialogs or a long list of repeated controls. Group targets
sharing modifiers with short counts/reasons, keep individual details/overrides
collapsed until requested, and retain one roll for the target set. Grouping must
preserve each target's actual modifiers and applicable results, not apply a common
modifier to targets that differ. Verify four- and six-target journeys and bounded
default window height. These are approved constraints, not completed implementation.

Do not use automatic goal continuation as approval. The floor editor approval is
already settled. Do not recreate Action review, Fit/Center controls, a general
tool strip, a backup system or an ignore-falling toggle.

## Next independent work

1. Extend aura coverage to other triggers and larger/fractional creatures as
   needed; the basic five/three-square and opening damage journey now passes.
2. Extend inventory concurrency protection beyond current field edits to the
   remaining mutation paths, and handle unconfirmed writes without replay.
3. Address genuinely rejected sheet writes with an explicit, reviewed state
   comparison; any visible recovery control needs a proposal first.
4. Implement approved inventory tables/import/effect configuration and compact
   grouped ability-roll modifiers within the decisions above, then exercise full
   user journeys rather than treating storage/parser support as delivery.

Verification detail and historical results remain in `vtt-improvement-plan.md`.
The latest complete suite run has 795 passing tests across 105 files (1.19.140).
Browser scripts are separate from `npm test`.

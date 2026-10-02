# Review of Claude's October 1-2 VTT test report

Source: `vtt-testing-recommendations-2026-10-01.md`. This review distinguishes
implemented corrections from recommendations that still need design or validation.
It does not independently reproduce every scenario in the original report.
Version: 1.19.186. No production deployment or live character-data edit is included.

## Implemented

| Report item | Correction |
|---|---|
| B1, B20 | Server player projection retains narrow automation traits and structured monster trigger cards. Client hydration and potency/defense/Stability readers use those inputs. Full enemy monster snapshots remain stripped. Shared damage chat suppresses defense arithmetic. User explicitly approved browser access while keeping numbers out of the game UI. |
| B6 | Authored trigger cards register independently by card index; re-registration replaces the same card. Readiness remains keyed to the ability. Runtime delayed-trigger behavior is unchanged. |
| B7 | Area enemy/ally/self predicates receive the caster in the common preview/selection helper. |
| B8 | Removed automatic size penalty; larger melee-weapon casters gain one square before Stability. Contrary to the report, the request did not already contain keywords, so the runner now supplies effective keywords. |
| B12 | Initial monster resource handling is silent; Malice keeps its existing reservation/refund path. Explicit unsupported resource effects still report their limitation. |
| B13 | Target selection resolves the canonical placement from the rendered hit before deriving name and snapshot. |
| B16 | Monster categories emit main, maneuver, triggered, or villain action kinds. |
| B17 | Forced-movement chat uses pushed, pulled, slid and vertical variants. |
| B18, damage portion | Highest-characteristic damage per surge, three-surge cap, one chosen target in a multi-target damage effect. The report incorrectly assumed the cap existed. The first damage effect still owns this roll's surge spend; separate later effects and potency spending remain manual. |
| B21 | Damage/healing before-values read hp.current rather than nonexistent placement.currentStamina. |
| B22 | Winded fallback understands canonical HP objects and PC vitals, preferring a fresh placement lookup when available. |
| P3 | Poll every two seconds only with a successful private-channel subscription; retain 500 ms fallback and failure backoff. Reconnect recovery is unchanged. |
| B5, limited confirmation fix | Automated healing now awaits the placement save and suppresses premature manual stamina hooks before reporting success. This does not fix concurrent stamina writes or ready-mark races. |

Rules checked in the local Heroes v1.01b source: chapter 10, Big Versus Little;
chapter 5, Surges. No character-specific values were guessed or changed.

## Not applied

| Items | Assessment / reason |
|---|---|
| B5/B5b, P1 | Real concurrency problem, but the proposed fixes are incomplete. Capturing a new base at dequeue time does not make a previously calculated whole-array patch safe. Capped healing and damage are order-dependent; board and linked-sheet writes also need consistent authority and durable receipts. No blind rebasing or extra semantic retries added. |
| P2 | An entity-only conflict response cannot simply advance the global revision: intervening changes to other entities could be skipped. Needs an explicit recovery contract with contiguous event reconciliation. |
| B2 | Shift-as-slide is wrong, but a safe fix must join voluntary path legality, server shift authority, terrain/floor transitions and confirmed zone outcomes. Merely changing the verb would not do that. |
| B3 | One physical surface is not always one available choice: the dialog also offers custom height and explicit out-of-range acceptance. A blanket bypass could silently choose a destination or remove an airborne option. Kept unchanged pending a precise bypass policy. |
| B4 / S5 | Vertical forced movement needs a coordinated client/server movement feature, not horizontal movement with a new label. |
| B9 | Irreducible/source-aware reactions require schema, event payload and matching saved-ability changes together. Existing manually resolved reactions must remain usable. Not implemented as a guessed filter. |
| B10/B14 | Coupled duration bugs are credible. Both UI and placement hydration normalize durations; changing only the automation handler can prematurely expire encounter-long effects. A complete lifecycle fix must cover save prompts, turn/combat boundaries and existing records. Left together for a dedicated change. |
| B11 | Missing payload does not always mean an invalid trigger: the existing monster path explicitly permits confirmed manual resolution. A blanket block would remove that workflow. Needs a payload-dependent-effect policy. |
| B15 | Replicating runtime trigger effects to every browser can duplicate automatic execution. Persistence alone is not execution authority; needs durable ownership/claims and expiry/reload tests. |
| B18 potency option | Requires per-target potency spending, confirmation and UI. Not added with the damage correction. |
| P4 | Releasing PHP session locks changes request concurrency while B5/B5b remain unresolved. Follow the report's dependency warning. |
| P5 | Presence throttling must be tested against short requested-test routing cutoffs and multiple tabs. Not treated as a free performance win. |
| P6 | Startup/scoped snapshots change bootstrap and recovery assumptions; no duplicate-world removal without a complete loading/replay audit. |
| P7 | New thumbnail generation/storage and board/library selection require image-format and zoom-quality validation. Originals remain untouched. |
| P8 | Skipped as the report recommends; no new bundling/deployment step. |
| P9 | Removing metadata copies or changing upserts to patches requires reader and hidden-content transition audits. The bounded recovery notice remains safe delivery. |
| Q7 | Diagnostic launcher/log changes involve the separate test repository and credential-safe logging. No launcher edits made in this code review. |
| D-* / D-ALL | Live sheet corrections require current records and exact character values. Withdrawn level-gain suggestions remain withdrawn. No saved-sheet or example-automation edits made. |
| R-FRUNK | No live deletion. Story history and obsolete runtime archives are not interchangeable with current player data. Renaming an inert test fixture ID does not remove player data. |
| S1-S15 | New automation capabilities are proposals, not isolated repairs. No new passives, zone mechanics, cover solver, cascading abilities or cross-player prompts introduced. |

## Validation

Focused production-function tests cover caster-relative area selection, separate
trigger registrations, projection/hydration and defenses, zero-stamina events,
rejected-save behavior, size/Stability movement, winded state and Pusher cadence.
The DOM automation harness covers surge spend/target choice and enemy chat privacy.
PHP projection tests exercise current and legacy monster sources and idempotence.
The full suite passed 958 tests in 136 files. After that run, the added healing
acknowledgment regression also passed with all seven focused report regressions.
No live Pusher soak, production browser session or cPanel deployment is claimed.

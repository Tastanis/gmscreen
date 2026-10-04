# VTT testing recommendations — started October 1, 2026

Status: **complete** (testing finished Oct 1–2, 2026). No code in `gmscreen`
was changed; this file is the only addition there. All testing ran in a
disposable copy under
`Desktop/gm screen test repository/runtime/claude-sandbox-abilities/`, and the
re-runnable harness is saved in
`Desktop/gm screen test repository/tools/claude-vtt-harness/` (see its README).

Each recommendation has an ID, a priority, **Why**, **What it affects**, and
**How to change it**. Items marked **CONFIRMED** were reproduced in the sandbox;
items marked **CODE-READ** were found by reading code and still need a live repro.

## Summary: what to do first

37 single-ability cases (every automated main action and maneuver of the four
active PCs), about 30 multi-step scenarios (monster attack → player reaction,
full turns, zones, combat start/end; every automated triggered action except
the note-only Judgment "Stop Shift" and "Reduce Potency" options) and 8 rounds
of simultaneous-action tests ran in the sandbox (GM plus four player logins,
real UI, server state checked after every step). Not run: Indigo's melee
free strike (same pattern as her tested ranged one).
Damage math, kit/feature modifiers, costs, zones, auras, save-ends, combat
start/end and heroic-resource prompts are mostly right. The serious problems
are in **syncing between browsers** and in **what player browsers are allowed
to see**. Both affect the live site today.

**Fix first (stability and correctness):**
1. **B5b / B5: lost writes.** Two hits on the same creature at the same
   moment lose one (8 of 8 attempts: 6 on a monster, 2 on Cal). Quick
   back-to-back changes to one token inside an ability (halving refunds,
   trigger ready-marks) are dropped while chat reports success. Fix: stamina
   deltas on the server plus a per-token write queue.
2. **B1 + B20: player projection.** When a **player** uses an ability, every
   monster has characteristics 0, Stability 0 and no immunities or weaknesses,
   and monster triggered actions never arm from player actions. The same attack
   gives different results when the GM clicks it. Fix: send a small "automation
   traits + trigger hooks" block in the server's player projection (Q1).
3. **B7:** monster "each enemy" area attacks hit monsters, not heroes (one-line fix).
4. **B14 (+B10):** EoT conditions from abilities never expire (taunted etc. pile up).
5. **B6:** abilities with several trigger cards (My Life for Yours) only arm on the last card.
6. **B21:** "reduced to 0 Stamina" triggers never fire from ability damage
   (Judgment – New Target, monster death effects). One-line fix.
7. **B2:** an ability "shift" is treated as a forced slide and causes collision damage.
8. **B15:** "watch this target" triggers created by an ability (Thorn In
   Foot) only exist in the caster's browser, so monster moves never set them off.
9. **B8, B18:** forced movement vs larger creatures and surge damage don't match the book.
10. **D-ALL (data, no code):** Indigo's and Zepha's live sheets still say level 2 and 3 (Indigo also has
    9 Victories, so she starts every combat with 9 Clarity). Update the sheets. **R-FRUNK:** remove Frunk's
    leftover player data (list in section 7).

**Speed (safe, after or alongside the above):** P3 (slow the 500 ms poll while
Pusher is up: about 65% fewer idle requests per client), P1 (one command per event instead of ~20
POSTs), P2 (409s return one token, not the 4 MB world), P5 (presence-write
throttle), P7 (token thumbnails), P9 (monster events under Pusher's 8 KB limit),
then P4/P6/P8.

**Automation systems with the biggest payoff for this party:** S1 (roll
modifiers on targets: Defend, Remote Assistance, Careful Observation), S2
(board-aware "if" checks: I Work Better Alone, Improved Judgement), S10 (data
passives: Blessing of Life, Lead by Example, Disciple of Fire, Can't Take
Hold), S12 (remove a condition / save: My Life for Yours, Heal), S3 (maintained
Persistent abilities for Zepha), S4 (auto target groups and real bursts).

## Contents

1. Test environment and method
2. Speed improvements that keep sync stable
3. Player ability test results (per character)
4. Bugs found while testing abilities (system-level)
5. Ability JSON data fixes (per character)
6. Automation systems to add (system-level, not per-ability)
7. Your decisions, plus the follow-up items they created

---

## 1. Test environment and method

- Data: the fresh diagnostic export from your Oct 1 sync run (exported
  2026-10-02 05:15 UTC = Oct 1 10:15 pm local, VTT world revision 5735,
  11.6 MB world) and the production character sheets as last saved Sep 29.
  Production runs the same commit as `main` (`e6f91371`; the
  `board-interactions.js` hash in the export matches), so everything here
  applies to the live site.
- Sandbox: `runtime/claude-sandbox-abilities/` built with the same
  `build_app` routine as `Run Diagnostic Sync.cmd`, but with its own pointer
  file so the normal `Start Local VTT.cmd` copy is untouched. Server:
  `start-diagnostic.ps1 -Port 18801`.
- Scene: "Tessaract chambers" (no walls) with Zepha, Indigo, Cal, Sharon, the
  existing monsters, and three test monsters added through the real token
  library drag-and-drop:
  - **Test Dummy**: Stamina 400, M2 A1 R0 I0 P-1, Stability 2, size 1M, with
    four automated test abilities (melee strike, fire bolt, 3-cube fire burst,
    shove/push 2).
  - **Fire Dummy**: Stamina 400, M1 A0 R-1 I0 P0, fire immunity 5, cold weakness 3.
  - **Big Dummy**: Stamina 400, size 2 (2x2), M4, Stability 1.
- Each PC sheet's heroic resource was set to 10 in the sandbox so costed
  abilities could be used.
- Harness: Playwright (headless Chrome) logs in as the real player account
  (`sharon`, `indigo`, `zepha`, `cal`) or GM, selects the token, clicks the
  ability in the real ability tray, and answers every popup (target picker,
  area template, power-roll window with a chosen tier, choice/yes-no prompts,
  damage-type picker, spend dialog, movement/teleport picker, landing-height
  chooser). It records every board automation request and its result, chat
  output, page errors, and the **server's** stored state before/after (SQLite
  world row + character sheet file). The sandbox is reset to the same baseline
  before every case.
- Multi-client checks open the GM and players in separate browser contexts at
  the same time (monster attack → player reaction, simultaneous hits, routed
  requested tests). The local PHP server handles one request at a time, so
  timings are relative; production has more PHP workers but the same
  per-browser session lock (P4).
- The project's own suite (`npm test`) was run on an isolated copy of HEAD:
  952 tests in 135 files pass.

## 2. Speed improvements that keep sync stable

Production runs the same `board-interactions.js` as `main` (`e6f91371`,
SHA-256 matched), so these numbers describe live behaviour. Production
already serves HTML with Brotli and JS with gzip through Cloudflare, with a
4-hour browser cache. Timings below come from the single-threaded local PHP
server, so treat them as relative, not as hosting times.

**Measured baseline (sandbox, current world data):**

| What | GM | Each player |
|---|---|---|
| Page HTML (inline bootstrap data) | 6.85 MB | 2.81 MB |
| `snapshot.php` right after load (same world again) | 4.04 MB | 3.26 MB |
| Requests to reach "Connected" | ~230 | ~220 |
| Separate JS module files | 155 (2.5 MB) | 155 (2.5 MB) |
| Token art | 512 px PNGs up to 527 KB, drawn at ~36 px | same |
| Idle requests per minute (no Pusher) | ~180 | ~180 |
| ↳ `sync.php` (recovery poll every 500 ms) | 120/min | 120/min |
| ↳ chat poll (1.5 s without Pusher; 30 s with Pusher) | 40/min | 40/min |
| ↳ `collision-effects.php` (every 4 s) | 15/min | 15/min |
| One monster attack on Indigo (4 triggers arm) | 20 POSTs, ~7 s to settle, one 409 whose response was **4.0 MB** | — |

Ordered by value vs. risk. **Do B5/B5b and P1 before P4**: P4 lets one
browser's requests reach the server in parallel, and until B5/B5b are fixed
that would make lost writes more likely, not less.

### P1 — Send ready-marks, stamina and float text for one event as one command (fixes B5 too)

**Why:** One hit sends separate `placement.batch` commands for damage,
combat float text, each ready trigger, and each heroic-resource prompt, plus
one chat POST per line (20 POSTs for one Firebolt). `placement.batch`
already accepts an `actions` array.
**What it affects:** Every damage/heal/forced-move event, especially multi-trigger
moments. Fewer requests, one server transaction, one broadcast event, and the
B5 self-conflicts disappear for that burst.
**How:** In the trigger-fire path, collect the per-placement patches produced
synchronously for one event (ready marks, `pendingHeroResourcePrompts`) into a
single `submitPlacementOps` call with one action per placement. Merge
arrays client-side before sending. Send one combined chat message per ability
resolution ("Indigo takes 8 fire. READY: Feedback Loop (Indigo), Resist the
Unnatural (Indigo), My Life for Yours (Cal), Night Watch (Sharon)").
**Risk:** Low. Same command type and server validation, just fewer and larger batches.

### P2 — Return only the conflicting entity on 409, not the whole world

**Why:** `rollbackConflict()` returns `snapshot` = the entire projected
world (4.0 MB for the GM in the sandbox, with 11 scenes). The client then
calls `store.replaceSnapshot(...)` and reconciles the whole board, which is
a full re-render, just to retry one token patch.
**What it affects:** Every conflict (B5 makes them common): bandwidth, PHP
JSON encoding time, and visible stutter on the board.
**How:** For `placement.batch` / `token.move` conflicts, return
`{error, revision, entities: {sceneId: {placementId: currentPlacement}}}`.
Have `submitPlacementOps` merge those entities into the confirmed store
(the same `upsert` path events use) and retry. Keep the full-snapshot
response as a fallback when the entity is missing (deleted scene, etc.).
**Risk:** Low–medium; touches conflict handling, so add tests for
add/remove/patch conflicts. Revisions and authority are unchanged.

### P3 — Slow the 500 ms recovery poll while Pusher is healthy

**Why:** `createRecoveryPolling` polls every 500 ms even when Pusher is
connected and delivering events. Chat already does the right thing (30 s
safety-net poll while Pusher is up, 1.5 s on drop) in `js/chat-panel.js`.
**What it affects:** About 120 of a client's 140 idle requests per minute in
production. With 5 people that's ~600 PHP requests/minute just to ask "anything
new?". The Sep 29 audit's Cloudflare "host failing" outages are consistent
with shared-hosting process limits being hit by this kind of steady load
(not proven).
**How:** Expose `onStateChange` from `createPusherEventTransport`
(connected/subscribed vs. unavailable/failed/disconnected) and let
`createRecoveryPolling` take a `getInterval()`: **2000 ms** while subscribed,
**500 ms** otherwise, and an immediate recovery on reconnect (same as chat).
2 s stays inside the 5 s presence cutoff used by requested tests. Missed
Pusher events still recover, at most 2 s later.
**Risk:** Low. No change to commands, revisions, or replay; only timing.

### P4 — Release the PHP session lock immediately in VTT endpoints

**Why:** `ensureVttSession()` calls `session_start()` and the session stays
open (locked) for the whole request. PHP's default file sessions lock per
browser, so one player's `sync.php` poll, command POSTs, chat, and sheet saves
run **one at a time**. In the attack above the six command POSTs completed at
268 → 625 → 848 → 1081 → 1261 → 1474 ms. No VTT, chat, or sheet endpoint
writes to `$_SESSION` (only the login page does).
**What it affects:** Command latency for every player action, and polls
waiting behind slow saves.
**How:** In `bootstrap.php` `ensureVttSession()`, use
`session_start(['read_and_close' => true])` when the session is already
established (or call `session_write_close()` right after
`getVttUserContext()` reads it). Do the same in `chat_handler.php` and
`character_sheet/handler.php` after their auth checks. Keep the normal
writable session on the login page.
**Risk:** Low for correctness. **Do it after P1**, because it lets one browser's
bursts reach the server in parallel, which today would cause more B5 conflicts.

### P5 — Throttle presence writes

**Why:** Every `sync.php` poll runs `touchPresence()`, an
`INSERT … ON CONFLICT DO UPDATE` on SQLite: a write lock 2× per second per
client that competes with real commands.
**How:** Skip the write when `last_seen` is under ~1500 ms old (read first,
or keep a per-request static). The 5 s online cutoff is unaffected.
**Risk:** Very low.

### P6 — Don't download the world twice at startup; load inactive scenes lazily

**Why:** The page HTML embeds the projected world (2.8 MB player / 6.85 MB GM),
and `snapshot.php` immediately sends it again (3.3 / 4.0 MB). The bathhouse
and silverquill gothic scenes alone carry ~3.1 MB of environment and map-level
geometry, but only the active scene is drawn.
**How (two steps):** (a) Stop embedding board state in the HTML and render from
the `snapshot.php` response the runtime already waits for (show the existing
"connecting" state meanwhile). (b) Later: a scoped snapshot that returns full
geometry only for the active/player scene plus a catalog for the rest, fetched
on scene switch. The Sep 29 audit notes (b) needs a scoped snapshot contract;
(a) does not.
**Risk:** (a) low–medium (startup ordering); (b) medium (needs replay rules for
scenes a client hasn't loaded).

### P7 — Thumbnail token art

**Why:** Token PNGs are 256–512 px and up to 527 KB, drawn at ~36–70 px.
Seven tokens = 2 MB for one player load.
**How:** When a token image is uploaded (or by a one-time maintenance script
over `storage/tokens/`), write a 128 px WebP next to it and reference the
thumbnail on the board and in the library; keep the original for zoomed
views. Never overwrite the original file.
**Risk:** Very low; display-only.

### P8 — Bundle and minify the 155 JS modules for deployment

**Why:** 155 separate requests on a cold load (2.5 MB unminified, ~0.6 MB gzipped);
each 4-hour cache expiry triggers 155 revalidations.
**How:** A build step (esbuild, no runtime dependency) producing one bundle
with a content hash in the filename and `Cache-Control: immutable`. Keep the
source modules for development and tests.
**Risk:** Low for runtime, but it adds a build step to the cPanel deploy.
**Recommendation after Q4: skip for now** (plain-language explanation in section 7).

### P9 — Keep monster changes under the 8 KB live-delivery limit

**Why:** Accepted `placement.batch` events carry the **whole** placement
(`kind: "upsert"`). `SyncV2PusherTransport::boundedEvent()` replaces any event
over 8,000 bytes with a `sync.recoveryRequired` notice, so each receiving
client makes an extra authenticated HTTP fetch. In the live world, **39 of
87 placements are over 8 KB** (Werewolf 46 KB, Orla Brindle 43 KB, each
Radenwight Grand Meddle 42 KB), partly because the stat block is stored twice
(`placement.monster` **and** `placement.metadata.monster`).
**What it affects:** Every hit, condition, or move on a real monster reaches
the GM through an extra HTTP round trip instead of directly through Pusher.
Player events are small because the stat block is stripped for them.
**How (lowest risk first):** (1) Stop writing `metadata.monster` for new
drops. Most readers check `placement.monster` first, but first audit the ones
that read the metadata copy directly: `normalize/placements.js:111` and
`:620`, `normalize/monsters.js:372/421`, `token-system/speed-resolver.js:83`,
`token-library.js:1497`, and the team fallback in `SyncV2Store.php:3129`.
(2) For patch-only
commands (hp, conditions, flags, position), emit
`{kind: "patch", placementId, fields}` events with only the changed fields;
the reducer applies them to the confirmed placement. Keep `upsert` for
add/replace. Replay and snapshots are unchanged.
**Risk:** (1) very low; (2) medium (reducer change; test replay after reload).

(Checked and **not** recommended: trigger re-registration on state changes
looked repetitive in the logs, but sheets are cached in
`characterSummaryCache`, so it costs no requests.)

## 3. Player ability test results

### Sharon (Shadow 4, Whirlwind kit)

| Ability | Result | Notes |
|---|---|---|
| I Work Better Alone (melee, no ally adjacent) | PASS | 6+A3+kit 1 = 10; +1 surge saved to sheet |
| I Work Better Alone (ranged, tier 3) | PASS | 9+3 = 12, kit correctly not applied to ranged |
| Get In Get Out | **FAIL** | Damage and cost OK (5+3+1 = 9; 3 Insight, edge refund 1). The second shift collided with Indigo: Sharon and Indigo each took 6 damage. See B2 |
| Extension of My Arm | **DATA + SYSTEM** | Damage 6+3+1 = 10 matches the JSON, but the JSON's base damage is 1 too low (book: 4/7/10). "Vertical pull" ran as a horizontal pull. See D-S1, B4 |
| Pinning Shot | PASS* | 12+3 = 15, restrained applied. *The potency check read the dummy's Agility as 0 (it is 1). See B1 |
| Shadowstrike | PASS (manual) | 5 Insight spent; chat note only |
| Black Ash Teleport | PASS | Spent 2 Insight, teleported 7, hide surge, Burning Ash 3 fire (raw) |
| Careful Observation | PASS* | +1 surge, hidden edge rider stored. *The edge applies to Sharon's next strike against **anyone**, not only the assessed creature. See S1 |
| Free Strike (Ranged/Melee) | PASS | 7+3 = 10; melee adds kit |
| Free Strike + 1 surge | **FAIL (rule)** | Surge added +2; the book is +highest characteristic (+3). See B18 |
| In All This Confusion (after monster fire bolt) | **FAIL (sync)** | Armed correctly; halving chat said "refunded 3 (30/36)" but the write was lost (409), still 27/36. Teleport and Too Slow decline worked. See B5 |
| Night Watch | PASS* | Resolved after a monster hit Indigo for 8: Indigo refunded 4 (24 → 28), saved on the server. *Also arms on self-inflicted strain damage, and has no range filter (B9 / D-S3) |
| Hesitation Is Weakness | PASS | Armed when Cal ended his turn; resolving made Sharon the active combatant and spent 1 Insight |

### Indigo (Talent 2, Force Augmentation +1 psionic damage)

| Ability | Result | Notes |
|---|---|---|
| Mind Spike | PASS | 4+3+1 = 8 psychic |
| Mind Spike (strained, Clarity -2) | PASS* | 8 + 2 to target, 2 raw to Indigo. *Her own irreducible damage armed her Resist the Unnatural and Feedback Loop, and Sharon's Night Watch. See B9 |
| Materialize | PASS | 8+3+1 = 12 |
| Materialize (strained) | PASS | Target 7; Cal (adjacent) takes Reason 3; Indigo 3 raw |
| Incinerate | PASS | 3-cube: dummy 5 fire, ally Cal in the area excluded, zone saved to server; entering the zone dealt 2 fire once per round, ally entering took none |
| Smolder (fire, vs Fire Dummy) | **FAIL (B1)** | 13 fire dealt, fire immunity 5 ignored on a player client. The weakness correctly used the chosen type (fire 7) |
| Synaptic Override | PASS (manual) | 5 Clarity, GM text. Chat says "→ Token" (B13) |
| Reflector Field | PASS (visual) | 7 Clarity, 3-square aura drawn; reflection is manual |
| Flashback | PASS (manual) | 5 Clarity, chat note |
| Free Strike (ranged) | PASS | 2 + A1 = 3 |
| Resist the Unnatural (after monster fire bolt) | **FAIL (sync)** | Ready mark lost to 409 (B5); click then did nothing and spent her triggered action (B11) |
| Feedback Loop (Cal hit for 11 fire) | PASS | Dummy took floor(11/2) = 5 psychic |
| Mind Spike opportunity attack | PASS | Built-in opportunity-attack ready mark appeared when the dummy left her reach; 2+3+1 = 6 |

### Zepha (Elementalist 3, Acolyte of Fire)

| Ability | Result | Notes |
|---|---|---|
| Hurl Element (fire vs Fire Dummy) | **FAIL (B1)** | 4+3+1 = 8; fire immunity 5 ignored |
| Hurl Element (cold vs Fire Dummy) | **FAIL (B1)** | 7; cold weakness 3 ignored |
| Bifurcated Incineration (2 targets) | PASS* | 6+1 = 7 to each; *immunity ignored on the Fire Dummy (B1) |
| Unquiet Ground | PASS (manual terrain) | 2 damage; zone saved with a "difficult terrain" note only. See S6 |
| The Flesh, a Crucible | PASS* | 3 Essence; 8+3+1 = 12 fire. *"Persistent 1" not automated (S3) |
| Conflagration | PASS | 5 Essence; 10+1 = 11; Cal in the area excluded |
| Maw of Earth | PASS (manual terrain) | 7 Essence; 9 damage; "ground drops 3" is a note (S6) |
| O Flower Aid, O Earth Defend | PASS* | 5 Essence; zone saved. Recovery spending is manual (S7) |
| Ward of Surprising Reactivity | PASS* | Armed when an adjacent monster hit her; push picker offered 6 squares (dummy's Stability 2 ignored, B1) |
| Explosive Assistance | PASS* | Armed after Sharon's pull; adds a new slide rather than extending the original movement (S8) |

### Cal (Censor 4, Shining Armor kit +2 melee weapon)

| Ability | Result | Notes |
|---|---|---|
| Thorn In Foot | PASS / **FAIL** | 7+3 = 10 psychic. The "each time the target moves" rider never fires when the GM moves the monster (B15) |
| Protective Attack | PASS* | 6+3+2 = 11; taunted applied but **never expires** (B14) |
| Morelia Punish and Defend | PASS | 3 Wrath; 8+3+2 = 13 holy; Cal's own recovery healed him to 72/72, recoveries 12 → 11 |
| Purifying Fire (melee) | PASS | 5 Wrath; 12+3+2 = 17 holy; fire weakness 7 applied |
| Judgment | PASS* | Mark stored (name saved as "Token", B13). Paragon vertical pull ran as a horizontal pull (B4) |
| Blessing of the Faithful | PASS | 5 Wrath; at the end of Cal's turn all four heroes within 3 gained 1 surge; aura removed at combat end |
| Edict of Purifying Pacifism | PASS | 7 Wrath; monster using a strike in the aura took 6 holy |
| Melee / Ranged Free Strike | PASS | 7 / 7 |
| Turn start (+2 Wrath prompt) | PASS | Prompt "Gain 2 Wrath: 10 → 12" appears on Cal's screen |
| My Life for Yours | **PARTIAL** | Arms only when an **ally** is damaged; Cal-damaged and turn-start cards never arm (B6). Self-heal worked |
| Resist the Unnatural | PASS (arming) | Armed on typed damage, not on untyped |
| Judgment - Main Action Rebuke | **FAIL** | Never arms vs monsters (B16) |
| Judgment - Wrath: Bane Power Roll | ARMS | Arms; the bane itself is a note (S9) |
| Judgment - Wrath: Melee Damage Taunt | PASS | Armed after a melee hit on the judged target; taunted applied, 1 Wrath spent |
| Judgment - New Target | **FAIL (arming)** | Never arms when a judged creature drops to 0 from ability damage (B21); clicking it manually re-judges correctly and ends the old mark |
| Resist the Unnatural (resolve) | **FAIL (sync)** | Chat "takes 5 of 11 (refunded 6; 46/72)"; server kept 40/72 (B5, third reproduction) |

### Combat flow and shared systems

| Check | Result |
|---|---|
| Start Combat sets each hero's resource to Victories; End Combat resets resource and surges to 0, removes combat auras | PASS |
| Save-ends dialog at the end of the bearer's turn (d10, 6+) | PASS |
| EoT conditions from abilities expire at the bearer's turn end | **FAIL** (B14) |
| Flanking/adjacent-enemy edge and bane suggestions (flank edge seen on Get In Get Out; ranged-while-adjacent bane on monster rolls) | PASS |
| Shadow "edge costs 1 less" refund | PASS |
| Heroic-resource prompts (Indigo +2 on forced movement, Zepha Font of Essence, Cal turn start) | PASS |
| Monster "each enemy" area attack | **FAIL** (B7) |
| Forced movement vs larger creature | **FAIL** (B8) |
| Persistent zone: start-of-turn damage to an occupant, expiry at the owner's next turn start, entry once per round, allies ignored | PASS (chat labels an occupant's turn-start hit as "(Indigo's turn)") |
| Talent negative Clarity: end-of-turn "take 1 per negative point" prompt (−2 → 2 damage, sheet updated) | PASS |
| Talent turn-start 1d3 Clarity prompt | PASS |
| Monster triggered action set off by a player's attack | **FAIL** (B20) |
| Monster "requested test" (Presence test routed to Sharon's screen; GM waits) | PASS: window reached Sharon in 0.8 s; tier 1 applied 3 psychic + frightened (save ends) to token and sheet |
| Cross-player heal (Cal's My Life for Yours on Sharon after a monster hit) | PASS: Sharon 25 → 36 (capped), +3 Blessing of Life, Cal's recoveries 12 → 11 on his own sheet |
| Two players hitting the same monster at the same moment | **FAIL**, one hit lost every time (B5b) |
| Two monster hits on the same hero at the same moment | **FAIL**, one hit lost (B5b) |
| Project test suite (`npm test`, isolated copy of HEAD) | 952 tests / 135 files pass. None covers the multi-client and player-projection bugs above |

## 4. Bugs found while testing abilities (system-level)

### B1 — CRITICAL — Player-run abilities can't see monster stats (potency, Stability, immunity, weakness) — CONFIRMED

**Why:** `sanitizePlacementForPlayerView()` in `dnd/vtt/bootstrap.php` removes
`monster` from every enemy placement sent to players and adds back only
`traits.speed`. But automation runs **in the browser of whoever clicks the
ability**, and the board code reads the monster block to resolve:
- potency (`getMonsterAutomationStats` → `monster.attributes`),
- forced-movement Stability and size (`getAutomationTraitsForPlacement`),
- damage immunity/weakness (`parseMonsterDefenseDamageAdjustment`).

In the sandbox, Sharon's Pinning Shot potency check received
`attributeValue: 0` for a monster with Agility 1. A player client receives
`traits: {"speed":5}` and nothing else for both dummies, while the GM client
gets the full block. Side-by-side proof, same ability and same target:

| Test | Run by GM | Run by the player |
|---|---|---|
| Zepha's Hurl Element (fire, tier 2) vs Fire Dummy (fire immunity 5) | **3** damage ("8 fire -5 immunity") | **8** damage |
| Sharon's Pinning Shot tier 1 (potency A weak = 1) vs Test Dummy (A1) | Dummy **resists** | Dummy **restrained** |

**What it affects:** Every PC ability used **by a player** against a monster:
- potency conditions land on monsters with high characteristics that should
  resist them (any monster characteristic is treated as 0);
- pushes, pulls, and slides ignore monster Stability;
- monster fire/cold/etc. immunity and weakness are ignored, so damage is wrong;
- the same ability gives different results when the GM clicks it.

**How to change it (low-risk, follows an existing pattern):** Add an
`attachSafeAutomationTraits()` next to `attachSafeMovementTrait()` in
`bootstrap.php`. It copies only the automation numbers onto `traits`:
`stability`, `size`, `might`, `agility`, `reason`, `intuition`, `presence`,
`immunities` and `weaknesses` (as `{type, value}` lists). Call it in
`sanitizePlacementForPlayerView()`. That one function already feeds the
player snapshot (`api/v2/_common.php:318`) and live placement events
(`:732`), so page load, recovery and Pusher updates all get it. On the client:
`getAutomationTraitsForPlacement` already reads `traits.stability/size/might/agility`;
add a `traits` fallback to `getMonsterAutomationStats()` and to
`parseMonsterDefenseDamageAdjustment()` in `board-interactions.js`. No
sync, revision, or command format changes are needed.
**Decided (Q1):** the browser may hold these numbers, but players must never
see them. When implementing, make sure no player-facing UI reads `traits`
for display: token settings, hover cards, the monster summary panel, chat
lines, and damage/potency messages (the existing enemy-HP privacy rule
already hides totals in chat; extend the same check to potency and
immunity wording).

### B20 — HIGH — Monster triggered actions never arm from player actions — CONFIRMED

**Why:** Monster reactions ("when this creature takes damage…") are detected
**in the browser that causes the event**. For player browsers, the client
helper `stripMonsterSnapshot()` (`state/normalize/monsters.js`) keeps a
`monsterTriggerHooks` list so players' attacks can arm enemy triggers, and
`ai-reference/hooks/monster-automation.md` documents that. But since Sync V2,
players get placements already sanitised by the **server**
(`sanitizePlacementForPlayerView()` in `bootstrap.php`), which drops `monster`
and never adds `monsterTriggerHooks`. No PHP file mentions the field.
In the sandbox, the Test Dummy got a "when damaged, deal 2 psychic to the
source" triggered action. Sharon hit it for 5: **no READY mark, no chat**.
The GM then fired it by hand, which printed "2 psychic damage (no target)"
(no event payload) and still spent the monster's triggered action.
**What it affects:** Every monster triggered action or passive trigger set off
by a player: on-damage retorts, death bursts, "when moved" reactions. They
only work when the GM's own browser causes the event.
**How to change it:** Port `extractMonsterTriggerHooks()` into the PHP
sanitizer (category, name, `resource_cost`, and only the `trigger` cards with
`match`). Put it in the same `sanitizePlacementForPlayerView()` change as
B1, which covers snapshots and events. The client already registers hooks from
`placement.monsterTriggerHooks` (`collectMonsterTriggerHooksForPlacement`).
_Privacy note:_ this exposes the trigger conditions (not the stat block) in
devtools, which is what the client-side design already intended.

### B2 — HIGH — Ability "shift" collides with creatures and deals slam damage to the shifter and an ally — CONFIRMED

**Why:** The `shift` effect is sent to the board as a forced **slide** of the
caster (`force-move` with `verb: "slide"`). Forced movement runs the collision
rules, so Sharon's second shift in Get In Get Out stopped after 1 square and
both she and Indigo took 6 collision damage. In Draw Steel, a shift is the
creature's own movement: it can't collide, can pass through allies, and just
can't end in an occupied square.

**What it affects:** Every ability using `{ "kind": "shift" }` (Get In Get Out
today; any future "shift X" ability), plus anything that reacts to
`forcedMovement` (Indigo's Mind Recovery, Zepha's Explosive Assistance could
arm on a shift).

**How to change it:** Give the shift path its own verb (`"shift"`) in
`requestAutomationForceMove` / `handleAutomationForceMoveRequest`. For that
verb: (1) build legal cells from a path search that may pass allied squares
but never ends on an occupied square, (2) never call the collision/slam
resolver, (3) commit with the token-move command using the existing **shift**
movement kind (the one Shift-drag uses), so movement history and zone entry
still apply and opportunity attacks are not provoked, and (4) do not fire
`forcedMovement`/`forcedMovementDealt` events. Keep the shared pool-distance
logic the runner already has.

### B3 — LOW (UX) — Teleport landing chooser appears on every combat teleport, even on flat ground

**Why:** `chooseTeleportHeight()` skips the dialog only out of combat. On a
flat map in combat, the dialog appears with one option ("Ground 1"), adding a
click and a 500 ms input lock to every teleport.
**What it affects:** Black Ash Teleport, In All This Confusion, and any teleport.
**How to change it (decided, Q2):** Skip the chooser whenever there's exactly
one legal landing surface, in or out of combat. Show it only when there's more
than one choice.

### B4 — MEDIUM — Vertical push/pull/slide run as horizontal movement — CONFIRMED

**Why:** `verticalPull` etc. go through the same horizontal destination picker.
Sharon's Extension of My Arm offered six ground cells next to her. Floors and
flight heights exist in the VTT, so a vertical option is possible.
**What it affects:** Extension of My Arm (Sharon's signature), Cal's Judgment
Paragon benefit (vertical pull up to 2×P), and any monster with vertical
forced movement.
**How to change it:** See system S5 (vertical forced movement).

### B5 — CRITICAL — Rapid writes to the same token are silently lost (409 conflicts) — CONFIRMED

**Why:** Each board change is sent as its own `placement.batch` command with
the token's `entityRevision`. When one ability makes several changes to the
same token back-to-back (clear the ready trigger, mark the triggered action
used, refund stamina, teleport), the requests race. The server correctly
rejects the stale ones with `409 entity_revision_mismatch`.
`submitPlacementOps()` in `sync-v2/token-movement-runtime.js` retries only
**once**, and only when the fields it is changing are untouched. In a burst,
that single retry conflicts again and the change is dropped. The ability keeps
going and chat still reports success.

Reproduced twice:
1. **Sharon, In All This Confusion:** chat said "Sharon takes 3 of 6
   (refunded 3 stamina; 30/36)". The `hp: 30` patch got 409 twice and was
   dropped. Server and sheet both stayed at **27/36**.
2. **One monster hit armed two of Indigo's triggers** (Feedback Loop + Resist
   the Unnatural). Both ready-marks went out in parallel, each overwriting the
   whole `readyTriggerAbilities` array. The second got 409 and could never
   pass the "same fields untouched" check, so only Feedback Loop was saved.
   When Indigo clicked Resist the Unnatural, it ran with no damage payload
   ("half-damage requested but no triggering damage event is in scope"), did
   nothing, and **still used her triggered action for the round**.

**What it affects:** Any multi-step ability touching one token quickly
(halve-damage reactions, heal after damage, teleport + damage, conditions +
damage), and any event that arms more than one trigger on the same token.
This is a likely cause of the "intermittent" ability problems in the
Sep 29 audit.

**How to change it (in order of risk, lowest first):**
1. **Per-token write queue on the client.** In `submitPlacementOps`, chain
   submissions per `placementId` (a `Map<placementId, Promise>`), so each
   patch waits for the previous one's acknowledgement and uses the new
   `_entityRevision`. One client then can't conflict with itself. Capture
   `before` when the queued op actually starts, not when it's enqueued.
   This only changes timing, not the command format or server rules.
2. **Bounded retry (e.g. 3) with the same safety check** for conflicts from
   other clients.
3. **Make set-like and numeric fields merge-safe on the server.** Add small
   commands such as `trigger.markReady {placementId, abilityId, payload}`
   (server unions into the arrays) and a stamina **delta**
   (`hp.adjust {delta}`) instead of absolute `hp.current` values. Deltas and
   unions commute, so concurrent writers can't erase each other.
4. **Never report success in chat until the write is acknowledged.** If a
   patch is finally rejected, post "⚠ change not saved" so the table knows.

### B5b — CRITICAL — Two players damaging the same creature at the same time: one hit is lost — CONFIRMED

**Why:** Damage is applied in the attacker's browser, which computes the new
total and sends an **absolute** value (`hp.current: "392"`). When two players
hit the same monster at about the same moment, both start from 400:
- **Equal damage** (Sharon 8, Zepha 8): the second write gets 409. Its retry
  check sees the server already holds "392", the value it wanted, so it
  counts as success. **4 of 4 rounds: both chats said "takes 8 damage", the
  dummy went 400 → 392.** One hit silently vanished.
- **Different damage** (Sharon 10, Zepha 8): the second write is rejected with
  "This token changed in the same fields. Review its current state before
  trying again." That message appears only in the browser console; the
  ability stops, the damage is lost, and that player gets no chat line.
  **2 of 2 rounds lost a hit.**

- **Heroes too:** two GM tabs hit Cal at once with the dummy's strike (5) and
  fire bolt (4 + fire weakness 5 = 9). Expected 51 → 37. Got **51 → 46** and
  **51 → 42**; token and sheet agreed with each other, but one hit was lost
  each time.

**What it affects:** Simultaneous player attacks, a GM attack landing while a
player heals the same hero, and any ability whose damage lands while an aura,
zone, or trigger also damages the same token.
**How to change it:** Make stamina changes commutative on the server.
Add a command (e.g. `placement.adjustStamina {placementId, delta, tempDelta,
operationId}`) whose server handler reads the **current** canonical value,
applies the delta (temp stamina first, existing rules), and writes the
result. Rejecting a stale `entityRevision` isn't needed for a delta, because
order doesn't matter. Have `applyDamageHealToPlacement` and the healing paths
send deltas. Do the same for the sheet stamina sync (send the delta plus the
operation ID it already has). The existing operation IDs keep retries
idempotent, so a resend can't apply damage twice.

### B6 — HIGH — Abilities with several trigger cards only listen for the last one — CONFIRMED

**Why:** `triggerRegister()` in `board-interactions.js` de-duplicates by
`abilityId` ("re-casting replaces instead of stacking"). The sheet
registration loop registers each trigger card of an ability with the same
`abilityId`, so each card replaces the previous one.
**What it affects:** Cal's **My Life for Yours** has 4 trigger cards (Cal
starts turn, ally starts turn, Cal takes damage, ally takes damage). Only
"ally takes damage" ever arms. In the sandbox, when the monster hit Cal,
Indigo's and Sharon's triggers lit up but Cal's did not. Any monster
ability with more than one trigger card has the same problem.
**How to change it:** Key the de-duplication on `abilityId + card index`
(or the card's `id`). When an ability is re-registered,
`triggerUnregisterAuthoredByToken` already clears that token's previous
entries first, so the "re-cast doesn't stack" protection still holds. The
ready mark should stay keyed by `abilityId`, so one click resolves the ability.

### B7 — CRITICAL (for GM monster automation) — Monster area abilities pick the wrong side — CONFIRMED

**Why:** `findAutomationAreaTargets()` calls
`doesAutomationTargetFilterMatch(placement, filter)` **without the caster**.
With no caster, `enemy` means "team === enemy" and `ally` means
"team === ally", regardless of who cast it.
**What it affects:** In the sandbox, the Test Dummy's "each enemy in a 3 cube"
burst placed over Indigo **damaged the Test Dummy itself** and skipped Indigo.
Every monster area ability that says "each enemy" hits monsters instead of
heroes. PC areas work only because PCs are on the "ally" team. A `self`
predicate in an area falls through to "everyone".
**How to change it:** Pass `pendingAutomationArea.targetConfig.sourcePlacement`
(the runner already sends it) into `findAutomationAreaTargets` and on to
`doesAutomationTargetFilterMatch(placement, filter, sourcePlacement)`, for
both the hover preview and the click. One-line plumbing change, no sync impact.

### B8 — HIGH — Forced movement against bigger creatures uses a non-book size penalty — CONFIRMED

**Why:** `handleAutomationForceMoveRequest` subtracts
`targetSizeRank - sourceSizeRank` from the distance (`sizePenalty`). Ranks
are 2 for 1M and 3+N for size N, so a 1M hero moving a size-2 creature loses
**3** squares, and a size-3 creature 4. The book ("Big Versus Little",
Combat ch.) says: smaller moving larger → **no change**; larger moving smaller
**with a melee weapon ability → +1**. In the sandbox, push 2 against the
size-2 Big Dummy (Stability 1) produced **0** legal squares; the book gives 1.
**What it affects:** Every push/pull/slide against large monsters (most solo
and leader monsters), and missing +1 when a large creature shoves a hero.
**How to change it:** Set `sizePenalty` to 0. Add `sizeBonus = 1` when
`sourceRank > targetRank` and the ability has both the Melee and Weapon
keywords (the payload already carries `keywords`). Keep
`ignoreSizePenalty` for compatibility.

### B9 — MEDIUM — "Can't be reduced in any way" and self-inflicted damage still arm reactions — CONFIRMED

**Why:** The damage event payload doesn't say the damage was `raw`
(irreducible), and trigger filters don't compare the source with the target.
When strained Mind Spike dealt Indigo 2 irreducible psychic damage to
herself, chat announced: Indigo **Resist the Unnatural** READY (halving
irreducible damage isn't allowed), Indigo **Feedback Loop** READY (she
"damaged an ally": herself), Sharon **Night Watch** READY (book: "from
another creature's ability"), and Cal **My Life for Yours** READY (that one
is legitimate).
**What it affects:** False "!" prompts every time a Talent strains, and the
risk of a player halving damage the book says can't be reduced.
**How to change it:** (1) Put `raw: true` and `selfInflicted: sourceId === targetId`
on the damage event payload. (2) Make `halveTriggeringDamage` refuse when
`raw`, and add trigger filter fields `excludeIrreducible` and `sourceWhose`
(`self|ally|enemy|notSelf|notTarget`). (3) Then update the JSON: Feedback Loop
`sourceWhose: "enemy"`, Night Watch `excludeSelfInflicted`, and both Resist
the Unnatural cards `excludeIrreducible`.

### B10 — MEDIUM — "End of encounter" and "until dying" conditions are stored as end-of-turn / save-ends — CONFIRMED

**Why:** `normalizeConditionDurationValue()` in `token-conditions.js` returns
only `save-ends` or `end-of-turn`. Anything containing "end", including
`end-of-encounter`, becomes `end-of-turn`; `until-dying` and
`instantaneous` become `save-ends`.
**What it affects:** Sharon's Careful Observation edge (authored
`endOfEncounter`) was saved as `end-of-turn`. Today it survives only because
B14 keeps every automation EoT condition forever. **Once B14 is fixed it would
vanish at the end of her turn**, so fix B10 together with B14. An
`untilDying` effect would become save-ends and get a d10 save every turn.
**How to change it:** Recognise `end-of-encounter` and `until-dying` (and
`instantaneous`) before the generic `includes('end')` test, and clear them
at combat end / when the bearer becomes dying. **Q3:** also add a real
"no end / until removed" duration (section 7, "Q3 follow-up").

### B11 — MEDIUM — Clicking a trigger that isn't ready still spends the triggered action — CONFIRMED

**Why:** Opening a Triggers-list ability without a captured payload runs it
in "manual resolution" mode. Effects that need the event
(`halveTriggeringDamage`, `amountFrom`) do nothing, but
`consumeTriggeredAction` still marks the triggered action used.
**What it affects:** Seen in T02 (Resist the Unnatural lost its ready mark
due to B5, then the click wasted the round's triggered action).
**How to change it:** If an ability's effects need a trigger payload and none
is present, either ask "This trigger isn't ready — use anyway?" or skip the
triggered-action spend when no payload-dependent effect actually resolved.

### B12 — LOW — Monster abilities post "would spend 1 resource — monster pools not tracked"

**Why:** The runner calls `spendResource(action)` for every ability, and the
monster version in `monster-ability-runner-glue.js` posts a chat line even
when the ability has no cost. **Affects:** chat noise on every monster
action plus one extra network request. **How:** return `{skipped:true}`
silently when the action has no cost.

### B13 — LOW — Target names show as "Token" in some chat lines and marks

**Why:** `handleAutomationTargetPointerDown` builds the picked target from
the hit-test record returned by `findRenderedPlacementAtPoint()`. Those
`renderedPlacements` entries only carry id/position/size, so `tokenLabel()`
falls back to "Token" and the snapshot's `hidden` flag is always false.
**Affects:** all users. "Note … → Token" (Synaptic Override), "Cal -
Judgment: Token is judged.", and the judgment mark saved with
`targetName: "Token"`. **How:** look up `getPlacementFromStore(hit.id)` and
pass that full record to `tokenLabel()` / `getAutomationPlacementSnapshot()`.

### B14 — HIGH — EoT conditions applied by abilities never expire — CONFIRMED

**Why:** End-of-turn cleanup (`partitionEndOfTurnConditions` in
`combat/combat-effects.js`) removes a condition only when
`duration.targetTokenId` equals the creature whose turn just ended. The manual
condition picker sets that field. The automation condition handler stores
`{type: "end-of-turn"}` **without** it.
In the sandbox, Cal's Protective Attack taunted the Test Dummy (EoT). The GM
then started and ended the dummy's turn. The save-ends prompt for its other
condition appeared correctly, but **taunted stayed on**.
**What it affects:** Every "(EoT)" result from automation: taunted, slowed,
weakened, Judgment's melee taunt, Purifying Fire, monster EoT riders. They pile
up and keep feeding wrong edge/bane suggestions (taunted, frightened) until
someone removes them by hand.
**How to change it:** In the automation condition path, when the duration is
`endOfTurn` and no `targetTokenId` is given, set
`duration.targetTokenId = <affected placement id>` (and its name). That matches
the book: "until the end of their next turn, or the end of their current turn
if imposed on their current turn". Optional data improvement: allow
`"endsOn": "source"` for the few effects that end on the caster's turn. **Q3
confirmed:** EoT = end of the affected creature's next turn.

### B15 — HIGH — "Watch this target" triggers created by an ability only exist in the caster's browser — CONFIRMED

**Why:** Trigger cards inside a main action (e.g. Cal's Thorn In Foot: "each
time the target willingly moves before the end of your next turn…") are
registered on the trigger bus **in the browser that ran the ability**.
Movement and damage events are detected **in the browser that performs
them**. Monsters are moved by the GM's browser, which never has Cal's
listener. In the sandbox, Cal cast Thorn In Foot (chat: "trigger
listening"), kept his page open, the GM moved the dummy 3 squares, and
nothing happened. Sheet-listed triggered actions don't have this problem:
every browser registers them from the character sheets.
**What it affects:** Thorn In Foot today; any "after you hit, watch that
creature" ability (marks, curses, "the next time the target…"). A page
reload on the caster's side also loses them.
**How to change it:** Persist runtime trigger registrations on the source
placement (e.g. `placement.runtimeTriggers[]` with `abilityId`, `match`,
`targetIds`, `expires`, `effects`). Every client then registers them, the same
way monster trigger hooks are already shared. They are written through the
same `placement.batch` path and expire with the existing lifetime helpers, so
no new sync channel is needed.

### B16 — MEDIUM — Censor's "judged creature uses a main action" never arms against monsters — CONFIRMED

**Why:** Monster abilities fire `actionUsed` with `actionKind: "action"` (the
monster category name). PC abilities use `"main"`. Cal's **Judgment - Main
Action Rebuke** filters `actionKind: "main"`, so it never arms when a judged
monster attacks. Seen in T10: the monster's Firebolt armed "Wrath: Bane Power
Roll" (powerRoll event, no kind filter) but not the rebuke.
**How to change it:** Normalise monster categories to the PC action kinds when
firing events: `action → main`, `maneuver → maneuver`, `triggered_action →
triggered`, and `villain_action → villain` (book: villain actions aren't
main actions).

### B21 — HIGH — "Reduced to 0 Stamina" triggers never fire from ability damage — CONFIRMED

**Why:** The automation damage handler (`handleAutomationDamageRequest`,
`board-interactions.js` ~line 16467) computes the "before" value from
`beforePlacement.currentStamina`, but placements store stamina in
`hp.current` (a string). `beforeStamina` is therefore always `null`, so the
`if (beforeStamina > 0 && afterStamina <= 0)` check never passes and
`staminaZero` is never fired. `staminaChange.before` is `null` too. The heal
path (~line 16638) has the same lookup. The manual Damage/Heal widget uses a
different, correct path (~line 2998).
In the sandbox, Cal judged a 3-Stamina Thief Ambusher and dropped it to −2
with a ranged free strike: **no READY**. Firing a synthetic `staminaZero` for
the same creature immediately armed **Judgment – New Target**, so the
trigger filter is fine and only the event is missing.
**What it affects:** Cal's **Judgment – New Target** (and Improved
Judgement's follow-up), any monster "when reduced to 0 Stamina / on death"
trigger (Soreesh's "Death or taking a tier 3 hit…" style traits), and any
future "when winded" rule built the same way.
**How to change it:** Read the before-value the same way
`getZeroDamageResult()` does: `parseHitPointNumber(ensurePlacementHitPoints(beforePlacement.hp).current)`,
in both the damage and heal handlers. One-line change per handler; no sync
impact.

### B22 — MEDIUM (latent) — PCs are never "winded" for `whenWinded` / `branch: winded` — CONFIRMED

**Why:** `isActorWinded()` in `runner.js` uses `context.isWinded()` when the
host provides it. The monster glue does; the character panel
(`startAbilityAutomation`) does not. The fallbacks look for
`hero.currentStamina`/`maxStamina`, `hero.hp`/`maxHp`, or numeric
`sourceToken.hp`, but PC sheets store `hero.vitals.currentStamina` /
`staminaMax` and tokens store `hp` as `{current, max}` strings. A probe with
Cal at 5/72 Stamina returned "NOT WINDED".
**What it affects:** No current PC ability uses winded (checked all five
sheets), so nothing is broken at the table yet. Any future PC ability or
feature with a winded clause (common for Fury and Tactician) would silently
never trigger.
**How to change it:** Pass `isWinded: () => cur <= Math.floor(max / 2)` from
`startAbilityAutomation` using the live token `hp` (falling back to
`sheet.hero.vitals`), and add `hero.vitals.*` and `sourceToken.hp.current/max`
to the runner's fallback list.

### B18 — MEDIUM — Surges add +2 damage instead of your highest characteristic — CONFIRMED

**Why:** `runner.js` computes surge damage as `spent * 2` (the button reads
"Surge +2"). The book (Classes, "Surges"): "Each surge you spend deals extra
damage equal to your highest characteristic score", up to 3 surges, to one
target. The book's second use, "spend 2 surges to increase a potency by 1
for one target", isn't offered.
**What it affects:** All four PCs have a highest characteristic of 3, so every
surge is 1 damage short. In the sandbox, Sharon's surge added +2 ("6 +2 surge = 8").
**How to change it:** Use `getStrongestAttribute()` (already passed to the
runner) for the per-surge value, update the button/tooltip text, and keep
the 3-surge cap. Add a "+1 potency (2 surges)" toggle next to the surge
button when the ability has a potency, applied to one chosen target.

### B17 — LOW — Chat verbs read "is slideed", "is verticalPulled"

`Test Dummy is slideed 0 squares`, `is verticalPulled 1 square`. Use a verb
label map (`slid`, `pulled`, `vertically pulled`) in the forced-movement chat
line.

## 5. Ability JSON data fixes

These are edits to the saved sheets/automation JSON (no code). Several only
make sense after the matching B-fix, as noted.

### Sharon

- **D-S1 (Sharon, Extension of My Arm):** tier damage is `3/6/9`; the book
  (Whirlwind kit signature) is `4/7/10 + M or A`. Change the three `amount`
  values to 4, 7, 10. Vertical pull 1/2/3 is correct.
- **D-S2 (Sharon, I Work Better Alone):** the yes/no prompt reads "Does
  **Sharon** have any of your allies adjacent…" because the `ifPrompt` sits in
  an `effect` card targeting `self`, so `{target}` becomes Sharon. Set the
  card's `target` to `"target"`, or (better) use system S2 so no prompt is needed.
- **D-S3 (Sharon, Night Watch):** the filter has no range. Add
  `"withinSquares": 5` (already supported), and after B9 add
  `"excludeSelfInflicted": true`.
- **D-S4 (Sharon, Careful Observation):** works only once B10 stops
  `endOfEncounter` collapsing to end-of-turn. Narrowing the edge to the
  assessed creature needs S1.

### Indigo

- ~~**D-I1**~~ **Withdrawn (Q8: Indigo is level 4, so +2 is correct).** Original note: **(Clarity rule "Mind Recovery"):** the forced-movement rule gains
  **2** Clarity. That's the 4th-level Mind Recovery upgrade; at level 2 the
  Talent base rule is **1** ("the first time each combat round that a creature
  is force moved, you gain 1 clarity"). Change `amount` to 1 until level 4
- **D-I2 (Feedback Loop):** (a) the second card asks the player to pick the
  enemy manually. The damage payload already carries `sourceId`, so set the
  damage effect's `target` to `"eventSource"` and drop the manual target card
  (Cal's Main Action Rebuke already uses `eventActor` this way). (b) After B9,
  add `"sourceWhose": "enemy"` so her own or an ally's damage can't arm it.
- **D-I3 (Resist the Unnatural; same for Cal):** after B9, add
  `"excludeIrreducible": true`.
- **D-I4 (Entropy Ward, Can't Take Hold, Perseverance):** not automated;
  need S10/S11.

### Zepha

- ~~**D-Z1**~~ **Withdrawn (Q8: Zepha is level 4, so +2 is correct).** Original note: **(Essence rule "Font of Essence"):** the rule gains **2** Essence;
  Font of Essence is the 4th-level upgrade. At level 3 the base rule is **1**
- **D-Z2 (sheet immunity):** Disciple of Fire is "fire immunity equal to 5
  plus your level" = **9** at level 4; the sheet says `Fire 7` (see D-ALL).
- **D-Z3 (Ward of Surprising Reactivity):** replace the manual "pick the
  attacker" card with `target: "eventSource"` on the push effect.
- **D-Z4 (Push maneuver):** not automated, but it can be today with existing
  pieces: target `creature` melee 1, power roll Might, tiers push 1/2/3. Same
  for Charge's free strike (reuse Hurl Element as the ranged free strike).
- **D-Z5 (blank characteristics):** Might and Agility are `""` on the sheet.
  They currently resolve to 0, which is fine if correct, but free strikes and
  potency against Zepha read them, so fill in the real numbers.

### Cal

- **D-C1 (Judgment + Improved Judgement):** the sheet's Improved Judgement
  ("spend 1 wrath, if the target has P < 2 they are frightened of you (save
  ends)") isn't in Judgment's JSON. Existing pieces cover it: a `spend` rider
  (1 Wrath) wrapping a `potency` (`attribute: "Presence"`, `level: "average"`) with
  `onFail: frightened, saveEnds` (the source is set automatically). The
  "already frightened → 2×P holy instead" part needs S2 (`targetHasCondition`).
- **D-C2 (Judgment - Main Action Rebuke):** uses `lineOfEffectTo`, which the
  trigger predicate doesn't know (it's ignored). Harmless, but don't rely on it.
- **D-C3 (My Life for Yours):** keep the four trigger cards; they start working
  once B6 is fixed. The "ally other than Cal?" prompt can go away with S10
  (`healBonus`), and the Wrath rider ("end one save-ends/EoT effect or stand
  up") with S12.

### Frunk

Frunk has left the game (Q6). Removal list: R-FRUNK in section 7.

## 6. Automation systems to add

These are general building blocks. Each lists the current PC abilities and
features it would let you automate (from the sheets plus the Heroes v1.01b
class text in `dnd/ai-reference/source/rules-v1.01b/classes/`). Ordered by
value to the current party.

### S1 — Roll modifiers on the target, and modifiers aimed at one creature

**Why:** `getPowerRollSuggestions` reads `hiddenEffect` roll riders only from
the **actor** (`hiddenEffectSuggestions(actor)`). Draw Steel is full of "ability
rolls made **against** this creature have an edge/bane", and of edges that
apply only against one creature.
**Unlocks:** Zepha/everyone **Defend** (double bane on rolls against you until
your next turn); Indigo **Remote Assistance** (an ally's next roll against the
target gains an edge); Sharon **Careful Observation** (edge only vs the assessed
creature); censor options like Behold a Shield of Faith; many monster abilities.
**How:** Add two optional rider fields: `appliesTo.direction: "incoming"`
(rider lives on the target and affects rolls made against it, filtered by
`attackerWhose: ally|enemy|any` relative to the rider's source) and
`appliesTo.targetIds` (outgoing rider only counts when the roll targets those
placements). In `getPowerRollSuggestions`, also scan each target's conditions
for incoming riders. Reuse the existing `consume: "nextMatchingRoll"` and
`consumeRollRiders` path. No sync changes; riders are already stored and
synced as conditions.

### S2 — Board-state conditions for branches and trigger filters

**Why:** Many "if…" clauses ask about the board, which the VTT already knows,
but authors must use `ifPrompt` today.
**Unlocks:** Sharon **I Work Better Alone** ("if the target has none of your
allies adjacent, gain 1 surge"); Cal **Improved Judgement** ("if already
frightened of you, take 2×P holy instead"); **Blessing of Life** ("ally other
than you"); Night Watch ("while you are hidden"); Purifying Fire ("while the
target has fire weakness from this ability").
**How:** Add branch/`if` kinds next to the existing `distance` condition:
- `adjacentCount {of: "target", whose: "allyOfCaster"|"enemyOfCaster", min, max}`
  using the same `canReachFloor`/adjacency helper flanking uses;
- `hasCondition {target, name, sourceIs: "self"|"any"}`;
- `isSelf {target}`;
- `casterHasCondition {name}` as a trigger filter field.
Evaluated client-side from the store, so nothing new to sync.

### S3 — Maintained ("Persistent X") abilities

**Why:** The Elementalist's Persistent Magic: maintained abilities reduce
essence gained at the start of your turn by X, let you repeat the power roll
(or reuse the ability with a maneuver) at turn start, end at encounter end,
and drop if you take damage ≥ 5 × Reason in one turn. None of this exists.
The `persistent` card only covers area zones.
**Unlocks:** Zepha **The Flesh, a Crucible** (Persistent 1), **Conflagration**
(Persistent 2), and future elementalist abilities.
**How:** A `maintain` card `{ value: X, onTurnStart: { cards: [...] }, reuseTargets: true }`.
On use, store `{abilityId, value, targets, cards}` on the caster placement
(like `persistentZones`). At the caster's `turnStart`: subtract the summed X
from the essence turn-start rule (heroic-resource automation already runs
there), then prompt "Maintain The Flesh, a Crucible? Roll again vs Test Dummy" and
run the stored cards with the saved targets and no cost. Add a per-turn
damage counter for the 5 × Reason drop, and clear on `combatEnd`.

### S4 — Automatic target groups and real burst/aura/line areas

**Why:** Area targeting only draws cube/rectangle templates at the clicked
cell. `burst`, `aura` and `line` fall back to a cube, and "each creature
adjacent to the target" must be clicked one by one.
**Unlocks:** Indigo **Materialize** (strained: each creature adjacent to the
target), Cal **Your Allies Cannot Save You!** / **Back Blasphemer!** style
abilities, every "N burst" (centred on the caster, no click), and lines.
**How:** (1) A token target `mode: "auto"` with `select: { within: N, of:
"self"|"<group>", predicate, excludeGroups }` resolved from the store (show
the picked tokens and allow Done/Cancel, not individual clicks). (2) In
`getAutomationAreaDimensions` / `findAutomationAreaTargets`, centre `burst`
and `aura` on the caster's footprint (size + 2×radius) with no placement
click, and draw `line` as `length × width` from the caster in the chosen
direction. Pass the caster for team filtering (that's also the B7 fix).

### S5 — Vertical forced movement

**Why:** B4. The VTT already has floors, flight heights and a fall/landing
system, but vertical verbs use the flat picker.
**Unlocks:** Sharon **Extension of My Arm** (vertical pull 1–3), Cal's
**Judgment Paragon** benefit (vertical pull up to 2×P), Talent strained
"vertical push instead".
**How:** Reuse the teleport landing chooser: after picking the horizontal
destination for a `vertical*` verb, ask for a height offset (0..remaining
distance, straight line). Commit through the forced-movement command with
`flightHeight`. Let the existing fall review handle "left in midair → falls".

### S6 — Zone terrain effects

**Why:** Unquiet Ground, O Flower Aid and Maw of Earth save zones whose only
effect is a note. The map already has terrain/height patches
(`environment.terrainPatched`) and movement validation.
**Unlocks:** Zepha **Unquiet Ground** / **O Flower Aid** (difficult terrain for
enemies), **Maw of Earth** (ground drops 3 → creatures fall), Frunk
**Inescapable Wrath** (ignore difficult terrain), Indigo **Can't Take Hold**
(ignore magic difficult terrain).
**How:** Zone field `terrain: { difficultFor: "enemy"|"all", sinkBy: 3 }`. Have
movement cost read active zones (doubling cost for the affected team), with a
passive `ignoresDifficultTerrain {source: "any"|"magicOrPsionic"}`. `sinkBy`
writes a temporary terrain patch cleared when the zone ends, and runs the
normal fall check for occupants.

### S7 — Zone/aura offers to other players at turn boundaries

**Why:** "At the start of your turn, you and each ally in the area may spend
any number of Recoveries" needs a prompt on **each ally's** screen. The
heroic-resource prompt routing (`routeHeroicResourcePromptToOwner`) already
delivers per-user prompts.
**Unlocks:** Zepha **O Flower Aid, O Earth Defend**; later, conduit-style "each
ally in the area can spend a Recovery".
**How:** New zone/aura effect `offerRecoveries { max: "any"|N }` that writes
one routed prompt per ally inside (same record shape as heroic-resource
prompts). The prompt calls the existing recovery heal path for that sheet.

### S8 — Hooks on pending forced movement

**Why:** Several rules change a push/pull/slide **before** it resolves.
**Unlocks:** Zepha **Explosive Assistance** (+R, or +2R for 1 Essence, to the
triggering forced movement; today it's a second slide), Indigo **Can't Take
Hold** (−1 vs magic/psionic), Frunk **Primordial Cunning** (push→slide), size
"Big Versus Little" +1 (B8).
**How:** In `handleAutomationForceMoveRequest`, before
`startAutomationMoveSelection`: (a) collect target passives
`forcedMovementResistance {amount, keywordsAny}`; (b) source passives
`forcedMovementVerbOption {from: "push", to: "slide"}`; (c) ally offers.
(a) and (b) are local and easy. (c) **Decided (Q5): reactions from another player are handled at the
table.** Zepha says she's using Explosive Assistance, and the mover simply
picks a farther square, since the picker already allows choosing a
destination past the highlighted range. Only (a) and (b) need code.

### S9 — Reacting to a roll before it's accepted

**Why:** The README lists this as a known gap ("roll-changing reactions still
need player/GM resolution"). Cal's **Wrath: Bane Power Roll** and **Wrath:
Reduce Potency** are chat notes.
**Decided (Q5): handled at the table.** Cal says "bane", and whoever is
rolling clicks the roll window's existing **Bane +** button; Cal spends
1 Wrath on his sheet. No new code is needed. If you later want a shortcut, a
one-click "Judgment bane (Cal, 1 Wrath)" chip that does both is the small
version of this. The potency −1 option is likewise a table call.

### S10 — Data-driven passives (beyond Stand Firm)

**Why:** `automation.passives[]` supports only `standFirm`. Many always-on
features are simple numbers.
**Unlocks (current party):**
- Cal **Blessing of Life**: `healBonus {amount: "P", whoseRecipient: "ally", within: 10}`, applied in the heal handler;
- Cal **Lead by Example**: `flankingProvider {adjacentTo: "self"}`, so allies get the flanking edge against creatures adjacent to Cal;
- Zepha **Disciple of Fire**: modifier `apply.ignoreImmunity: "all"` for fire damage, and immunity "5 + level" computed instead of typed;
- Indigo **Can't Take Hold**: `forcedMovementResistance {amount: 1, keywordsAny: ["Magic","Psionic"]}`;
- Indigo **Entropy Ward**: `onDamagedBy {effects: [condition {speedDelta: -2, noTriggeredActions: true, duration: endOfTurn, target: source}]}` (needs S11);
- Zepha **Ward of Delightful Consequences** (if chosen): first damage each round → `surgeGain 1`;
- Disciple of Fire "gain surges equal to Victories at combat start": let heroic-resource rules target `surges` as well as the resource.
**How:** A `collectPassives(placementId, kind)` helper next to
`resolveStandFirmForPlacement` (it already reads sheet features and monster
passives), called from the heal, forced-movement, power-roll-suggestion and
damage paths.

### S11 — Conditions that change numbers, plus winded/dying events

**Why:** Conditions are names plus durations; the only numeric riders are
weakness and immunity.
**Unlocks:** Cal **Judgment – Wrath: Stop Shift** ("speed becomes 0 until the end
of the current turn"), Indigo **Entropy Ward**, **Perseverance** (slowed speed 3,
not 2), Talent strained riders ("can't use triggered actions", "speed halved"),
Fury Ferocity on first winded.
**How:** Condition fields `speedDelta`, `speedSet`, `noTriggeredActions`,
`noShift`, read by the movement validator and the trigger-arming gate (an
armed trigger is skipped when the caster has `noTriggeredActions`). Add
`winded` and `dying` trigger events, fired when stamina crosses those lines
(winded is already computed for `whenWinded`, and `staminaZero` already
fires at 0, so this is the same comparison at a different threshold).

### S12 — Remove a condition / let the target save

**Why:** No effect kind removes a condition. My Life for Yours's Wrath rider,
the **Heal** main action ("make a saving throw against one effect"), and
"a prone target can stand up" are notes today.
**How:** Effect `removeCondition { target, choose: true, durations:
["saveEnds","endOfTurn"], names: ["prone"] }`. It opens a small picker of the
target's matching conditions and removes the chosen one through the normal
condition update. Plus `savingThrow { target }`, which opens the existing
save-ends dialog for one chosen condition.

### S13 — "Use another ability" (cascade)

**Why:** `cascade` is a chat reminder.
**Unlocks:** Sharon **Shadowstrike** (use a strike signature twice), Indigo
**Flashback** (an ally reuses an ability used this round, free), censor
**With My Blessing**, Indigo **Synaptic Override** (the target uses its
signature ability).
**How:** `useAbility { who: "self"|"<group>", filter: {signature: true,
keywordsAny: ["Strike"]}, costOverride: 0, edge: 0|1|2, times: 2 }`. For self
it opens the actor's ability picker filtered by the rule and runs the runner
again with `costOverride`. For another PC, route a prompt ("Indigo grants you
Flashback: pick an ability used this round") the same way requested tests are
routed. For monsters (Synaptic Override) open that monster's tray on the GM
screen with the filter.

### S14 — Teleport events (where you left, where you landed)

**Why:** Sharon's **Burning Ash** ("the first time on a turn you teleport away
from or into a space adjacent to an enemy, that enemy takes fire damage equal
to your Agility") is a manual pick today, and in testing it let her pick an
enemy that wasn't adjacent to either square.
**How:** Fire a `teleport` trigger event with `fromCells`/`toCells`. Add
filter fields `adjacentToOrigin`/`adjacentToDestination: "enemy"` and an
automatic target group "enemies adjacent to origin or destination", with
`usageLimit: { scope: "turn" }` (already supported).

### S15 — Cover bane (optional)

The suggestion engine already covers flanking, high ground, hidden,
unconscious, prone, restrained, taunted, grabbed, frightened and weakened.
The one common book rule it lacks is **cover** (Combat ch.): a target with
cover imposes a bane on damage-dealing abilities. Walls and line-of-effect
data from the Dungeon Alchemist import make this possible, but it's
geometry-heavy. Keep it a manual toggle unless it matters often.

## 7. Your decisions (answered Oct 2, 2026)

| # | Question | Your answer | What it changes |
|---|---|---|---|
| Q1 | Can monster numbers reach player browsers? | **Yes**, as long as players never **see** them. | B1/B20 fix approved as written: data travels to the browser in `traits` and `monsterTriggerHooks`, and nothing renders it for players (no tooltip, token setting, stat block, or chat line may print it). |
| Q2 | Combat teleport landing chooser | Show it **only when there's more than one choice**. | B3: skip the chooser whenever there's exactly one legal landing surface, in or out of combat. |
| Q3 | How conditions end | Three kinds: **end of the affected creature's next turn (EoT)**, **save ends**, and **no end**. | B14: EoT defaults to the affected creature. B10 is extended with a real "no end / until removed" duration (see below). |
| Q4 | Bundling the JavaScript (P8) | Not sure what it meant. | Explained below; recommendation is **skip it for now**. |
| Q5 | Reactions that belong to another player | **Handled at the table**: say it out loud and apply the effect. | S8/S9 drop the cross-player prompt idea. The roll window's existing manual **Edge/Bane +/−** buttons already cover Judgment's bane; Explosive Assistance stays a table call. |
| Q6 | Frunk | **Gone from the game; remove him completely.** | New item R-FRUNK below. |
| Q7 | Diagnostic sync log file | Not sure. | Explained below; recommended (tooling only, no game code). |
| Q8 | Level-gated resource gains | **Everyone is level 4.** | D-I1 and D-Z1 withdrawn: +2 is correct at level 4. The sync is working; the **live sheets themselves are out of date** (new item D-ALL). |

### Q3 follow-up: a "no end" duration (extends B10)

Today a condition can only be **Save Ends** or **End of Turn**: the token
settings picker offers just "SE" and "EOT", and `normalizeConditionDurationValue()`
turns anything else into one of those. A condition that should simply stay
until someone removes it is stored as save-ends, so the bearer gets a d10 save
prompt at the end of every turn, which is wrong.

**How:** add a third duration value `until-removed` (label "∞" or "Until
removed") to the picker, the normalizer (`token-conditions.js`), the end-of-turn
cleanup (never auto-removed) and the save-ends prompt (never offered). Let
ability JSON use `"duration": "untilRemoved"`. Keep `end-of-encounter` too, but
treat it as "until removed, then cleared when combat ends". This doesn't change
sync; conditions are already stored and synced as plain objects.

### Q4 explained: what "bundling" (P8) means

The VTT currently loads as **155 separate JavaScript files**. A "build step"
would be a small program you run on your computer before uploading, which glues
those files into **one** compressed file. Players' browsers then download one
file instead of 155, so the first load is faster. The cost: every time code
changes you'd run that program before uploading to cPanel, and if you forgot,
the site would keep running old code. Because production already compresses
files and caches them for 4 hours, the gain is modest. **Recommendation: skip
P8.** Do P1–P3, P5 and P7 first; they give more benefit with no change to how
you deploy.

### Q7 explained: the sync log file

When you double-click `Run Diagnostic Sync.cmd`, any error is printed only in
that black window. You mentioned it "always takes 2 tries". The first try on
Oct 1 ended without downloading anything, and its error message was lost when
the window closed. The suggestion: have the sync tool also **save what it
prints to a text file** in `gm screen test repository/runtime/logs/`, so if
the first try fails again, the reason is saved and can be fixed. This touches
only the test tool (`dnd/vtt/tools/sync-diagnostic.py` and the `.cmd`), not the
game. **Recommendation: yes**, it's low effort and makes the "2 tries" problem
solvable.

### D-ALL — HIGH — Live character sheets are out of date (from Q8)

**Why:** The sync is working. A dry run on Oct 2 reported 0 changed files, and
production's `character_sheets.json` was last saved **Sep 29, 9:03 pm**. That
saved file says:

| Character | Sheet says | Campaign vault (`_Party.md`) says |
|---|---|---|
| Indigo | **level 2**, 45 XP, **9 Victories** | level 4, 56 XP, 0 Victories |
| Zepha | **level 3**, 48 XP, 0 Victories | level 4, 56 XP |
| Sharon, Cal | level 4, 56 XP, 0 Victories | level 4, 56 XP |

Some 3rd/4th-level features were added (Indigo's sheet lists Scan), but the
level, XP and Victories fields weren't updated.

**What it affects at the table:**
- **Indigo starts every combat with 9 Clarity instead of 0**: the combat-start
  rule sets Clarity to Victories (seen in testing: 9).
- Anything computed from level: Zepha's Disciple of Fire immunity should be
  **9** at level 4 (5 + level), and the sheet says 7 (replaces D-Z2).
- 4th-level stat changes: check each sheet's characteristic increases,
  Stamina maximum and Recoveries against the level-4 rules (Talent and
  Elementalist both get a characteristic increase at 4th level).

**How to change it:** Update level, XP and Victories on Indigo's and Zepha's
sheets (a data edit, no code), then re-check characteristics, Stamina,
Recoveries and Zepha's fire immunity. Optional safety net: show the level and
Victories in the VTT character panel header so a stale sheet is obvious during
play.

### R-FRUNK — Remove Frunk completely (from Q6)

Already done in code: the sheet handler's character list
(`character_sheet/handler.php`: cal, sharon, indigo, zepha) and the VTT player
roster (`PLAYER_CHARACTER_USER_IDS`) don't include him, the live VTT world has
no Frunk token, and the token library has none.

| Where | What's there | Recommendation |
|---|---|---|
| `dnd/vtt/assets/js/ui/__tests__/automation-trigger-predicate.test.mjs` | Uses `'frunk'` as a sample token ID in 8 assertions | Rename to `'cal'` (test-only, no behaviour change) |
| `dnd/character_sheet/data/character_sheets.json` (live) | Full `frunk` sheet | Remove the `frunk` entry (back up first) |
| `dnd/character_sheet/data/hireling_images/frunk_hireling_*.png` (live) | Hireling image | Delete after removing the sheet |
| `dnd/data/characters.json` (live) | `frunk` dashboard character, portrait, project "Frunks new wardrobe" | Remove the `frunk` entry and his portrait file. **Also** Sharon's club lists `people: "frunk, sharon, indigo"`; drop "frunk" there |
| `dnd/schedule/data/schedules.json` (live) | `frunk` schedule and `_current_week.frunk` | Remove both. Indigo's and Zepha's schedule notes mention helping Frunk (history); leave them or edit by hand |
| `dnd/strixhaven/data/inventory.json` (live) | `frunk` inventory | Remove the key |
| `dnd/vtt/storage/board-state.json` (live) | 33 mentions, including tokens claimed by "frunk" | This is the pre–Sync V2 board file (no longer the live board). Remove the mentions or archive the whole file per the Sync V2 plan |
| `dnd/strixhaven/students/students.json`, `gm/data/gm-tabs.json`, `templates/data/templates.json` (live) | 131 / 5 / 6 story mentions ("[[Frunk]] sacrificed himself…") | **Campaign lore, not player data.** Removing these rewrites NPC history, so decide case by case; recommendation is to keep them |

These live files aren't in Git, so make the edits on the server (or in a
downloaded copy that's then uploaded) after a backup.

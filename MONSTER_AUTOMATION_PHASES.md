# Monster Automation — Phases 4–10 (autonomous build spec)

**This file exists to brief a `/goal`-driven autonomous run. Read it end-to-end before doing anything.** Delete after the work is shipped — it is not project documentation.

The `/goal` prompt that invokes this file is intentionally short. Treat **every rule below as binding**. If anything here conflicts with what you'd otherwise do — this file wins.

---

## What was already built (Phases 0–3, do NOT redo)

- **Schema**: `flatBonus` and `whenWinded` fields exist on `powerRoll`; `whenWinded` exists on `effect`. Implemented in `dnd/character_sheet/ability-automation/schema.js` and `dnd/character_sheet/ability-automation/runner.js`.
- **Runner**: `isActorWinded(state)` derives winded from `state.context.isWinded()`, `state.hero.currentStamina/maxStamina`, `state.hero.hp/maxHp`, or `state.sourceToken.hp/maxHp`. `applyWhenWindedToBlock(state, block)` shallow-merges the override at dispatch.
- **Persistence**: `normalizeMonsterAbility()` in `dnd/vtt/api/monster_helpers.php` preserves the opaque `automation` field round-trip.
- **Authoring UI**: `dnd/strixhaven/monster-creator/js/monster-automation-ui.js` exists. Each ability row in the monster creator has an "Automate" button (`.monster-automate-btn`) with `data-monster-id` / `data-ability-category` / `data-ability-index` attributes. Click opens the PC paste modal. Save writes to `ability.automation` and marks the monster dirty. The PC pip CSS class `automation-action-btn--configured` is reused.
- **Script loads in monster-creator/index.php** (already wired): `automation.css` → `primitives.js` → `schema.js` → `paste.js` → `inspector.js` → `monster-builder.js` → `monster-automation-ui.js`.

## Phase 0 findings — use these instead of re-discovering

- **Malice tracker** lives in `dnd/vtt/assets/js/ui/board-interactions.js` as closure-scoped state. Storage: `let maliceCount` near line 1615. Mutator: `setMaliceCount(nextValue, { sync })` near line 10978. Display via `updateMaliceDisplay()` + `renderMalicePanel()`. DOM in `dnd/vtt/components/SceneBoard.php:246-275` (`[data-malice]`, `[data-malice-panel]`, `[data-malice-pips]`). **Today it has no external API surface** — Phase 7 must add one (see Phase 7 for the exact shape required).
- **Ally / claim mechanism**: `placement.team` (or `placement.combatTeam`) normalized to `'ally' | 'enemy'` (default `'enemy'`) by `normalizeCombatTeam()` in `dnd/vtt/assets/js/state/normalize/placements.js:336`. Existing visibility check is `canCurrentUserViewMonsterStatBlock()` at `board-interactions.js:18137` — GM passes; otherwise requires team === 'ally'. **It does NOT check claim today.** Per-scene claim map: `sceneEntry.claimedTokens[placementId] = userId`. Phase 8 must extend the check.

## Universal constraints (apply to every phase)

1. **Code isolation.** New work creates NEW files. Edits to existing files must be small and additive — no refactors, no unrelated cleanup, no renames.
2. **Monster ability numbers are static.** No `7+M` formulas in monster JSON. Use literal numbers.
3. **Winded = universal.** Already implemented in the runner. Do not re-implement.
4. **Do not break PC behavior.** Any shared-file edit must only add code paths. Read your own diffs and confirm PC paths are bit-identical.
5. **Triggered / villain abilities fire manually with a confirm modal.** Never auto-fire from game state.
6. **Monster abilities skip features that don't apply.** Heroic resource `spend`, recoveries-based heals, marks — post a chat note and continue; do not throw.
7. **Minion squads (v1):** each minion fires its own ability. No shared-stamina special logic. Treat each as a solo monster.
8. **Summons / spawns:** post a chat reminder telling the GM to place tokens manually. Do not auto-place.
9. **Player visibility:** monsters visible to players if `isGmUser() OR placement.team === 'ally' OR the placement is claimed by the current user`.
10. **One tray at a time.** Selecting a PC token closes the monster tray. Selecting a monster closes the PC tray. Multi-select uses the first token.
11. **Use TaskCreate per phase.** Mark in_progress on START, completed on END. Read TaskList before creating to avoid duplicates.

## Output protocol (binding — the `/goal` evaluator depends on this)

At the **start** of each phase, post exactly:

```
=== PHASE N: <name> STARTING ===
```

At the **end** of each phase, post exactly:

```
=== PHASE N COMPLETE ===
```

…followed by (a) a bullet list of files created or modified with brief notes, (b) 1–2 quoted code snippets representative of the change, and (c) the TaskUpdate call marking the phase complete.

When the entire run is done, post the literal terminal phrase on its own line:

```
=== MONSTER AUTOMATION COMPLETE — ALL PHASES SHIPPED ===
```

…followed by a 6-line summary: (1) phases completed (count + names), (2) total new files (count + paths), (3) total modified files (count + paths), (4) confirm malice spend API exists, (5) confirm ally visibility includes claim, (6) any caveats / known limitations for future work.

## Blocked escape hatch

If you hit a real ambiguity (function the spec assumed doesn't exist, conflicting code state, requirement that would break a universal constraint to satisfy), STOP and post:

```
=== BLOCKED ON: <specific question> ===
```

Do NOT guess.

## Hard "do not" list

- Do not run dev servers, npm/composer installs, or browser tests.
- Do not modify the floating monster stat block (`dnd/vtt/assets/js/ui/monster-stat-block.js`) except in the explicit Phase 6 step that adds a launcher button (and only if it's a clean add).
- Do not touch the PC character summary panel, PC ability tray, or PC character sheet code paths other than the schema/runner additions already shipped in Phase 1.
- Do not change the existing malice panel DOM in `SceneBoard.php`. Phase 7 reads + repositions, does not restructure.
- Do not delete this file.

---

# PHASE 4 — Runner glue (monster context)

**NEW file:** `dnd/vtt/assets/js/ui/monster-ability-runner-glue.js`

Expose two surfaces:

- `window.MonsterAbilityRunner.start(monster, ability, category, placement, options)` — async. Builds the context, dispatches to `AbilityAutomationRunner.open()`, returns when the run finishes or aborts.
- `window.MonsterAbilityRunner.canRun(ability)` — returns true if `ability.automation && Object.keys(ability.automation).length > 0`.

**Context object** passed to `AbilityAutomationRunner.open()` must include:

- `action` → `{ id, name, automation, keywords, description: ability.effect || '', range: ability.range || '', cost: ability.resource_cost || '' }`
- `hero` → `{ name: monster.name, hp: placement.hp, maxHp: placement.maxHp, stamina: placement.hp, maxStamina: placement.maxHp }` (reuse HP as stamina so `isActorWinded` works)
- `automation` → `ability.automation`
- `sourceToken` → `placement`
- `getAttributeBonus(attr)` → returns 0 (monsters use `flatBonus`; this is a safety fallback)
- `getStrongestAttribute()` → returns `{ attribute: 'Flat', bonus: 0 }`
- `getPotencyThreshold(level)` → returns 0 (monster JSON uses static potency targets)
- `isWinded()` → returns `placement.hp <= Math.floor(placement.maxHp / 2)` when both are finite, else `false`
- `postChat(entry)` → delegate to `window.dashboardChat.sendMessage` if available, otherwise no-op
- `selectTarget`, `selectAreaTarget`, `applyDamage`, `applyCondition`, `checkPotency`, `forceMove` → look up `window.VTTBoardCallbacks` (see Phase 9 — it doesn't exist yet; create a stub object exported by board-interactions.js with the callbacks the PC runner uses, and consume it here. If the namespace already exists, use it. If not, post BLOCKED.)

**Malice handling:**

Before invoking the runner, if `category === 'villain_action' || category === 'malice'`:
1. Parse the malice cost from `ability.resource_cost` (e.g., `"3"`, `"3 points"`, `"3 Malice"`). Use a regex like `/(\d+)/` and take the first match. If no number → cost = 0.
2. Read the current malice via `window.MaliceTracker.get()` (created in Phase 7).
3. If `current < cost`, show a confirm dialog: `"Not enough malice (current ${current}, need ${cost}). Spend anyway / Cancel?"`. Cancel → abort.
4. Call `window.MaliceTracker.spend(cost)` (created in Phase 7).
5. Post chat: `"${monster.name} spends ${cost} malice → ${ability.name}"`.

**Confirm-fire for triggered actions:**

If `category === 'triggered_action'`, show a confirm dialog before invoking the runner: `"Fire triggered action '${ability.name}' now?"`. Cancel → abort. Accept → proceed.

**PC-only effect gating** (inside the context callbacks, additive only — do NOT modify the PC runner):

- If the runner ends up trying to spend `'heroic'` or `'recovery'` resources, post a chat note `"Monsters have no ${resource} — skipped"` and resolve as no-op. The cleanest way: have the monster's `spendResource` context callback (if it gets called) return `{ skipped: true, reason: 'monster' }`. If the runner doesn't call out for resource spend, no action needed.

**End of phase:** quote the `start()` function signature and the malice-spend block.

---

# PHASE 5 — Monster ability tray (bottom of screen)

**NEW file:** `dnd/vtt/assets/js/ui/monster-ability-tray.js`

Mirror the structure of `dnd/vtt/assets/js/ui/character-summary-panel.js` ability-tray section (`vtt-character-ability-tray`, lines ~396–536), but as a SIBLING, not a parameterization. Do not edit the PC tray.

- DOM root: `<aside id="vtt-monster-ability-tray" class="vtt-monster-ability-tray vtt-monster-ability-tray--closed">`.
- CSS file: add styles in a NEW file `dnd/vtt/assets/css/monster-ability-tray.css`. Mirror layout of the PC tray (fixed bottom, left offset to clear the side panel). Include via `dnd/vtt/templates/layout.php` (read it to find the right insertion point — surgical edit).
- 6 tabs: `passive`, `maneuver`, `action`, `triggered_action`, `villain_action`, `malice`. Labels: "Passive", "Maneuver", "Action", "Triggered", "Villain", "Malice".
- Each tab opens a popup ability list (same expand-on-click pattern PC tray uses).
- Each ability row shows: name, malice cost (only for villain/malice), and a "▶" launcher button.
- Launcher click → `window.MonsterAbilityRunner.start(monster, ability, category, placement)`.
- Abilities without `automation` show grayed-out with the launcher disabled.
- Triggered/villain rows use the confirm-fire dialog from Phase 4.

**Public API (exposed for Phase 9 to drive):**
- `window.MonsterAbilityTray.openFor(placement, monster)` — opens tray for the given monster.
- `window.MonsterAbilityTray.close()` — hides tray.

**End of phase:** quote the tab-render snippet and the launcher-click handler.

---

# PHASE 6 — Monster character side panel

**NEW files:**
- `dnd/vtt/components/MonsterSummaryPanel.php` — render function returning the panel `<aside>` markup. Mirror `dnd/vtt/components/CharacterSummaryPanel.php`.
- `dnd/vtt/assets/js/ui/monster-summary-panel.js` — open/close logic. Mirror the PC summary panel module from `character-summary-panel.js` (the side-panel section, NOT the tray section).
- `dnd/vtt/assets/css/monster-summary-panel.css` — styles. Reuse PC panel sizing variables where possible.

Panel content (read-only):
- Monster name + image
- HP / max HP
- AC, speed
- Characteristics (might/agility/reason/intuition/presence) if present on `monster.characteristics`
- Traits (if present on `monster.traits`)
- Abilities listed by category — name + effect text only (this is the reference view; clicks happen in the bottom tray)

Panel placement: fixed left, parallel to PC panel. If PC panel CSS uses a `--vtt-character-panel-effective-width` variable, monster panel must NOT collide — use the same slot (only one panel open at a time per Phase 9 router).

**Public API:**
- `window.MonsterSummaryPanel.openFor(placement, monster)` — opens panel.
- `window.MonsterSummaryPanel.close()` — closes.

**Layout wiring:** add the `<?= renderVttMonsterSummaryPanel() ?>` call in `dnd/vtt/templates/layout.php` near the PC panel render, plus the new CSS link and JS script tag. Surgical edits only.

**Do NOT modify** the existing floating stat-block (`monster-stat-block.js`). It stays as the detailed reference window. The side panel is the at-a-glance view.

**End of phase:** quote the open() function and the layout.php injection snippet.

---

# PHASE 7 — Malice tracker reposition + API

Goal: expose a programmatic spend/get API on the malice tracker, and reposition it so it doesn't get covered by the new monster tray.

**Surgical edits to `dnd/vtt/assets/js/ui/board-interactions.js`:**

Near `setMaliceCount` (line ~10978), at module-init time (where other window globals are exposed if any — otherwise inside the same closure near the bottom of the module's IIFE), add:

```js
window.MaliceTracker = {
  get: function () { return maliceCount; },
  spend: function (amount) {
    var n = Math.max(0, Math.trunc(Number(amount) || 0));
    if (n <= 0) return { spent: 0, remaining: maliceCount };
    setMaliceCount(Math.max(0, maliceCount - n));
    return { spent: n, remaining: maliceCount };
  },
  add: function (amount) {
    var n = Math.max(0, Math.trunc(Number(amount) || 0));
    if (n <= 0) return { added: 0, current: maliceCount };
    setMaliceCount(maliceCount + n);
    return { added: n, current: maliceCount };
  }
};
```

(Place inside the closure that owns `maliceCount` — the file has one big IIFE; find a hook point near the end of init/setup where other window assignments live. If there are none, just add it after the `setMaliceCount` definition.)

**CSS reposition:**

In `dnd/vtt/assets/css/board.css` (or wherever `.vtt-board__malice` / `.vtt-malice` is styled — grep first), add a rule that when either ability tray is open (`body.vtt-character-summary-is-open` already exists; add a parallel `body.vtt-monster-ability-tray-is-open`), the malice pip shifts up enough to not overlap. Easiest: add `bottom` offset when either body class is present.

The monster tray module (Phase 5) must toggle `document.body.classList.add('vtt-monster-ability-tray-is-open')` on open and remove on close.

**End of phase:** quote the `MaliceTracker` API block and the CSS reposition rule.

---

# PHASE 8 — Ally visibility (extend the check)

**Surgical edit to `dnd/vtt/assets/js/ui/board-interactions.js`:**

Replace `canCurrentUserViewMonsterStatBlock` body so it ALSO accepts claimed placements. Pseudocode:

```js
function canCurrentUserViewMonsterStatBlock(placement) {
  if (isGmUser()) return true;
  if (!placement?.monster) return false;
  var team = normalizeCombatTeam(placement?.team ?? placement?.combatTeam ?? null);
  if (team === 'ally') return true;
  // NEW: per-user claim grants visibility
  var sceneEntry = getActiveSceneEntry(); // or however the file reads the current scene
  var currentUserId = getCurrentUserId();
  if (sceneEntry?.claimedTokens?.[placement.id] === currentUserId) return true;
  return false;
}
```

You must find the actual `getActiveSceneEntry` / `getCurrentUserId` equivalents — grep for `claimedTokens` and copy whatever pattern other call sites use.

**Apply the same check** before opening the monster tray (Phase 5) and the monster side panel (Phase 6) — both modules must consult `window.canViewMonster?.(placement)`. Add a tiny exported helper in board-interactions.js:

```js
window.canViewMonster = canCurrentUserViewMonsterStatBlock;
```

**Add a "Visible to players" toggle** in the monster token settings menu. Find the existing settings menu render in board-interactions.js (search for `tokenSettingsMenu`). Add a checkbox that toggles `placement.team` between `'ally'` and `'enemy'`. Make the change via the existing placement-update path the file already uses for other token-settings edits — do NOT invent a new persistence path.

**End of phase:** quote the new visibility check and the toggle wiring.

---

# PHASE 9 — Token-select router wiring

**Surgical edit to `dnd/vtt/assets/js/ui/board-interactions.js`:**

Find where token-select currently triggers the PC summary panel (grep for the PC panel's open call). At the same dispatch point, add a branch:

- If `placement.monster` exists AND `window.canViewMonster(placement)`:
  1. Close PC tray / panel if open.
  2. Open `window.MonsterAbilityTray.openFor(placement, placement.monster)`.
  3. Open `window.MonsterSummaryPanel.openFor(placement, placement.monster)`.
- Else if it's a PC token (existing path), keep current behavior. Make sure to also close the monster tray + monster panel.
- Multi-select → use the first selected token to drive the dispatch.

**Also create the `VTTBoardCallbacks` namespace** referenced in Phase 4. Search for how the PC ability automation gets its `selectTarget` / `applyDamage` / etc. callbacks (they're passed in as `options` to `startAbilityAutomation`). Export the same callback set at the bottom of board-interactions.js:

```js
window.VTTBoardCallbacks = {
  selectTarget: selectTarget,
  selectAreaTarget: selectAreaTarget,
  applyDamage: applyDamage,
  applyCondition: applyCondition,
  checkPotency: checkPotency,
  forceMove: forceMove
};
```

(Names may differ — use what board-interactions.js actually defines. If a function is closure-local and not safe to expose, wrap it: `selectTarget: function(...args) { return selectTarget(...args); }`.)

**End of phase:** quote the token-select branch and the VTTBoardCallbacks export.

---

# PHASE 10 — Docs

**Edit `dnd/character_sheet/ability-automation/AUTHORING.md`:**

Append a new top-level section `## Monster abilities` covering:
- Use static damage numbers — no `7+M`.
- Use `flatBonus` on `powerRoll` instead of attribute lookup.
- `whenWinded` works the same as for PCs.
- Heroic resource spends and recoveries-based heals are skipped for monsters with a chat reminder.
- Marks (judgment, bonded) — PCs only.
- Villain/malice abilities auto-deduct from the malice pool when fired.
- Example monster JSON (full automation block for, say, a fire elemental's "Burning Slam").

**Edit `dnd/character_sheet/ability-automation/REGISTRY.md`:**

In the Effect Kinds table, add a "Monster behavior" column (or note inline) for any effect that differs:
- `spend` (heroic) → "monster: skipped with chat note"
- `heal` (recoveries) → "monster: skipped with chat note"
- `applyMark` / `endMark` → "monster: chat note only"

**End of phase:** quote the new AUTHORING.md section header and one row of the REGISTRY.md addition.

---

# Final reminder

After Phase 10's COMPLETE marker, post the terminal phrase + 6-line summary specified in the "Output protocol" section above. The `/goal` loop ends when the evaluator sees that phrase.

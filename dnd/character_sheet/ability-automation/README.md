# Ability Automation

This folder contains the character-sheet ability automation system: paste-in JSON authoring, runtime execution, and inspector for debugging.

Start here before changing automation code. Saved ability data, paste UI, runtime execution, and VTT board effects are kept separate.

For LLM-friendly authoring docs, read [`AUTHORING.md`](AUTHORING.md). For the registry of every supported field, hook, and feature, read [`REGISTRY.md`](REGISTRY.md).

## File Map

- `primitives.js` — Single source of truth for vocabulary: block types, effect kinds, conditions, damage types, durations, forced-movement verbs, target predicates, distance forms. Add new vocabulary here first.
- `schema.js` — Normalizes/validates JSON automation against v3. Lenient — surfaces warnings but never blocks save (per A2 questionnaire answer). Exposes `normalizeAutomation`, `summarizeBlock`, `describeAutomationSteps`, `hasAutomation`.
- `catalog.js` — Shorthand parser (LLM-import only). Not used by the runtime.
- `runner.js` — VTT runtime executor. Walks `automation.cards` top-to-bottom, dispatches effects through context callbacks. Exposes `window.AbilityAutomationRunner.open(options)`.
- `paste.js` — Character-sheet authoring UI: a JSON paste dialog. Replaces the v2 builder. Exposes `window.AbilityAutomation.open(actionId, type, currentAutomation, onSave)` matching the legacy signature so the sheet integration is zero-touch.
- `inspector.js` — Read-only inspector modal for one ability. Shows runtime steps, normalized JSON, raw JSON, warnings. Exposes `window.AbilityAutomationInspector.open({ action })`.
- `automation.css` — Styles for runner, paste, inspector, and the small "configured" pip on character-sheet ability buttons.
- `AUTHORING.md` — Format spec. Paste alongside an ability description into an LLM to get JSON output. Self-contained — should never need a code grep.
- `REGISTRY.md` — Flat reference of every supported value, hook, and feature with implementation status.
- `../../vtt/assets/js/ui/automation-target-prompt.js` - Shared VTT target-picker prompt markup used by the board and smoke fixture.
- `../../vtt/assets/js/ui/automation-trigger-ready.js` - Shared trigger-ready state helpers and blue `!` token indicator renderer used by the board and smoke fixture.
- `../../vtt/assets/js/ui/automation-trigger-lifetime.js` - Shared authored-trigger lifetime helpers for turn, round, and combat boundary expiry.

## Integration points

- `../index.php` — Loads primitives → schema → catalog → paste → inspector → runner for the character sheet (in that order).
- `../../vtt/templates/layout.php` — Loads primitives → schema → catalog → runner for the VTT (paste/inspector aren't needed there).
- `../../vtt/assets/js/ui/character-summary-panel.js` — `startAbilityAutomation()` opens the runner with board hooks.
- `../../vtt/assets/js/ui/board-interactions.js` — Owns `selectTarget`, `selectAreaTarget`, `applyDamage`, `applyCondition`, `checkPotency`, `forceMove` event handlers.

## Saved data shape

```js
action.automation = {
  schema: "ability-automation/v3",
  version: 3,
  warnings: [],   // populated by normalize; surfaced in inspector
  cards: [
    { type: "target",     id, name, mode, predicate, count, optional, distance, ... },
    { type: "powerRoll",  id, attribute, bonus, target, tiers: { tier1, tier2, tier3 } },
    { type: "effect",     id, target, effects: [...] },
    { type: "trigger",    id, condition, effects: [...] },
    { type: "persistent", id, cost, resource, tickAt, expiresAt, effects: [...] },
    { type: "branch",     id, condition, then: [...], else: [...] },
    { type: "choice",     id, name, prompt, options: [...] }
  ]
}
```

`automation.cards` (the field name is retained from v2 for minimal sheet-side churn) is the runtime execution order. Block types are orthogonal — multiple targets, multiple effects, etc. all allowed.

## Runtime flow

For each block in `automation.cards`:

1. `target` — VTT prompts the user to pick token(s) or place a template. Result is stored under `state.groups[block.name]`.
2. `powerRoll` — Open dice modal; user rolls, picks a tier, accepts. The runtime then walks `tier.effects` and dispatches each effect against the resolved target group.
3. `effect` — Walk `block.effects` against the target group (no roll).
4. `trigger` - With structured `match`, registers on the VTT trigger bus. PC trigger actions in the Triggers list auto-register when that character is in the active scene. Trigger cards embedded in main actions/maneuvers run in card order, allowing "hit/select a target, then watch that target" abilities. Optional `expires` metadata unregisters the listener at turn, round, or combat boundaries. Resolving a ready trigger skips the trigger card and runs the follow-up cards with the captured event payload. Without `match`, posts a chat reminder.
5. `persistent` — Register a board-side persistent zone when a prior area target exists; otherwise post a chat reminder.
6. `branch` — Evaluate a condition such as `strained`, `winded`, `keyword`, `prompt`, `mark`, or `scopedFlag`, then run the selected nested card sequence.

7. `choice` - Ask for one option, optionally narrow execution keywords, then run that option's nested cards.

Effects can specify their own `target` to override the parent block target. `target` may be a single group name or an array of group names, allowing one power roll tier to damage multiple targets and apply different riders to each.

Triggered effects can also target dynamic event groups: `eventActor`, `eventSource`, or `eventTarget` (plus `trigger*` aliases). These resolve from the captured event payload for delayed reactions. `trigger.effects` default to `eventActor` unless the trigger block sets `effectTarget`.

Each effect is dispatched by `kind`:

- `damage`, `condition`, `forcedMovement` (push), `potency`, `spend` — full implementation via board hooks.
- `forcedMovement` (pull/slide/vertical) — verb passed through; board may fall back to push behavior. See REGISTRY.md.
- `heal`, `temporaryStamina`, `teleport`, `swap`, `freeStrike`, `resourceGain`, `note` — full implementation via board/sheet hooks.
- `cascade`, `other` — chat reminder; manual application required.

## Authoring flow

1. The user types ability text on the character sheet (name, description, range, cost, tests). The sheet handles all of that.
2. The user clicks **Automate** on the ability.
3. `paste.js` opens a modal with a JSON textarea.
4. The user pastes (or types) JSON. Live lenient validation shows warnings/summary.
5. Click **Save** — the JSON is normalized and written to `action.automation`.
6. The user can click **Inspect** later to read the saved JSON, see the runtime-step preview, and confirm warnings.

## Local test bench

Automation tests live under `__tests__`. The support harness loads the real
`primitives.js`, `schema.js`, and `runner.js` into a small test DOM, then runs
ability JSON through the actual runtime with fake VTT hooks. Use it for
pre-deploy checks of target prompts, roll flow, branch choices, trigger
registration, and effect hook payloads.

Ability-specific scenario tests should use
`__tests__/support/ability-scenario-runner.mjs`. The scenario runner accepts a
combined `{ fields, automation }` object, fake board tokens, mark/judgment state,
scripted trigger events, and expected hook calls. It still runs the real schema
and runner, and it uses the same authored-trigger predicate helper as the board.

Example scenario shape:

```js
await runAbilityScenario({
  ability,
  scenario: {
    caster: 'caster-1',
    tokens: [
      { id: 'caster-1', name: 'Hero', team: 'heroes' },
      { id: 'enemy-1', name: 'Enemy', team: 'monsters' }
    ],
    marks: [
      { type: 'judgment', sourceId: 'caster-1', targetId: 'enemy-1' }
    ],
    event: {
      type: 'damageDealt',
      payload: {
        sourceId: 'caster-1',
        targetId: 'enemy-1',
        placementId: 'enemy-1',
        amount: 5,
        keywords: ['Melee']
      }
    }
  }
});
```

Focused command:

```powershell
node --test dnd/character_sheet/ability-automation/**/*.test.mjs
```

Full JS suite:

```powershell
npm test
```

Browser smoke test:

```powershell
npm run test:automation-smoke
```

The browser smoke fixture verifies the actual target picker HTML, power-roll modal path, damage hook dispatch, and trigger-ready token indicator/payload path in a local headless Chrome or Edge session.

## Important invariants

- Plain JavaScript only. No new dependencies.
- Do not modify `handler.php`.
- Saved automation lives on `action.automation`.
- The character sheet's manual `tests` array is separate — never merge.
- `automation.cards` order is execution order.
- `paste.js` saves through the `onSave` callback only — no direct fetch.
- `runner.js` does not mutate the board directly. All board effects flow through `state.context.*` callbacks.
- VTT board state changes propagate through the existing board state persistence/sync paths.
- When adding a new effect kind, condition, etc.: update `primitives.js`, then `schema.js` normalizer, then `runner.js` dispatcher, then `AUTHORING.md` and `REGISTRY.md`.

## Known gaps (deferred to later phases)

- Persistent zone **persistence across page reloads** + Pusher sync to other clients (Pass 1 is in-memory + GM-only).
- Trigger listeners auto-mark the watcher's blue `!`; they do not mutate a triggering roll that has already been accepted. Roll-changing reactions still need player/GM resolution from the ready trigger.
- Vertical forced movement (Z-axis); horizontal push/pull/slide are fully wired.
- `cascade` effect kind — fires another ability as a free triggered action. Needs stable cross-ability identifiers and a recursive runner entry point. Phase D candidate.
- Recovery-style heals now decrement the target PC's `currentRecoveries` through the VTT sheet save path. Non-PC targets or unresolved sheets still fall back to chat/no-op behavior.
- Marks (judged by, marked by, bonded).
- Teleport's destination picker reuses the slide overlay, which means clicking an occupied cell triggers a slam (technically wrong for teleport). Picking an empty cell behaves correctly.
- Auto-resolution of fired triggers — today the bus marks the watcher's blue `!` overlay and the user clicks to resolve. Intentional: keeps the player in the loop.
- Standalone inspector page listing every ability across every character.

When implementing any of these, update `REGISTRY.md` so authors know.
